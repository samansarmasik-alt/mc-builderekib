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
const BOSS_NAME = "Hasan"; // Senin adın
const BOT_NAME = "Hydra_Human";

// Bot Hafızası (Kısa süreli)
let memory = [];

function startBot() {
    console.log(`[SİSTEM] ${BOT_NAME} bilinci yükleniyor...`);
    
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: BOT_NAME,
        version: "1.20.1",
        auth: 'offline',
        checkTimeoutInterval: 120000
    });

    // --- YETENEK YÜKLEME ---
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);

    bot.on('spawn', () => {
        console.log(`[GÖZLER AÇILDI] Dünyaya giriş yapıldı.`);
        bot.chat("/login H123456");
        
        const mcData = require('minecraft-data')(bot.version);
        const movements = new Movements(bot, mcData);
        movements.canDig = true;
        movements.allow1by1towers = true;
        bot.pathfinder.setMovements(movements);
        
        // Zırh ve Yemek Otomasyonu
        bot.armorManager.equipAll();
        bot.autoEat.options = { priority: 'foodPoints', startAt: 15, bannedFood: ['rotten_flesh'] };

        // --- BİLİNÇ DÖNGÜSÜ BAŞLAT (Her 15 saniyede bir düşünür) ---
        setInterval(aiConsciousnessLoop, 15000);
    });

    // --- 1. GÖRME YETİSİ (Scanning) ---
    function scanSurroundings() {
        // En yakındaki varlıklar (Mobs, Players)
        const entities = Object.values(bot.entities)
            .filter(e => e.position.distanceTo(bot.entity.position) < 15 && e !== bot.entity)
            .map(e => e.username || e.name || e.mobType) // İsimleri al
            .slice(0, 5); // En yakın 5 tanesi

        // En yakındaki bloklar (Rastgele örnekleme)
        const nearbyBlocks = bot.findBlocks({
            matching: (block) => block.name !== 'air' && block.name !== 'grass_block' && block.name !== 'dirt',
            maxDistance: 10,
            count: 10
        }).map(p => bot.blockAt(p).name);
        
        // Benzersiz blok listesi
        const uniqueBlocks = [...new Set(nearbyBlocks)];

        return {
            entities: entities.length > 0 ? entities.join(", ") : "Kimse yok",
            blocks: uniqueBlocks.length > 0 ? uniqueBlocks.join(", ") : "Sadece toprak/hava",
            biome: bot.blockAt(bot.entity.position)?.biome?.name || "Bilinmiyor",
            time: bot.time.timeOfDay < 12000 ? "Gündüz" : "Gece"
        };
    }

    // --- 2. BİLİNÇ DÖNGÜSÜ (Beyin) ---
    async function aiConsciousnessLoop() {
        if (bot.pathfinder.isMoving()) return; // Hareket ederken düşünme, işini yap.

        const vision = scanSurroundings();
        const status = {
            health: Math.round(bot.health),
            food: Math.round(bot.food),
            inventory: bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', ') || "Boş",
            equipment: "Sword/Armor" // Basitleştirildi
        };

        // Hafızayı taze tut (Son 3 olay)
        const recentMemory = memory.slice(-3).join(" -> ");

        const prompt = `
        Sen Minecraft'ta yaşayan "Hydra" isimli bilinçli bir yapay zekasın. 
        Patronun: ${BOSS_NAME}.
        
        GÖRDÜKLERİN (Vision):
        - Varlıklar: ${vision.entities}
        - Bloklar: ${vision.blocks}
        - Zaman: ${vision.time}
        
        DURUMUN (Status):
        - Can: ${status.health}/20, Açlık: ${status.food}/20
        - Çanta: ${status.inventory}
        - Hafıza: ${recentMemory}

        NE YAPACAKSIN? (Bir İnsan Gibi Düşün)
        Duruma göre bir karar ver. JSON formatında cevapla.

        SEÇENEKLER:
        1. { "action": "chat", "msg": "..." } -> Sohbet et, yorum yap, selam ver.
        2. { "action": "mine", "target": "block_name" } -> Gördüğün veya bildiğin bir bloğu kaz (Örn: iron_ore, log, stone).
        3. { "action": "explore" } -> Rastgele bir yere git, etrafı gez.
        4. { "action": "fight", "target": "mob_name" } -> Yakında düşman varsa saldır.
        5. { "action": "follow", "target": "${BOSS_NAME}" } -> Patronu gördüysen takip et.
        6. { "action": "build", "type": "tower" } -> Blokların varsa rastgele kule yap.
        
        KURALLAR:
        - Eğer canın azsa veya gece ise ve sığınak yoksa, güvende kalmaya çalış.
        - Eğer çantanda odun yoksa ve ağaç (log) görüyorsan, odun topla.
        - Eğer çantanda yiyecek yoksa ve hayvan görüyorsan, avlan.
        - Patron yakındaysa ona selam ver veya takip et.
        - Sadece JSON döndür.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.6 // Yaratıcılığı artırdık
            });

            let response = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const decision = JSON.parse(response);
            
            console.log(`[BİLİNÇ] Karar: ${decision.action} -> ${decision.target || ''}`);
            executeDecision(decision);

        } catch (e) {
            console.log("Düşünme Hatası:", e.message);
        }
    }

    // --- 3. EYLEM MERKEZİ (Eller ve Ayaklar) ---
    async function executeDecision(decision) {
        // Hafızaya ekle
        memory.push(`${decision.action} yapıldı.`);

        if (decision.action === "chat") {
            bot.chat(decision.msg);
        }
        else if (decision.action === "mine") {
            // "log" derse etrafta hangi odun varsa onu bulur
            let targetName = decision.target;
            if (targetName.includes("log")) {
                const logs = ["oak_log", "birch_log", "spruce_log", "acacia_log", "jungle_log", "dark_oak_log"];
                // Görüş alanındaki odunu seç
                const visibleBlock = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 15 });
                if (visibleBlock) targetName = visibleBlock.name;
                else targetName = "oak_log"; // Varsayılan
            }

            bot.chat(`${targetName} toplamaya gidiyorum.`);
            const blockType = bot.registry.blocksByName[targetName];
            if (blockType) {
                const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: 3 });
                if (blocks.length > 0) {
                    await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                    bot.chat("Topladım!");
                } else {
                    bot.chat("Etrafta bulamadım, keşfe çıkıyorum.");
                    explore();
                }
            }
        }
        else if (decision.action === "explore") {
            explore();
        }
        else if (decision.action === "fight") {
            const entity = bot.nearestEntity(e => e.name === decision.target || e.mobType === decision.target);
            if (entity) {
                bot.pvp.attack(entity);
                bot.chat("Saldırıyorum!");
            }
        }
        else if (decision.action === "follow") {
            const player = bot.players[BOSS_NAME]?.entity;
            if (player) {
                bot.pathfinder.setGoal(new goals.GoalFollow(player, 2), true);
                bot.chat("Peşindeyim patron.");
            }
        }
        else if (decision.action === "build") {
            // Basit kule yapma (altına zıplayıp blok koyma)
            if (bot.inventory.items().length > 0) {
                bot.chat("Sanat eseri yapıyorum...");
                const blockToPlace = bot.inventory.items().find(i => i.name.includes("dirt") || i.name.includes("stone") || i.name.includes("plank"));
                if (blockToPlace) {
                    await bot.equip(blockToPlace, 'hand');
                    // Olduğu yere zıplayıp koyar
                    const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
                    if(refBlock) await bot.placeBlock(refBlock, new v(0, 1, 0));
                }
            }
        }
    }

    // Rastgele Gezme Fonksiyonu
    function explore() {
        const x = bot.entity.position.x + (Math.random() * 40 - 20);
        const z = bot.entity.position.z + (Math.random() * 40 - 20);
        bot.pathfinder.setGoal(new goals.GoalNear(x, bot.entity.position.y, z, 1));
    }

    // --- PATRONLA KONUŞMA (Öncelikli) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (username.toLowerCase().includes(BOSS_NAME.toLowerCase())) {
            // Patron konuşursa bilinç döngüsünü bekleme, hemen cevap ver
            memory.push(`Patron dedi ki: ${message}`);
            // Buraya direkt Groq çağrısı ekleyebilirsin, 
            // ama bilinç döngüsü bir sonraki turda bunu hafızadan okuyup cevap verecektir zaten.
            // Hız istiyorsan buraya da ekleme yapabiliriz.
        }
    });

    bot.on('death', () => {
        bot.chat("Hayat zor... Eşyalarım gitti.");
        memory = []; // Hafıza sıfırlanır
    });
    
    bot.on('end', () => setTimeout(startBot, 10000));
    bot.on('error', console.log);
}

startBot();
