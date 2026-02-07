/* HYDRA: SURVIVALIST (HAYATTA KALMA UZMANI)
   Özellik: "Kaç" emri "Takip Et" emrini ezer. Canavarlardan ters yöne koşar.
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
    username: 'Hydra_Survivor',
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; 
// MODLAR: IDLE (Boş), FOLLOW (Takip), FLEE (Kaçış), PVP (Savaş), MINE (Kazı)
let CURRENT_MODE = "IDLE"; 

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
    console.log(`[SİSTEM] Bot hazır. Şu anki Mod: ${CURRENT_MODE}`);
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true; // Kaçarken parkur yapsın
    moves.allowSprinting = true; // Depar atsın
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };

    // --- FİZİK MOTORU (Saniyede 20 kere çalışır) ---
    bot.on('physicsTick', () => {
        if (!MASTER) return;

        // 1. MOD: KAÇIŞ (En Yüksek Öncelik)
        if (CURRENT_MODE === "FLEE") {
            const enemy = bot.nearestEntity(e => e.type === 'mob');
            if (enemy) {
                // Düşmandan zıt yöne kaçış vektörü hesapla
                const distance = bot.entity.position.distanceTo(enemy.position);
                if (distance < 15) {
                    // Düşmanın olduğu yerin tam tersine git
                    const vector = bot.entity.position.minus(enemy.position);
                    const runPos = bot.entity.position.plus(vector.scaled(2)); // 2 kat uzağa kaç
                    bot.pathfinder.setGoal(new goals.GoalNear(runPos.x, runPos.y, runPos.z, 1));
                }
            } else {
                // Etrafta düşman yoksa biraz uzaklaş ve bekle
                 // (Döngüye girmemesi için burada hedefi silmiyoruz, kaçmaya devam ediyor)
            }
        }

        // 2. MOD: SAVAŞ
        else if (CURRENT_MODE === "PVP") {
            const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER);
            if (enemy) {
                // Saldırı mesafesindeyse vur
                if (bot.entity.position.distanceTo(enemy.position) < 3.5) {
                    bot.lookAt(enemy.position.offset(0, enemy.height, 0));
                    bot.attack(enemy);
                }
                // Uzaksa koş
                bot.pathfinder.setGoal(new goals.GoalFollow(enemy, 1));
            }
        }

        // 3. MOD: TAKİP (En Düşük Öncelik - Sadece güvenliyse)
        else if (CURRENT_MODE === "FOLLOW") {
            const masterEntity = bot.players[MASTER]?.entity;
            if (masterEntity) {
                const dist = bot.entity.position.distanceTo(masterEntity.position);
                if (dist > 3) {
                    bot.pathfinder.setGoal(new goals.GoalFollow(masterEntity, 2));
                } else {
                    bot.pathfinder.setGoal(null); // Yanındaysa dur
                }
            }
        }
    });
});

// JSON Temizleyici
function extractJSON(text) {
    try {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s !== -1 && e !== -1) return text.substring(s, e + 1);
        return null;
    } catch (e) { return null; }
}

// --- BEYİN (AI) ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    // Patron Tanıma
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Patron: ${MASTER}. Komutları dinliyorum.`);
        return;
    }

    if (username !== MASTER) return;

    // AI Karar Veriyor
    const prompt = `
    Sen Minecraft botusun. Şu anki Mod: ${CURRENT_MODE}.
    Komut: "${message}"
    
    GÖREV: Aşağıdaki modlardan birini seç ve JSON döndür.
    
    MODLAR:
    - "FLEE": Kaç, uzaklaş, git, geri çekil. (Zombilerden kaçar).
    - "FOLLOW": Gel, takip et, yanımda dur.
    - "PVP": Saldır, öldür, kes.
    - "MINE": Odun topla, kaz. (target: "log" vb.)
    - "STOP": Dur, bekle.
    
    ÖRNEK: { "mode": "FLEE" }
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0
        });

        const jsonStr = extractJSON(completion.choices[0].message.content);
        if (!jsonStr) return;

        const cmd = JSON.parse(jsonStr);
        console.log(`[KARAR]: ${cmd.mode}`); // Terminalde gör

        // MOD DEĞİŞİMİ
        if (cmd.mode !== CURRENT_MODE) {
            bot.pathfinder.setGoal(null); // Eski hedefleri sil
            bot.pvp.stop();
            try { bot.emit('stopCollecting'); } catch(e){}
            
            CURRENT_MODE = cmd.mode;
            bot.chat(`Mod değişti: ${CURRENT_MODE}`);
        }

        // KAZMA İŞLEMİ (Loop içinde değil, tek seferlik tetiklenir)
        if (cmd.mode === "MINE") {
            let t = cmd.target || "log";
            if (t.includes('log')) { 
                 const logs = ['oak_log', 'birch_log', 'spruce_log'];
                 const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                 t = found ? found.name : 'oak_log';
            }
            const bType = bot.registry.blocksByName[t];
            if (bType) {
                bot.chat(`${t} kazıyorum.`);
                const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                if (targets.length > 0) {
                     bot.collectBlock.collect(targets.map(p => bot.blockAt(p)), err => {
                         bot.chat("Bitti.");
                         CURRENT_MODE = "IDLE"; // Bitince boşa düş
                     });
                }
            }
        }

    } catch (e) {
        console.log("Hata:", e.message);
    }
});
