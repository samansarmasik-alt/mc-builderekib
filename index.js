/* HYDRA: GEMINI FIX 
   Hata Çözümü: Model adı güncellendi ve v1beta hatası giderildi.
*/

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const v = require('vec3');

// --- GEMINI API ENTEGRASYONU (GÜNCEL SÜRÜM) ---
const genAI = new GoogleGenerativeAI("AIzaSyC6kRO68ZEd7PIUsLv2pO5a3tr6mkXZKfA");

// Güvenlik filtrelerini en esnek seviyeye çekiyoruz
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Model ismini 'gemini-1.5-flash-latest' olarak güncelledik (404 hatasını çözer)
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-latest",
    safetySettings 
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
    console.log(`[BİLİNÇ] Hydra Gemini Pro Mimarisiyle Başlatıldı.`);
    bot.chat(`/login ${CONFIG.pass}`);
    
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allowParkour = true;
    bot.pathfinder.setMovements(moves);
});

// Arka plan takip sistemi
setInterval(() => {
    if (CURRENT_MODE === "YOLDAŞ" && MASTER) {
        const target = bot.players[MASTER]?.entity;
        if (target && bot.entity.position.distanceTo(target.position) > 4) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
        }
    }
}, 1000);

// --- GEMINI İLE KONUŞMA VE KARAR ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Selam! Gemini mimarisiyle bağlandım. Seni dinliyorum patron.");
        return;
    }

    if (username !== MASTER) return;

    try {
        const inventory = bot.inventory.items().map(i => i.name).join(', ') || "boş";
        
        const prompt = `
        Sen Minecraft'ta Hydra adında bir asistansın.
        Kullanıcı (${username}) sana şunu dedi: "${message}"
        Senin Durumun: Can ${Math.round(bot.health)}, Envanter: ${inventory}.
        
        TALİMAT:
        1. Samimi bir oyun arkadaşı gibi Türkçe cevap ver.
        2. Gerekirse cevabının sonuna şu komutlardan birini ekle:
           [ACTION:FOLLOW], [ACTION:MINE:item_name], [ACTION:ATTACK], [ACTION:STOP], [ACTION:DROP].
        `;

        const result = await model.generateContent(prompt);
        const aiResponse = result.response.text();
        
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const cleanMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (cleanMsg) bot.chat(cleanMsg);

        if (actionMatch) {
            const action = actionMatch[1];
            if (action === "FOLLOW") {
                CURRENT_MODE = "YOLDAŞ";
            } else if (action === "STOP") {
                CURRENT_MODE = "IDLE";
                bot.pathfinder.setGoal(null);
            } else if (action === "ATTACK") {
                const enemy = bot.nearestEntity(e => e.type === 'mob');
                if (enemy) bot.pvp.attack(enemy);
            } else if (action.startsWith("MINE:")) {
                let target = action.split(":")[1];
                const found = bot.findBlock({ matching: b => b.name.includes(target), maxDistance: 32 });
                if (found) bot.collectBlock.collect(found);
            } else if (action === "DROP") {
                const items = bot.inventory.items();
                for (const item of items) await bot.tossStack(item);
            }
        }

    } catch (e) {
        console.error("Gemini Hatası:", e);
        bot.chat("Zihnimde bir hata oluştu (404/API Error).");
    }
});
