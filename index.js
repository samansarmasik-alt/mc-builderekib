const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const v = require('vec3');

// --- GEMINI API AYARLARI ---
const genAI = new GoogleGenerativeAI("AIzaSyC6kRO68ZEd7PIUsLv2pO5a3tr6mkXZKfA");

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// 404 Hatasını çözmek için tam model yolunu kullanıyoruz
const model = genAI.getGenerativeModel({ 
    model: "models/gemini-1.5-flash", // "models/" eki eklendi
    safetySettings 
});

const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Gemini_Final',
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
    console.log(`[BİLİNÇ] Hydra Gemini Bağlandı. Komut bekliyor...`);
    bot.chat(`/login ${CONFIG.pass}`);
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    bot.pathfinder.setMovements(moves);
});

// Takip sistemi
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
        bot.chat("Bağlantı başarılı! Seni dinliyorum patron.");
        return;
    }
    if (username !== MASTER) return;

    try {
        const inventory = bot.inventory.items().map(i => i.name).join(', ') || "boş";
        const prompt = `Minecraft asistanısın. Kullanıcı: "${message}". Envanter: ${inventory}. [ACTION:FOLLOW/STOP/ATTACK/MINE:item] kodlarını kullanarak samimi cevap ver.`;

        const result = await model.generateContent(prompt);
        const aiResponse = result.response.text();
        
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
        }
    } catch (e) {
        console.error("HATA DETAYI:", e);
        bot.chat("Zihnimde bir hata var patron, terminale bak.");
    }
});
