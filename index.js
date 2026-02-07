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

let MASTER = ""; // "hydraaktif" yazan kişi buraya atanır
const bots = []; // Bot ordusu listesi

// --- BOT FABRİKASI (Sürü Üretimi) ---
function createHydra(botName) {
    console.log(`[SİSTEM] ${botName} hazırlanıyor...`);

    const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: botName,
        version: "1.20.1",
        auth: 'offline'
    });

    // --- TÜM YETENEKLERİ YÜKLE ---
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);     // En iyi aleti seçer
    bot.loadPlugin(autoEat);  // Otomatik yemek yer
    bot.loadPlugin(pvp);      // Savaşır
    bot.loadPlugin(armorManager); // Zırh giyer

    bot.on('spawn', () => {
        console.log(`[${botName}] Sahaya indi ve emir bekliyor!`);
        bot.chat("/login H123456");
        bots.push(bot);

        // Hareket Ayarları (Zıplama, Kazma, Kule Yapma)
        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        moves.canDig = true;
        moves.allow1by1towers = true; 
        moves.allowParkour = true; // Parkur yapsın
        bot.pathfinder.setMovements(moves);

        // Otonom Ayarlar
        bot.armorManager.equipAll(); // En iyi zırhı giy
        bot.autoEat.options = { priority: 'foodPoints', startAt: 16, bannedFood: ['rotten_flesh', 'spider_eye'] };
    });

    // --- GÖZLEM FONKSİYONU ---
    function getVisualContext() {
        // Yakındaki bloklar
        const blocks = bot.findBlocks({ matching: (b) => b.name !== 'air', maxDistance: 8, count: 5 });
        const blockNames = [...new Set(blocks.map(p => bot.blockAt(p).name))].join(', ');

        // Yakındaki varlıklar (Düşman/Dost)
        const entity = bot.nearestEntity();
        const entityName = entity ? (entity.username || entity.name) : "Yok";

        return `Etraf: ${blockNames} | En Yakın: ${entityName}`;
    }

    // --- BEYİN VE EYLEM MERKEZİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. PATRON SEÇİMİ
        if (message.toLowerCase() === "hydraaktif") {
            MASTER = username;
            bot.chat(`Patron sensin ${MASTER}. Tüm sistemler emrine amade.`);
            return;
        }

        // 2. ÇOĞALMA (Sadece Lider Yapar)
        if (message.toLowerCase() === "hydracogal" && username === MASTER) {
            if (bot === bots[0]) {
                const newName = `Hydra_v${Math.floor(Math.random() * 1000)}`;
                bot.chat(`${newName} kodlu destek birimi oluşturuluyor...`);
                createHydra(newName);
            }
            return;
        }

        // SADECE PATRONU DİNLE
        if (username !== MASTER) return;

        // 3. GROQ AI KARAR MEKANİZMASI
        // Botun durumunu hazırla
        const status = {
            hp: Math.round(bot.health),
            food: Math.round(bot.food),
            mode: bot.player.gamemode === 1 ? "Creative" : "Survival",
            inventory: bot.inventory.items().map(i => i.name).join(',') || "Boş"
        };

        const prompt = `
        Sen ${bot.username}. Patronun: ${MASTER}.
        
        Gelen Emir: "${message}"
        
        DURUMUN:
        - Mod: ${status.mode}
        - Can: ${status.hp}, Açlık: ${status.food}
        - Çanta: ${status.inventory}
        - Gördüklerin: ${getVisualContext()}
        
        GÖREV: Emri analiz et ve HANGİ EKLENTİYİ kullanacağına karar ver. JSON döndür.
        
        SEÇENEKLER:
        1. { "action": "pvp", "target": "Zombie" } -> Saldır (mob veya oyuncu adı).
        2. { "action": "mine", "target": "log" } -> Blok kaz/topla (Creative ise /give yap).
        3. { "action": "goto", "target": "${MASTER}" } -> Yanına git (Pathfinder).
        4. { "action": "tpa", "target": "${MASTER}" } -> Işınlanma isteği at.
        5. { "action": "drop", "item": "all" } -> Eşyaları at.
        6. { "action": "chat", "msg": "..." } -> Cevap ver.
        7. { "action": "craft", "item": "stick" } -> Eşya üret.
        
        KURAL: Eğer "odun" denirse ve etrafta "oak_log" varsa target="oak_log" yap. Akıllı ol.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });

            let response = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const decision = JSON.parse(response);
            
            console.log(`[${bot.username}] Karar: ${decision.action}`);

            // --- EYLEM UYGULAMA ---
            
            // A. SAVAŞ (PVP)
            if (decision.action === "pvp") {
                const target = bot.nearestEntity(e => e.name === decision.target || e.mobType === decision.target || e.username === decision.target);
                if (target) {
                    bot.chat("Saldırıyorum! Allah Allah!");
                    bot.pvp.attack(target);
                } else {
                    bot.chat("Düşmanı göremiyorum patron.");
                }
            }
            
            // B. MADEN (COLLECT)
            else if (decision.action === "mine") {
                if (status.mode === "Creative") {
                    bot.chat(`/give @s ${decision.target} 64`);
                    bot.chat("Yaratıcı mod gücüyle aldım.");
                } else {
                    // Akıllı Blok Seçimi
                    let blockName = decision.target;
                    if(blockName === 'log') { 
                        // Etrafta ne varsa onu seç
                        const logs = ['oak_log', 'birch_log', 'spruce_log', 'acacia_log'];
                        const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                        if(found) blockName = found.name;
                        else blockName = 'oak_log'; // Varsayılan
                    }

                    bot.chat(`${blockName} toplamaya gidiyorum.`);
                    const blockType = bot.registry.blocksByName[blockName];
                    if (blockType) {
                        const targets = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                        if (targets.length > 0) {
                            await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                            bot.chat("Topladım.");
                        } else {
                            bot.chat("Yakında bulamadım, keşfe çıkayım mı?");
                        }
                    }
                }
            }

            // C. HAREKET (PATHFINDER)
            else if (decision.action === "goto") {
                const target = bot.players[decision.target]?.entity;
                if (target) {
                    bot.chat("Geliyorum...");
                    bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
                } else {
                    bot.chat("Çok uzaksın, TPA atıyorum.");
                    bot.chat(`/tpa ${decision.target}`);
                }
            }

            // D. EŞYA ATMA
            else if (decision.action === "drop") {
                if (decision.item === "all") {
                    const items = bot.inventory.items();
                    for (const item of items) {
                        await bot.tossStack(item);
                    }
                    bot.chat("Her şeyi attım.");
                }
            }
            
            // E. SOHBET
            else if (decision.action === "chat") {
                bot.chat(decision.msg);
            }

        } catch (e) {
            console.log("Hata:", e.message);
            // Hata olursa chat'e basma, sessizce devam et
        }
    });

    bot.on('kicked', console.log);
    bot.on('error', console.log);
    bot.on('end', () => console.log(`${botName} bağlantısı koptu.`));
}

// İLK BOTU BAŞLAT
createHydra('Hydra_Prime');
