/* HYDRA: REAL COMPANION
   Özellik: İnsan gibi hem konuşur hem iş yapar.
   Modlar: YOLDAŞ, İŞÇİ, SAVAŞÇI.
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
    username: 'Hydra_Yoldas', // İsmi daha samimi
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; 
// SADECE 3 MOD VAR
let CURRENT_MODE = "YOLDAŞ"; // Varsayılan: Takip et, sohbet et.

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
    console.log(`[SİSTEM] Hydra uyandı. Mod: ${CURRENT_MODE}`);
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true;
    moves.allowSprinting = true;
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };

    // --- ARKA PLAN FİZİK DÖNGÜSÜ ---
    // Botun "Bedeni" burada çalışır.
    setInterval(() => {
        if (!MASTER) return;

        // 1. MOD: YOLDAŞ (Varsayılan)
        // Patronu takip eder, etrafı izler, güvende tutar.
        if (CURRENT_MODE === "YOLDAŞ") {
            const masterEntity = bot.players[MASTER]?.entity;
            if (masterEntity) {
                const dist = bot.entity.position.distanceTo(masterEntity.position);
                // Çok dibine girme, insan gibi 2-3 blok arkada dur
                if (dist > 4) {
                    bot.pathfinder.setGoal(new goals.GoalFollow(masterEntity, 2), true);
                } else {
                    // Yakındaysa ve duruyorsa, bazen patrona bak
                    bot.lookAt(masterEntity.position.offset(0, masterEntity.height, 0));
                }
            }
        }

        // 2. MOD: SAVAŞÇI
        // Görülen her düşmana saldırır.
        else if (CURRENT_MODE === "SAVAŞÇI") {
            const enemy = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e.username !== MASTER);
            if (enemy) {
                if (bot.entity.position.distanceTo(enemy.position) < 20) {
                    bot.pvp.attack(enemy);
                }
            } else {
                // Düşman yoksa Yoldaş moduna dönme, devriye gez veya bekle
            }
        }

        // 3. MOD: İŞÇİ
        // Bu mod "chat" kısmından tetiklenen "Collect" fonksiyonuyla çalışır.
        // Burada ekstra bir döngüye gerek yok, CollectBlock plugini halleder.

    }, 500); // Yarım saniyede bir kontrol
});

// --- BEYİN (HEM KONUŞAN HEM YAPAN) ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Selam ${MASTER}! Ben hazırım, nereye gidiyoruz?`);
        return;
    }

    if (username !== MASTER) return;

    // Durum Raporu (AI'ya context vermek için)
    const held = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]?.name || "boş";
    const hp = Math.round(bot.health);
    const nearby = bot.findBlocks({ matching: b => b.name !== 'air', maxDistance: 5, count: 3 }).map(p => bot.blockAt(p).name).join(',');

    // --- "İNSAN GİBİ" PROMPT ---
    // Burada AI'dan JSON değil, "Konuşma #JSON#" formatı istiyoruz.
    const prompt = `
    Sen Minecraft oyuncusu Hydra'sın. Patronun: ${MASTER}.
    Kişiliğin: Sadık, biraz esprili, becerikli bir asistan. Robot değilsin!
    
    Şu anki Modun: ${CURRENT_MODE}
    Durumun: Can ${hp}, Elde: ${held}.
    
    Patron dedi ki: "${message}"
    
    GÖREVİN:
    1. Patrona doğal bir cevap ver (Türkçe).
    2. Eğer bir eylem gerekiyorsa, cevabın sonuna GİZLİ KOD ekle.
    
    GİZLİ KODLAR (Sadece bunları kullan):
    #MODE:YOLDAŞ# -> Takip et, gel, koru, durma.
    #MODE:SAVAŞÇI# -> Saldır, kes, savaş.
    #ACTION:MINE:log# -> Odun topla (log yerine taş, demir vs gelebilir).
    #ACTION:DROP# -> Eşyaları at.
    #ACTION:CRAFT:stick# -> Eşya üret.
    
    ÖRNEK 1:
    Patron: "Bana biraz odun topla."
    Sen: "Hemen hallediyorum patron, baltamı bileledim! #ACTION:MINE:log#"
    
    ÖRNEK 2:
    Patron: "Gel buraya."
    Sen: "Geliyorum, arkandayım. #MODE:YOLDAŞ#"
    
    ÖRNEK 3:
    Patron: "Nasılsın?"
    Sen: "Gayet iyiyim, biraz acıktım ama idare ederiz. Sen nasılsın?" (Kod yok)
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7 // Biraz yaratıcılık ekledik ki sohbet etsin
        });

        const reply = completion.choices[0].message.content;
        
        // --- CEVABI AYIKLA ---
        // AI'nın cevabındaki kodu bul ve ayır.
        let chatMsg = reply;
        let actionCode = null;

        if (reply.includes('#')) {
            const parts = reply.split('#');
            chatMsg = parts[0].trim(); // İlk kısım konuşma
            if (parts.length > 1) actionCode = parts[1]; // İkinci kısım kod
        }

        // 1. ÖNCE KONUŞ
        if (chatMsg) bot.chat(chatMsg);

        // 2. SONRA YAP
        if (actionCode) {
            console.log(`[AI EYLEM]: ${actionCode}`);

            if (actionCode.startsWith("MODE:")) {
                const newMode = actionCode.split(":")[1];
                CURRENT_MODE = newMode;
                // Mod değişince eski işleri temizle
                bot.pathfinder.setGoal(null);
                bot.pvp.stop();
            }
            
            else if (actionCode.startsWith("ACTION:MINE:")) {
                CURRENT_MODE = "İŞÇİ"; // İşçi moduna al
                let t = actionCode.split(":")[1];
                
                // Akıllı blok seçimi
                if (t.includes('log')) { 
                    const logs = ['oak_log', 'birch_log', 'spruce_log'];
                    const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                    t = found ? found.name : 'oak_log';
                }
                
                const bType = bot.registry.blocksByName[t];
                if (bType) {
                    const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                    if (targets.length > 0) {
                        bot.collectBlock.collect(targets.map(p => bot.blockAt(p)), () => {
                            bot.chat("İş bitti patron, başka emrin?");
                            CURRENT_MODE = "YOLDAŞ"; // Bitince geri dön
                        });
                    } else bot.chat("Yakında ondan bulamadım.");
                }
            }

            else if (actionCode.startsWith("ACTION:DROP")) {
                const items = bot.inventory.items();
                for (const item of items) await bot.tossStack(item);
            }
            
             else if (actionCode.startsWith("ACTION:CRAFT:")) {
                const item = actionCode.split(":")[1];
                // Crafting logic buraya eklenebilir
                bot.chat(`${item} yapmayı deniyorum...`);
            }
        }

    } catch (e) {
        console.log("Hata:", e.message);
    }
});
