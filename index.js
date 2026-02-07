/* HYDRA: STABLE CORE (ÇELİK ÇEKİRDEK)
   Özellikler: Çökme Koruması, Hibrit Komutlar, Crafting, Redstone
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

let MASTER = ""; // "hydraaktif" yazan patron
let GUARD_TARGET = null; // Korunacak kişi

// Hata olursa botu kapatma, sadece logla
process.on('uncaughtException', (err) => console.log('KRİTİK HATA ÖNLENDİ:', err));

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: 'Hydra_Stabil',
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
    console.log('Bot oyuna girdi.');
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    bot.pathfinder.setMovements(moves);

    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };

    // KORUMA DÖNGÜSÜ (Basit ve Sağlam)
    setInterval(() => {
        if (!GUARD_TARGET) return;
        
        const master = bot.players[GUARD_TARGET]?.entity;
        if (!master) return;

        // 1. Takip Et
        const distance = bot.entity.position.distanceTo(master.position);
        if (distance > 5) {
            bot.pathfinder.setGoal(new goals.GoalFollow(master, 2), true);
        }

        // 2. Saldır (Patrona çok yakın olan düşmana)
        const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== GUARD_TARGET && bot.entity.position.distanceTo(e.position) < 8);
        if (enemy) {
            // Eğer düşman patrona 5 bloktan yakınsa saldır
            if (enemy.position.distanceTo(master.position) < 5) {
                bot.pvp.attack(enemy);
            }
        }
    }, 1000);
});

// --- JSON AYIKLAYICI ---
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

    // 1. PATRON TANIMLAMA (Her şeyden önce)
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Sistem aktif. Patron: ${MASTER}`);
        return;
    }

    if (username !== MASTER) return; // Başkasını dinleme

    const msg = message.toLowerCase();

    // 2. ACİL DURUM KOMUTLARI (AI Beklemeden Yapılır)
    // Bunlar "hard-coded" olduğu için %100 çalışır.
    
    if (msg.includes("gel") || msg.includes("takip")) {
        GUARD_TARGET = MASTER;
        bot.chat("Koruma modu: AKTİF. Peşindeyim.");
        return;
    }
    
    if (msg.includes("dur") || msg.includes("bekle")) {
        GUARD_TARGET = null;
        bot.pathfinder.setGoal(null);
        bot.chat("Durdum.");
        return;
    }

    if (msg.includes("saldır") || msg.includes("kes")) {
        const target = bot.nearestEntity(e => e.type === 'mob' || e.type === 'player');
        if (target) {
            bot.chat("Saldırıyorum!");
            bot.pvp.attack(target);
        } else bot.chat("Yakında düşman yok.");
        return;
    }

    if (msg.includes("at") || msg.includes("ver") || msg.includes("boşalt")) {
        const items = bot.inventory.items();
        for (const item of items) await bot.tossStack(item);
        bot.chat("Envanteri boşalttım.");
        return;
    }

    // 3. KARMAŞIK İŞLER (AI DEVREYE GİRER)
    // Crafting, Redstone, Maden vb.

    bot.chat("Analiz ediyorum..."); // Düşündüğünü belli et

    const prompt = `
    Sen Minecraft botu Hydra. Patron: ${MASTER}.
    Komut: "${message}"
    
    GÖREV: Sadece JSON döndür.
    
    SEÇENEKLER:
    1. { "action": "craft", "item": "iron_sword" } (Kılıç, kazma vb.)
    2. { "action": "mine", "target": "log" } (Odun, taş, demir vb.)
    3. { "action": "place", "block": "redstone_wire" } (Blok koyma)
    4. { "action": "chat", "msg": "..." } (Sohbet)
    
    NOT: "odun" denirse target="oak_log" yap. "kızıltaş" denirse block="redstone_wire" yap.
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0 // Sıfır yaratıcılık = Tam itaat
        });

        const raw = completion.choices[0].message.content;
        const jsonStr = extractJSON(raw);
        
        if (!jsonStr) {
            bot.chat("Emri tam anlayamadım ama deniyorum.");
            return;
        }

        const cmd = JSON.parse(jsonStr);

        if (cmd.action === "chat") bot.chat(cmd.msg);

        else if (cmd.action === "mine") {
            let t = cmd.target;
            if (t.includes('log')) {
                const logs = ['oak_log', 'birch_log', 'spruce_log'];
                const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                t = found ? found.name : 'oak_log';
            }
            bot.chat(`${t} kazmaya gidiyorum.`);
            const bType = bot.registry.blocksByName[t];
            if (bType) {
                const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    bot.chat("İşlem tamam.");
                } else bot.chat("Yakında bulamadım.");
            }
        }

        else if (cmd.action === "craft") {
            bot.chat(`${cmd.item} yapmayı deniyorum...`);
            const mcData = require('minecraft-data')(bot.version);
            const item = mcData.itemsByName[cmd.item];
            const recipe = bot.recipesFor(item.id, null, 1, null)[0];
            
            if (recipe) {
                try {
                    await bot.craft(recipe, 1, null);
                    bot.chat("Ürettim!");
                } catch (e) {
                    bot.chat("Malzemem eksik veya masa lazım.");
                }
            } else {
                bot.chat("Tarifi bilmiyorum veya malzemem yok.");
            }
        }

        else if (cmd.action === "place") {
            const blockName = cmd.block;
            const item = bot.inventory.items().find(i => i.name === blockName);
            if (item) {
                await bot.equip(item, 'hand');
                const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0));
                if (ref) {
                    try {
                        await bot.placeBlock(ref, new v(0, 1, 0));
                        bot.chat("Koydum.");
                    } catch(e) { bot.chat("Buraya koyamadım."); }
                }
            } else {
                bot.chat(`Çantamda ${blockName} yok.`);
            }
        }

    } catch (e) {
        console.log("AI Hatası:", e.message);
        bot.chat("Bir hata oldu ama çalışmaya devam ediyorum.");
    }
});
