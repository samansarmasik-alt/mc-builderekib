const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- SENİN GROQ API ANAHTARIN ---
const groq = new Groq({ apiKey: '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' });

const bot = mineflayer.createBot({
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Groq_OMNI',
    version: "1.20.1",
    auth: 'offline'
});

// Pluginleri Yükle
bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

let MASTER = "";
let CURRENT_MODE = "YOLDAŞ"; // YOLDAŞ, SAVAŞÇI, İŞÇİ

bot.on('spawn', () => {
    console.log(`[BEYİN] Hydra Groq Mimarisiyle Başlatıldı. 404 Hataları Geride Kaldı.`);
    bot.chat("/login H123456"); // Şifreni otomatik yazar
    
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allowParkour = true;
    moves.allowSprinting = true;
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
});

// Otomatik Takip Sistemi (Sadece Yoldaş Modunda)
setInterval(() => {
    if (CURRENT_MODE === "YOLDAŞ" && MASTER) {
        const target = bot.players[MASTER]?.entity;
        if (target && bot.entity.position.distanceTo(target.position) > 4) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
        }
    }
}, 1000);

// --- ASİSTAN BEYNİ (GROQ) ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Selam ${MASTER}! Groq beyniyle bağlandım. Artık her şeyi yapabilirim, ne istersin?`);
        return;
    }

    if (username !== MASTER) return;

    const inventory = bot.inventory.items().map(i => i.name).join(', ') || "boş";

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: `Sen Minecraft'ta Hydra adında samimi bir asistansın. Robot gibi konuşma. 
                Cevabının sonuna mutlaka şu formatta komut ekle: [ACTION:FOLLOW], [ACTION:MINE:item], [ACTION:ATTACK], [ACTION:STOP], [ACTION:DROP].` },
                { role: 'user', content: `Patron: ${message} | Envanterin: ${inventory}` }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7
        });

        const aiResponse = completion.choices[0].message.content;
        
        // Komutu ayır
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const cleanMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (cleanMsg) bot.chat(cleanMsg);

        if (actionMatch) {
            const action = actionMatch[1];
            console.log(`[EYLEM]: ${action}`);

            if (action === "FOLLOW") {
                CURRENT_MODE = "YOLDAŞ";
            } else if (action === "STOP") {
                CURRENT_MODE = "IDLE";
                bot.pathfinder.setGoal(null);
                bot.pvp.stop();
            } else if (action === "ATTACK") {
                CURRENT_MODE = "SAVAŞÇI";
                const enemy = bot.nearestEntity(e => e.type === 'mob');
                if (enemy) bot.pvp.attack(enemy);
            } else if (action.startsWith("MINE:")) {
                CURRENT_MODE = "İŞÇİ";
                let target = action.split(":")[1];
                const found = bot.findBlock({ matching: b => b.name.includes(target), maxDistance: 32 });
                if (found) {
                    bot.chat(`${target} topluyorum!`);
                    bot.collectBlock.collect(found, () => {
                        bot.chat("Topladım patron.");
                        CURRENT_MODE = "YOLDAŞ";
                    });
                } else bot.chat("Yakında bulamadım.");
            } else if (action === "DROP") {
                const items = bot.inventory.items();
                for (const item of items) await bot.tossStack(item);
            }
        }
    } catch (e) {
        console.error("Hata:", e.message);
        bot.chat("Bağlantıda bir sorun oldu patron.");
    }
});
