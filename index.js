/* HYDRA: GEMINI PRO EDITION 
   Beyin: Google Gemini (AIzaSy... API)
   Yetenek: Üst düzey sohbet, tam otonom eylem, gerçek asistan ruhu.
*/

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Gemini Kütüphanesi
const v = require('vec3');

// --- GEMINI API ENTEGRASYONU ---
const genAI = new GoogleGenerativeAI("AIzaSyC6kRO68ZEd7PIUsLv2pO5a3tr6mkXZKfA");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // En hızlı ve stabil model

const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Gemini',
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
    console.log(`[BİLİNÇ] Gemini Pro bağlandı. Hydra artık daha zeki.`);
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
        bot.chat("Selam! Gemini mimarisiyle güncellendim. Artık seni çok daha iyi anlıyorum. Ne yapalım?");
        return;
    }

    if (username !== MASTER) return;

    const inventory = bot.inventory.items().map(i => i.name).join(', ') || "boş";

    // Gemini'ye gönderilen "Kişilik ve Görev" talimatı
    const prompt = `
    Sen Minecraft'ta Hydra adında, Gemini yapay zekasıyla güçlendirilmiş bir asistansın.
    Kullanıcı (${username}) sana şunu dedi: "${message}"
    
    Senin Durumun: Canın ${Math.round(bot.health)}, Envanterin: ${inventory}.
    
    TALİMATLAR:
    1. Bir robot gibi değil, gerçek bir oyun arkadaşı gibi samimi cevap ver.
    2. Cevabının sonuna mutlaka şu gizli komutlardan birini ekle: 
       [ACTION:FOLLOW], [ACTION:MINE:item_name], [ACTION:ATTACK], [ACTION:STOP], [ACTION:DROP].
    3. Eğer sadece sohbet ediyorsa komut ekleme, sadece konuş.
    
    Örnek: "Hemen yanına geliyorum dostum! [ACTION:FOLLOW]"
    `;

    try {
        const result = await model.generateContent(prompt);
        const aiResponse = result.response.text();
        
        // Komutu ve mesajı ayır
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const cleanMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        // 1. Gemini'nin cevabını chat'e yaz
        if (cleanMsg) bot.chat(cleanMsg);

        // 2. Eylemi gerçekleştir
        if (actionMatch) {
            const action = actionMatch[1];
            console.log(`[GEMINI KARAR]: ${action}`);

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
                bot.chat(`${target} aramaya başlıyorum...`);
                // Maden kazma mantığı (öncekiyle aynı)
                const found = bot.findBlock({ matching: b => b.name.includes(target), maxDistance: 32 });
                if (found) bot.collectBlock.collect(found);
            } else if (action === "DROP") {
                const items = bot.inventory.items();
                for (const item of items) await bot.tossStack(item);
            }
        }

    } catch (e) {
        console.error("Gemini Hatası:", e);
        bot.chat("Zihnimde bir parazit var (API Hatası).");
    }
});
