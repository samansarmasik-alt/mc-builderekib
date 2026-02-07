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
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HOST = 'play4.eternalzero.cloud';
const PORT = 26608;

// GLOBAL DEĞİŞKENLER
let MASTER_NAME = ""; // "hydraaktif" yazan kişi buraya atanacak
const activeBots = []; // Tüm botların listesi

// --- BOT OLUŞTURUCU (FABRİKA) ---
function createHydra(botName) {
    console.log(`[SİSTEM] ${botName} hazırlanıyor...`);
    
    const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: botName,
        version: "1.20.1",
        auth: 'offline'
    });

    // EKLENTİLERİ YÜKLE
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);

    bot.on('spawn', () => {
        console.log(`[${botName}] Sahaya indi!`);
        activeBots.push(bot);
        bot.chat("/login H123456");
        
        // Hareket ayarlarını yap
        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        moves.canDig = true;
        moves.allow1by1towers = true; 
        bot.pathfinder.setMovements(moves);
        
        // Otonom Hazırlık
        bot.armorManager.equipAll();
        bot.autoEat.options = { priority: 'foodPoints', startAt: 15, bannedFood: [] };
    });

    // --- ANA ZEKA DÖNGÜSÜ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. PATRONU TANIMA (EN ÖNEMLİ KISIM)
        if (message.toLowerCase() === "hydraaktif") {
            MASTER_NAME = username; // Yazan kişiyi patron yap
            bot.chat(`Emredersin patron! Hedef: ${MASTER_NAME}`);
            console.log(`[${botName}] Yeni Patron: ${MASTER_NAME}`);
            return;
        }

        // 2. SADECE PATRONU DİNLE
        if (MASTER_NAME === "" || username !== MASTER_NAME) return;

        // 3. ÇOĞALMA KOMUTU
        if (message.toLowerCase() === "hydracogal") {
            // Sadece Lider cevap versin, hepsi aynı anda doğurmasın
            if (bot.username === "Hydra_Lider" || bot === activeBots[0]) {
                const newName = `Hydra_${Math.floor(Math.random() * 900) + 100}`;
                bot.chat(`${newName} kodlu destek birimi çağırılıyor!`);
                createHydra(newName);
            }
            return;
        }

        // 4. HIZLI KOMUTLAR (AI Beklemeden Yapılacaklar)
        const msg = message.toLowerCase();
        if (msg.includes("gel") || msg.includes("takip")) {
            const target = bot.players[MASTER_NAME]?.entity;
            if (target) {
                bot.chat("Geliyorum!");
                bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            } else {
                bot.chat("/tpa " + MASTER_NAME);
            }
            return; // AI'ya sorma, yap geç.
        }
        
        if (msg.includes("dur") || msg.includes("bekle")) {
            bot.pathfinder.setGoal(null);
            bot.chat("Durdum.");
            return;
        }

        // 5. KARMAŞIK İŞLER (AI DEVREYE GİRER)
        // "Odun topla", "Saldır", "Kaz", "Eşya ver" gibi işler
        
        // Gecikme ekle ki hepsi aynı anda konuşmasın
        await new Promise(r => setTimeout(r, Math.random() * 2000));

        const status = {
            bot: bot.username,
            inventory: bot.inventory.items().map(i => i.name).join(',') || "boş",
            gamemode: bot.player.gamemode === 1 ? "Creative" : "Survival"
        };

        const prompt = `
        Sen ${bot.username}. Patronun: ${MASTER_NAME}.
        Komut: "${message}"
        
        GÖREV:
        Eğer komut genel ise ("biriniz odun toplasın") ve sen boşsan üstlen.
        Eğer direkt sana ise ("${bot.username} kaz") yap.
        
        CEVAP FORMATI (JSON):
        1. { "action": "collect", "target": "log" } (Creative ise /give yapar, survival ise kazar)
        2. { "action": "fight", "target": "Zombie" } (Veya oyuncu adı)
        3. { "action": "craft", "item": "stick" }
        4. { "action": "chat", "msg": "..." }
        5. { "action": "ignore" } (Eğer komut bana değilse)

        DURUM: Mod: ${status.gamemode}, Çanta: ${status.inventory}
        Survival modunda ve aletin yoksa önce alet yapmayı (craft) düşün.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2
            });

            let response = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const decision = JSON.parse(response);

            if (decision.action === "ignore") return;

            console.log(`[${bot.username}] Karar: ${decision.action}`);

            // EYLEMLERİ UYGULA
            if (decision.action === "chat") {
                bot.chat(decision.msg);
            }
            else if (decision.action === "collect") {
                if (status.gamemode === "Creative") {
                    bot.chat(`/give @s ${decision.target} 64`);
                } else {
                    // Survival Toplama
                    bot.chat(`${decision.target} topluyorum.`);
                    const blockType = bot.registry.blocksByName[decision.target] || bot.registry.blocksByName['oak_log'];
                    if (blockType) {
                        const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                        if (blocks.length > 0) {
                            await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                            bot.chat("İşlem tamam.");
                        } else {
                            bot.chat("Yakında bulamadım.");
                        }
                    }
                }
            }
            else if (decision.action === "fight") {
                const entity = bot.nearestEntity(e => e.name === decision.target || e.mobType === decision.target);
                if (entity) {
                    bot.pvp.attack(entity);
                    bot.chat("Saldırıyorum!");
                } else {
                    bot.chat("Düşmanı göremiyorum.");
                }
            }

        } catch (e) {
            // Hata olursa (JSON bozuksa) sessiz kal, oyun akışını bozma
        }
    });

    bot.on('kicked', (reason) => console.log(`${botName} atıldı: ${reason}`));
    bot.on('error', (err) => console.log(`${botName} hata: ${err}`));
}

// İLK LİDERİ BAŞLAT
createHydra('Hydra_Lider');
