/* HYDRA: ULTIMATE SURVIVAL AI
   Author: Gemini (For Patron)
   Features: Crafting, Guarding, Automation, Redstone, True AI
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

// --- AYARLAR ---
const groq = new Groq({ apiKey: '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' });
const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; // "hydraaktif" yazan kişi
let GUARD_MODE = false; // Koruma modu açık mı?

function log(msg) { console.log(`[Hydra] ${msg}`); }

// --- BOT BAŞLATMA ---
const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: 'Hydra_Prime',
    version: CONFIG.version,
    auth: 'offline'
});

// Plugin Yükleme
bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

bot.on('spawn', () => {
    log('Sunucuya girildi. Sistemler hazır.');
    bot.chat(`/login ${CONFIG.pass}`);

    // Fizik Ayarları
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true;
    bot.pathfinder.setMovements(moves);

    // Otomatik İşlemler
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };

    // KORUMA DÖNGÜSÜ (Guard Loop)
    setInterval(() => {
        if (GUARD_MODE && MASTER) {
            const masterEntity = bot.players[MASTER]?.entity;
            if (!masterEntity) return;

            // Patronu takip et (Çok uzaklaşma)
            if (bot.entity.position.distanceTo(masterEntity.position) > 5) {
                bot.pathfinder.setGoal(new goals.GoalFollow(masterEntity, 2), true);
            }

            // Tehdit algıla
            const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER && bot.entity.position.distanceTo(e.position) < 10);
            if (enemy) {
                // Eğer düşman patrona veya bota çok yakınsa saldır
                if (enemy.position.distanceTo(masterEntity.position) < 8 || enemy.position.distanceTo(bot.entity.position) < 5) {
                    bot.pvp.attack(enemy);
                }
            }
        }
    }, 1000);
});

// --- YARDIMCI: CRAFTING (ÜRETİM) ---
async function craftItem(itemName, count = 1) {
    const mcData = require('minecraft-data')(bot.version);
    const item = mcData.itemsByName[itemName];
    
    if (!item) {
        bot.chat(`${itemName} diye bir eşya yok.`);
        return;
    }

    const recipe = bot.recipesFor(item.id, null, 1, null)[0];
    if (!recipe) {
        bot.chat(`Bunu üretmek için malzemem eksik veya çalışma masası lazım: ${itemName}`);
        return;
    }

    bot.chat(`${itemName} üretiyorum...`);
    try {
        const craftingTable = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id });
        if (recipe.requiresTable && !craftingTable) {
            bot.chat("Bunun için çalışma masası (Crafting Table) lazım. Önce onu yapmalıyım.");
            // Burada recursive (iç içe) craft eklenebilir ama şimdilik uyarı versin
            return;
        }
        await bot.craft(recipe, count, craftingTable);
        bot.chat(`İşte ${itemName} hazır!`);
    } catch (err) {
        bot.chat("Üretim hatası: " + err.message);
    }
}

// --- YARDIMCI: JSON TEMİZLEME ---
function extractJSON(text) {
    try {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s !== -1 && e !== -1) return text.substring(s, e + 1);
        return text;
    } catch (e) { return text; }
}

// --- ANA BEYİN (CHAT) ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    // 1. PATRON TANIMA
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Koruma protokolü aktif. Emret Patron ${MASTER}.`);
        return;
    }

    if (username !== MASTER) return;

    // 2. AI ANALİZİ
    const mcData = require('minecraft-data')(bot.version);
    const nearbyBlocks = bot.findBlocks({ matching: b => b.name !== 'air', maxDistance: 5, count: 5 }).map(p => bot.blockAt(p).name).join(',');
    const inventory = bot.inventory.items().map(i => i.name).join(',');

    const prompt = `
    Sen Minecraft botu Hydra. Patron: ${MASTER}.
    Komut: "${message}"
    
    ENVANTER: ${inventory}
    ETRAF: ${nearbyBlocks}
    
    GÖREV: Komutu anla ve JSON formatında işlem yap.
    
    SEÇENEKLER:
    1. { "action": "guard", "state": true } -> "Beni koru", "Takip et" derse. (state: false ile kapatılır).
    2. { "action": "craft", "item": "iron_sword" } -> "Kılıç yap", "Kazma üret" derse. (İngilizce item adı kullan).
    3. { "action": "mine", "target": "log" } -> "Odun topla", "Taş kaz".
    4. { "action": "place", "block": "redstone_wire" } -> "Kızıltaş koy", "Otomasyon yap".
    5. { "action": "chat", "msg": "..." } -> Sohbet.
    6. { "action": "drop" } -> Eşyaları at.
    
    ÖNEMLİ: Kılıç yap denirse ve envanterde kılıç yoksa craft action ver.
    ÖNEMLİ: ASLA kullanıcının mesajını tekrar etme.
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1
        });

        const raw = completion.choices[0].message.content;
        const cmd = JSON.parse(extractJSON(raw));
        
        console.log(`[AI KARAR]: ${cmd.action}`);

        // --- EYLEMLER ---
        
        if (cmd.action === "chat") {
            bot.chat(cmd.msg);
        }
        
        else if (cmd.action === "guard") {
            GUARD_MODE = cmd.state;
            if (GUARD_MODE) bot.chat("Seni gölgem gibi takip edeceğim ve koruyacağım patron.");
            else {
                bot.chat("Koruma modu kapalı. Burada bekliyorum.");
                bot.pathfinder.setGoal(null);
            }
        }
        
        else if (cmd.action === "craft") {
            // Crafting fonksiyonunu çağır
            await craftItem(cmd.item);
        }
        
        else if (cmd.action === "mine") {
            let t = cmd.target;
            // Odun türünü genelleştir
            if (t.includes('log')) {
                const logs = ['oak_log', 'birch_log', 'spruce_log'];
                const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                t = found ? found.name : 'oak_log';
            }
            bot.chat(`${t} toplamaya gidiyorum.`);
            const blockType = bot.registry.blocksByName[t];
            if (blockType) {
                const targets = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    bot.chat("Topladım.");
                } else bot.chat("Yakında yok.");
            }
        }
        
        else if (cmd.action === "place") {
            // Basit blok koyma (Redstone veya blok)
            const blockName = cmd.block;
            const item = bot.inventory.items().find(i => i.name === blockName);
            if (!item) {
                bot.chat(`Çantamda ${blockName} yok patron.`);
                return;
            }
            await bot.equip(item, 'hand');
            const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0)); // Altındaki blok
            if (refBlock) {
                // Önüne koymaya çalış
                // Bu kısım karmaşıktır, basitçe altına veya yanına koymayı dener
                try {
                     // Yüzünü dön ve koy
                     await bot.placeBlock(refBlock, new v(0, 1, 0));
                     bot.chat("Koydum.");
                } catch (e) { bot.chat("Buraya koyamıyorum."); }
            }
        }

        else if (cmd.action === "drop") {
            const items = bot.inventory.items();
            for (const item of items) await bot.tossStack(item);
            bot.chat("Buyur patron, hepsi senin.");
        }

    } catch (e) {
        console.log("Hata:", e.message);
    }
});

bot.on('error', console.log);
bot.on('end', () => console.log('Bot düştü.'));
