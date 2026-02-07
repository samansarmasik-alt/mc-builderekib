/* HYDRA: DEBUG & STABLE MODE
   Amaç: Çökme sorununu çözmek ve AI yanıtlarını görmek.
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

let MASTER = ""; // Patron
let AI_BUSY = false; // AI meşgul mü?

// ÇÖKME ÖNLEYİCİ
process.on('uncaughtException', (err) => {
    console.log('--- KRİTİK HATA YAKALANDI ---');
    console.log(err);
    console.log('-----------------------------');
});

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: 'Hydra_Fix',
    version: CONFIG.version,
    auth: 'offline'
});

// Eklentiler
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
});

// JSON TEMİZLEYİCİ
function extractJSON(text) {
    try {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s !== -1 && e !== -1) return text.substring(s, e + 1);
        return null;
    } catch (e) { return null; }
}

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    // 1. PATRON OLMA
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Patron tanımlandı: ${MASTER}`);
        return;
    }

    if (username !== MASTER) return;
    const msg = message.toLowerCase();

    // 2. MANUEL KOMUTLAR (AI OLMADAN ÇALIŞIR - TEST İÇİN)
    // Botun yürüyebildiğini test etmek için:
    if (msg === "gel") {
        const target = bot.players[MASTER]?.entity;
        if (target) {
            bot.chat("Manuel mod: Geliyorum.");
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
        } else bot.chat("Seni göremiyorum.");
        return;
    }

    if (msg === "dur") {
        bot.pathfinder.setGoal(null);
        bot.chat("Manuel mod: Durdum.");
        return;
    }

    if (msg === "zıpla") {
        bot.setControlState('jump', true);
        bot.setControlState('jump', false);
        return;
    }

    // 3. AI KOMUTLARI (RISKLI KISIM)
    if (AI_BUSY) return; // Arka arkaya emir verme
    AI_BUSY = true;
    bot.chat("AI Analizi başladı...");

    const prompt = `
    Sen Minecraft botu Hydra. Patron: "${MASTER}". Komut: "${message}"
    
    GÖREV: Aşağıdaki JSON formatlarından birini seç ve döndür. BAŞKA HİÇBİR ŞEY YAZMA.
    
    1. { "act": "mine", "target": "log" }  (Odun, taş, demir kazmak için)
    2. { "act": "pvp", "target": "Zombie" } (Saldırmak için)
    3. { "act": "chat", "msg": "..." } (Sohbet için)
    
    Örnek Cevap: { "act": "mine", "target": "stone" }
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0
        });

        const raw = completion.choices[0].message.content;
        console.log(`[AI HAM CEVAP]: ${raw}`); // TERMİNALE BAK! BURADA NE YAZIYOR?

        const jsonStr = extractJSON(raw);
        if (!jsonStr) {
            bot.chat("AI cevabı bozuk, terminale bak.");
            console.log("JSON AYIKLANAMADI!");
            AI_BUSY = false;
            return;
        }

        const cmd = JSON.parse(jsonStr);
        console.log(`[İŞLEM]: ${cmd.act}`);

        if (cmd.act === "chat") bot.chat(cmd.msg);
        
        else if (cmd.act === "mine") {
            let t = cmd.target;
            if (t.includes('log')) { // Ağaç genel ismi
                 // Etrafta ne varsa onu bul
                 const logs = ['oak_log', 'birch_log', 'spruce_log'];
                 const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                 t = found ? found.name : 'oak_log';
            }
            
            bot.chat(`${t} arıyorum...`);
            const bType = bot.registry.blocksByName[t];
            if (bType) {
                const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    bot.chat("Topladım.");
                } else bot.chat("Yakında yok.");
            } else bot.chat("Böyle bir blok yok.");
        }
        
        else if (cmd.act === "pvp") {
            const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER);
            if (enemy) {
                bot.chat("Saldırıyorum!");
                bot.pvp.attack(enemy);
            } else bot.chat("Düşman yok.");
        }

    } catch (e) {
        console.log("AI HATASI:", e);
        bot.chat("Beyin hatası.");
    }
    
    AI_BUSY = false;
});
