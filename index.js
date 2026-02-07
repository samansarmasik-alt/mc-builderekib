/* HYDRA: AUTONOMOUS ASSISTANT
   Zeka: Groq Llama-3 (Tam yetki)
   Kişilik: Dinamik, asistan ruhlu, oyuncu.
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
    username: 'Hydra_Asistan',
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; 
let CURRENT_MODE = "YOLDAŞ";

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: 'offline'
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

bot.on('spawn', () => {
    console.log(`[BİLİNÇ] Hydra uyandı. Karakter yükleniyor...`);
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true;
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
});

// Arka planda patronu takip etme (Sadece Yoldaş modundaysa)
setInterval(() => {
    if (CURRENT_MODE === "YOLDAŞ" && MASTER) {
        const target = bot.players[MASTER]?.entity;
        if (target && bot.entity.position.distanceTo(target.position) > 4) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
        }
    }
}, 1000);

// --- ASİSTAN BEYNİ ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Sistemlerimi senin için optimize ettim patron. Ben Hydra, senin kişisel asistanın. Ne yapıyoruz bugün?");
        return;
    }

    if (username !== MASTER) return;

    // Botun o anki tüm verilerini AI'ya gönderiyoruz
    const status = {
        hp: Math.round(bot.health),
        food: Math.round(bot.food),
        inv: bot.inventory.items().map(i => i.name).join(', '),
        pos: bot.entity.position.floored().toString()
    };

    const prompt = `
    Sen Minecraft'ta yaşayan bir yapay zeka asistanısın. Adın Hydra.
    Robot gibi konuşma! Bir arkadaş, bir yardımcı, bir insan gibi davran.
    
    PATRON DURUMU: ${username} sana şunu dedi: "${message}"
    SENİN DURUMUN: Canın ${status.hp}, Envanterin: ${status.inv || "boş"}.
    
    KURAL: 
    1. Önce patrona tamamen KENDİ CÜMLELERİNLE cevap ver (Türkçe).
    2. Eğer bir iş yapman gerekiyorsa, cevabının sonuna mutlaka şu formatta bir komut ekle: [ACTION:KOMUT]
    
    KOMUTLAR:
    - [ACTION:FOLLOW] (Yanıma gel, takip et, koru)
    - [ACTION:MINE:blok_adi] (Odun kes, taş kaz vb. Blok adını ingilizce yaz: log, stone, iron_ore)
    - [ACTION:ATTACK] (Saldır, zombileri kes)
    - [ACTION:STOP] (Dur, bekle)
    - [ACTION:DROP] (Eşyaları yere at)
    
    Örnek: "Tabii ki patron, hemen odun toplamaya başlıyorum! [ACTION:MINE:log]"
    Örnek: "Nasılsın? Ben harikayım, elmas bulmak için sabırsızlanıyorum." (Eylem yoksa komut ekleme)
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8 // Yaratıcılığı artırdık ki farklı cevaplar versin
        });

        const aiResponse = completion.choices[0].message.content;
        
        // Eylem kodunu ayıkla
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const finalMsg = aiResponse.replace(/\[ACTION:(.+?)\]/, "").trim();

        // 1. AI KENDİ CÜMLESİNİ SÖYLER
        if (finalMsg) bot.chat(finalMsg);

        // 2. AI EYLEME GEÇER
        if (actionMatch) {
            const fullAction = actionMatch[1];
            console.log(`[KARAR]: ${fullAction}`);

            if (fullAction === "FOLLOW") {
                CURRENT_MODE = "YOLDAŞ";
            } else if (fullAction === "STOP") {
                CURRENT_MODE = "IDLE";
                bot.pathfinder.setGoal(null);
            } else if (fullAction === "ATTACK") {
                const enemy = bot.nearestEntity(e => e.type === 'mob');
                if (enemy) bot.pvp.attack(enemy);
            } else if (fullAction.startsWith("MINE:")) {
                let target = fullAction.split(":")[1];
                if (target === "log") {
                    const found = bot.findBlock({ matching: b => b.name.includes('log'), maxDistance: 32 });
                    target = found ? found.name : 'oak_log';
                }
                const bType = bot.registry.blocksByName[target];
                if (bType) {
                    const blocks = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                    bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                }
            } else if (fullAction === "DROP") {
                const items = bot.inventory.items();
                for (const item of items) await bot.tossStack(item);
            }
        }

    } catch (e) {
        console.log("Hata:", e.message);
    }
});
