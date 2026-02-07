/* HYDRA: PURE AI PUPPET (SAF AI KUKLASI)
   Mantık: Kod karar vermez. Sadece Groq'un emrini uygular.
   Filtre yok, hazırlık yok, yorum yok.
*/

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- API ---
const groq = new Groq({ apiKey: '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' });

const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_AI_Saf',
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; 

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: 'offline'
});

// Pluginler
bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

bot.on('spawn', () => {
    console.log('Bot bağlandı.');
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true;
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };
});

// JSON Ayıklayıcı
function extractJSON(text) {
    try {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s !== -1 && e !== -1) return text.substring(s, e + 1);
        return null;
    } catch (e) { return null; }
}

// --- ANA KOMUT SİSTEMİ ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    // 1. Patron Tanıma (Zorunlu)
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Bağlantı kuruldu. Beyin: Groq AI. Patron: ${MASTER}`);
        return;
    }

    if (username !== MASTER) return;

    // Botun mevcut durumu (AI'ya iletmek için)
    const heldItem = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]?.name || "yok";
    const status = `Elimde: ${heldItem}, Can: ${Math.round(bot.health)}`;

    // --- 2. AI İLE İLETİŞİM (Filtresiz) ---
    // Burada AI'ya çok net seçenekler sunuyoruz.
    const prompt = `
    Sen Minecraft botu Hydra'sın. Kullanıcı (Patron): "${message}"
    Bot Durumu: ${status}
    
    GÖREV: Kullanıcının niyetini anla ve aşağıdaki JSON formatlarından BİRİNİ seç.
    KENDİN YORUM KATMA. Kullanıcı "Gel" derse SADECE "FOLLOW" ver. "Odun al" derse "MINE" ver.
    
    SEÇENEKLER:
    1. { "action": "FOLLOW", "target": "master" } -> Takip et, yanına gel, beni koru.
    2. { "action": "STOP" } -> Dur, bekle, iptal et.
    3. { "action": "MINE", "target": "log" } -> Kaz, topla. (target ingilizce blok adı).
    4. { "action": "ATTACK", "target": "Zombie" } -> Saldır, öldür.
    5. { "action": "CRAFT", "item": "stick" } -> Üret.
    6. { "action": "PLACE", "block": "redstone_wire" } -> Bloğu yere koy.
    7. { "action": "CHAT", "msg": "..." } -> Sadece konuş.
    
    Eğer kullanıcı "beni takip et" derse KESİNLİKLE "FOLLOW" seçmelisin.
    SADECE JSON DÖNDÜR.
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0 // Yaratıcılık 0 = Robotik İtaat
        });

        const raw = completion.choices[0].message.content;
        const jsonStr = extractJSON(raw);
        
        if (!jsonStr) {
            bot.chat("AI Cevabı bozuk geldi.");
            console.log("AI Raw:", raw);
            return;
        }

        const cmd = JSON.parse(jsonStr);
        
        // ŞEFFAFLIK: Bot ne yapacağına karar verdiğini söylüyor
        bot.chat(`[AI Kararı]: ${cmd.action} -> ${cmd.target || "..."}`);
        console.log(`[AI]: ${cmd.action}`);

        // --- 3. EYLEM UYGULAMA (KOD KISMI) ---
        
        // Önceki tüm hedefleri temizle (Çakışmayı önlemek için)
        if (cmd.action !== "CHAT") {
            bot.pathfinder.setGoal(null);
            bot.pvp.stop();
            try { bot.emit('stopCollecting'); } catch(e){}
        }

        switch (cmd.action) {
            case "FOLLOW":
                const player = bot.players[MASTER]?.entity;
                if (player) {
                    bot.chat("Peşindeyim.");
                    // dynamic: true -> Sürekli takip et
                    bot.pathfinder.setGoal(new goals.GoalFollow(player, 1.5), true);
                } else {
                    bot.chat("Seni göremiyorum.");
                }
                break;

            case "STOP":
                bot.chat("Tüm işlemler durduruldu.");
                break;

            case "MINE":
                let t = cmd.target;
                if (t.includes('log')) { 
                    const logs = ['oak_log', 'birch_log', 'spruce_log'];
                    const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                    t = found ? found.name : 'oak_log';
                }
                const bType = bot.registry.blocksByName[t];
                if (bType) {
                    bot.chat(`${t} için koordinat alıyorum...`);
                    const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                    if (targets.length > 0) {
                        await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    } else bot.chat("Yakında yok.");
                } else bot.chat("Blok tipini bilmiyorum.");
                break;

            case "ATTACK":
                const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER);
                if (enemy) {
                    bot.chat("Hedefe kilitlendim.");
                    bot.pvp.attack(enemy);
                } else bot.chat("Düşman yok.");
                break;
                
            case "CRAFT":
                bot.chat(`${cmd.item} üretiyorum...`);
                const mcData = require('minecraft-data')(bot.version);
                const item = mcData.itemsByName[cmd.item];
                const recipe = bot.recipesFor(item.id, null, 1, null)[0];
                if (recipe) await bot.craft(recipe, 1, null);
                else bot.chat("Tarif veya malzeme yok.");
                break;

            case "PLACE":
                const bItem = bot.inventory.items().find(i => i.name === cmd.block);
                if (bItem) {
                    await bot.equip(bItem, 'hand');
                    const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0));
                    if(ref) await bot.placeBlock(ref, new v(0, 1, 0));
                } else bot.chat("Elimde o bloktan yok.");
                break;

            case "CHAT":
                bot.chat(cmd.msg);
                break;
        }

    } catch (e) {
        console.log("Hata:", e.message);
        bot.chat("Bir hata oldu.");
    }
});
