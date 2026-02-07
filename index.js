const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- API VE KONFİGÜRASYON ---
const groq = new Groq({ apiKey: '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' });

const bot = mineflayer.createBot({
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Omni_AI',
    version: "1.20.1",
    auth: 'offline'
});

// Pluginleri Yükle
bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

let MASTER = "";
let CURRENT_TASK = "IDLE";

bot.on('spawn', () => {
    console.log(`[BEYİN] Hydra Omni-AI Devrede. Limitler kaldırıldı.`);
    bot.chat("/login H123456");
    
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allowParkour = true;
    moves.allowSprinting = true;
    moves.allow1by1towers = true; // Kazarken yukarı çıkabilir
    bot.pathfinder.setMovements(moves);
    
    // Otomatik Ayarlar
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 14 };
});

// --- YARDIMCI FONKSİYONLAR ---

async function smartCraft(itemName, amount = 1) {
    const mcData = require('minecraft-data')(bot.version);
    const item = mcData.itemsByName[itemName];
    if (!item) return bot.chat("Bu eşyayı tanımıyorum patron.");

    const recipe = bot.recipesFor(item.id, null, 1, null)[0];
    if (!recipe) return bot.chat(`Bunu yapmak için malzemem eksik: ${itemName}`);

    try {
        const table = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 4 });
        await bot.craft(recipe, amount, table);
        bot.chat(`${itemName} üretimini tamamladım!`);
    } catch (err) {
        bot.chat("Üretim sırasında bir hata oldu.");
    }
}

// --- ANA AI DÖNGÜSÜ ---

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Sistemler %100 kapasiteyle çalışıyor. Emrindeyim patron.");
        return;
    }

    if (username !== MASTER) return;

    const inventory = bot.inventory.items().map(i => `${i.name}(${i.count})`).join(', ') || "boş";
    const pos = bot.entity.position.floored().toString();

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: `Sen Minecraft'ta Hydra adında, her şeyi yapabilen bir asistansın.
                Robot gibi değil, profesyonel bir oyuncu gibi davran. 
                Sana gelen mesajlara göre şu aksiyonlardan birini mutlaka seç:
                - [ACTION:FOLLOW] (Takip et)
                - [ACTION:MINE:item_name:count] (Kazı yap)
                - [ACTION:CRAFT:item_name:amount] (Üretim yap)
                - [ACTION:ATTACK] (Düşmanı temizle)
                - [ACTION:DROP] (Eşyaları patrona ver)
                - [ACTION:STOP] (Hepsini durdur)
                - [ACTION:GOTO:x:y:z] (Koordinata git)
                Sadece tek bir aksiyon kodu kullan ve başına doğal bir cümle ekle.` },
                { role: 'user', content: `Patron: "${message}" | Konum: ${pos} | Envanter: ${inventory}` }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.6
        });

        const aiResponse = completion.choices[0].message.content;
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const chatMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (chatMsg) bot.chat(chatMsg);

        if (actionMatch) {
            const parts = actionMatch[1].split(':');
            const action = parts[0];

            // Her yeni komutta eski işi temizle
            bot.pathfinder.setGoal(null);
            bot.pvp.stop();

            switch (action) {
                case "FOLLOW":
                    const player = bot.players[MASTER]?.entity;
                    if (player) bot.pathfinder.setGoal(new goals.GoalFollow(player, 2), true);
                    break;

                case "STOP":
                    bot.chat("Tüm görevler iptal edildi.");
                    break;

                case "ATTACK":
                    const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER);
                    if (enemy) bot.pvp.attack(enemy);
                    break;

                case "MINE":
                    let blockName = parts[1];
                    let count = parseInt(parts[2]) || 1;
                    const bType = bot.registry.blocksByName[blockName] || bot.registry.blocksByName['oak_log'];
                    const blocks = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: count });
                    if (blocks.length > 0) {
                        await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                        bot.chat(`${blockName} toplama işi bitti.`);
                    } else bot.chat("Yakında bulamadım.");
                    break;

                case "CRAFT":
                    await smartCraft(parts[1], parseInt(parts[2]) || 1);
                    break;

                case "DROP":
                    for (const item of bot.inventory.items()) {
                        await bot.tossStack(item);
                        await new Promise(r => setTimeout(r, 200));
                    }
                    bot.chat("Al bakalım patron, hepsi senin.");
                    break;

                case "GOTO":
                    bot.pathfinder.setGoal(new goals.GoalBlock(parts[1], parts[2], parts[3]));
                    break;
            }
        }
    } catch (e) {
        console.error(e);
        bot.chat("Bağlantı hatası patron, tekrar söyler misin?");
    }
});
