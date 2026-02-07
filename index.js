const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const v = require('vec3');

// --- GEMINI API AYARLARI (HATA ÖNLEYİCİ) ---
const genAI = new GoogleGenerativeAI("AIzaSyC6kRO68ZEd7PIUsLv2pO5a3tr6mkXZKfA");

// Güvenlik filtrelerini Kapatıyoruz (Botun rahat konuşması için)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    safetySettings // Filtreleri buraya ekledik
});

const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Gemini_Pro',
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
    console.log(`[BİLİNÇ] Gemini Pro Hata Ayıklama Modunda Aktif.`);
    bot.chat(`/login ${CONFIG.pass}`);
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    bot.pathfinder.setMovements(moves);
});

// Takip Sistemi
setInterval(() => {
    if (CURRENT_MODE === "YOLDAŞ" && MASTER) {
        const target = bot.players[MASTER]?.entity;
        if (target && bot.entity.position.distanceTo(target.position) > 4) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
        }
    }
}, 1000);

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Bağlantı tazeledim patron. Seni dinliyorum.");
        return;
    }
    if (username !== MASTER) return;

    const inventory = bot.inventory.items().map(i => i.name).join(', ') || "boş";

    const prompt = `
    Sen Minecraft'ta Hydra adında bir asistansın.
    Kullanıcı (${username}): "${message}"
    Envanterin: ${inventory}
    
    Önemli: Cevabının sonunda mutlaka [ACTION:EMİR] formatını kullan.
    Emirler: FOLLOW, STOP, ATTACK, MINE:item, DROP.
    Eğer sadece sohbetse bir şey ekleme. Samimi ve doğal ol.
    `;

    try {
        // generateContent asenkron yapısını daha sağlam kurduk
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();
        
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const cleanMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (cleanMsg) bot.chat(cleanMsg);

        if (actionMatch) {
            const action = actionMatch[1];
            if (action === "FOLLOW") CURRENT_MODE = "YOLDAŞ";
            else if (action === "STOP") { CURRENT_MODE = "IDLE"; bot.pathfinder.setGoal(null); }
            else if (action === "ATTACK") {
                const enemy = bot.nearestEntity(e => e.type === 'mob');
                if (enemy) bot.pvp.attack(enemy);
            }
            else if (action.startsWith("MINE:")) {
                let target = action.split(":")[1];
                const found = bot.findBlock({ matching: b => b.name.includes(target), maxDistance: 32 });
                if (found) bot.collectBlock.collect(found);
            }
            else if (action === "DROP") {
                for (const item of bot.inventory.items()) await bot.tossStack(item);
            }
        }
    } catch (e) {
        console.error("KRİTİK API HATASI:", e);
        // Hata türüne göre chat'e bilgi ver
        if (e.message.includes("API key")) bot.chat("API Anahtarı geçersiz patron.");
        else if (e.message.includes("SAFETY")) bot.chat("Bu cümleyi söylemem yasaklanmış (Güvenlik hatası).");
        else bot.chat("Bağlantı hatası aldım, tekrar dene.");
    }
});
