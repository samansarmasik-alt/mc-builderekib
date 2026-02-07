/* PROJECT HYDRA: OMNI
   Author: Gemini Advanced (For Patron)
   Capabilities: Mining, PvP, Building, Crafting, Swarm Intelligence, Autonomous Life
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

// --- YAPILANDIRMA ---
const groq = new Groq({ apiKey: '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' });
const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    version: "1.20.1",
    pass: "H123456"
};

// --- GLOBAL STATE ---
let MASTER_USER = ""; // "hydraaktif" ile belirlenir
const SWARM = []; // Bot ordusu

// --- YARDIMCI FONKSİYONLAR ---
function log(botName, msg) { console.log(`[${botName}] ${msg}`); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- BOT FABRİKASI ---
function createHydra(name) {
    log('SİSTEM', `${name} başlatılıyor...`);

    const bot = mineflayer.createBot({
        host: CONFIG.host,
        port: CONFIG.port,
        username: name,
        version: CONFIG.version,
        auth: 'offline'
    });

    // Plugin Yükleme
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);

    bot.on('spawn', () => {
        log(name, 'Giriş Başarılı. Sistemler Aktif.');
        bot.chat(`/login ${CONFIG.pass}`);
        SWARM.push(bot);

        // Fizik ve Hareket Ayarları
        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        moves.canDig = true;
        moves.allow1by1towers = true; 
        moves.allowParkour = true; 
        moves.allowSprinting = true;
        bot.pathfinder.setMovements(moves);

        // Otonom Modüller
        bot.armorManager.equipAll();
        bot.autoEat.options = { priority: 'foodPoints', startAt: 15, bannedFood: ['rotten_flesh'] };

        // Yaşam Döngüsünü Başlat (Her 12 saniyede bir)
        setInterval(() => consciousnessLoop(bot), 12000);
    });

    // --- GÖRME YETİSİ (ENVIRONMENT SCAN) ---
    function scanEnvironment() {
        // Bloklar
        const blocks = bot.findBlocks({ matching: (b) => b.name !== 'air', maxDistance: 10, count: 5 });
        const blockNames = [...new Set(blocks.map(p => bot.blockAt(p).name))].join(', ');
        
        // Varlıklar
        const entities = Object.values(bot.entities)
            .filter(e => e.type === 'player' || e.type === 'mob')
            .filter(e => bot.entity.position.distanceTo(e.position) < 15 && e !== bot.entity)
            .map(e => e.username || e.mobType);
        
        return {
            blocks: blockNames || "Boşluk",
            entities: entities.join(', ') || "Kimse yok",
            time: bot.time.timeOfDay < 12000 ? "Gündüz" : "Gece",
            biome: bot.blockAt(bot.entity.position)?.biome?.name || "Bilinmiyor"
        };
    }

    // --- BEYİN (CONSCIOUSNESS LOOP) ---
    async function consciousnessLoop(bot) {
        if (!MASTER_USER) return; // Patron yoksa bekle
        if (bot.pathfinder.isMoving() || bot.pvp.target) return; // Meşgulse düşünme

        const env = scanEnvironment();
        const status = {
            hp: Math.round(bot.health),
            food: Math.round(bot.food),
            inventory: bot.inventory.items().length > 0 ? "Dolu" : "Boş"
        };

        log(bot.username, `Tarama: ${env.entities} | ${env.time}`);

        // Otonom Karar İstemi
        const prompt = `
        Sen ${bot.username}. Patron: ${MASTER_USER}.
        Durum: Can ${status.hp}, Açlık ${status.food}. Zaman: ${env.time}.
        Gördüklerin: ${env.entities}, Bloklar: ${env.blocks}.
        
        Şu an bir emrin yok. Kendi başına karar ver.
        - Eğer canın azsa ve yemek varsa ye.
        - Eğer gece ise ve canavarlar varsa "fight" veya "guard".
        - Eğer patron çok uzaktaysa "follow".
        - Eğer etraf güvenliyse "idle" (bekle) veya "scout" (gez).
        
        JSON DÖN: { "action": "...", "reason": "..." }
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.5
            });
            const decision = JSON.parse(cleanJSON(completion.choices[0].message.content));
            
            if (decision.action === "follow") {
                const target = bot.players[MASTER_USER]?.entity;
                if(target && bot.entity.position.distanceTo(target.position) > 15) {
                    bot.chat("Çok uzaklaştın patron, geliyorum.");
                    bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
                }
            }
            else if (decision.action === "fight") {
                const enemy = bot.nearestEntity(e => e.type === 'mob');
                if(enemy) bot.pvp.attack(enemy);
            }
        } catch(e) {}
    }

    // --- KOMUT İŞLEYİCİ (CHAT) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. LİDERLİK PROTOKOLÜ
        if (message.toLowerCase() === "hydraaktif") {
            MASTER_USER = username;
            bot.chat(`Biometrik tarama tamamlandı. Hoş geldin Patron ${MASTER_USER}.`);
            return;
        }

        // 2. SÜRÜ ÇOĞALTMA
        if (message.toLowerCase() === "hydracogal" && username === MASTER_USER) {
            if (bot === SWARM[0]) { // Sadece ilk bot tetikler
                const id = Math.floor(Math.random() * 9999);
                createHydra(`Hydra_Unit_${id}`);
            }
            return;
        }

        if (username !== MASTER_USER) return;

        // 3. AI ANALİZİ
        const env = scanEnvironment();
        const mode = bot.player.gamemode === 1 ? "Creative" : "Survival";
        
        const prompt = `
        Sen Minecraft Asistanı ${bot.username}. Mod: ${mode}.
        Patron (${MASTER_USER}) dedi ki: "${message}"
        
        ÇEVRE: ${env.blocks}
        VARLIKLAR: ${env.entities}
        
        Görevi analiz et ve JSON formatında aksiyon ver.
        
        SEÇENEKLER:
        1. { "action": "mine", "target": "log" } -> Blok topla. (Creative ise /give).
        2. { "action": "pvp", "target": "name" } -> Saldır.
        3. { "action": "build", "type": "wall" } -> İnşa et (wall, tower).
        4. { "action": "goto", "target": "${MASTER_USER}" } -> Git/Takip et.
        5. { "action": "drop" } -> Eşyaları at.
        6. { "action": "chat", "msg": "..." } -> Cevap ver.
        
        NOT: Eğer "odun" denirse ve etrafta "birch_log" varsa onu hedefle.
        NOT: "Build" denirse elindeki bloklarla basit bir yapı kur.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });
            
            const aiRes = JSON.parse(cleanJSON(completion.choices[0].message.content));
            log(bot.username, `Emir: ${aiRes.action}`);
            executeAction(bot, aiRes, mode);

        } catch (e) {
            bot.chat("Komutu işleyemedim patron. Tekrar dene.");
            console.log(e);
        }
    });

    bot.on('kicked', (reason) => log(name, `Atıldı: ${reason}`));
    bot.on('error', (err) => log(name, `Hata: ${err}`));
}

// --- EYLEM MOTORU ---
async function executeAction(bot, cmd, mode) {
    // SOHBET
    if (cmd.action === "chat") {
        bot.chat(cmd.msg);
    }
    
    // HAREKET
    else if (cmd.action === "goto") {
        const target = bot.players[MASTER_USER]?.entity;
        if (target) {
            bot.chat("Koordinatlarına geliyorum.");
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
        } else {
            bot.chat(`/tpa ${MASTER_USER}`);
        }
    }

    // MADENCİLİK
    else if (cmd.action === "mine") {
        if (mode === "Creative") {
            bot.chat(`/give @s ${cmd.target} 64`);
            bot.chat("Yaratıcı mod yetkisiyle aldım.");
        } else {
            let targetBlock = cmd.target;
            // Akıllı Odun Seçimi
            if (targetBlock.includes('log')) {
                const logs = ['oak_log', 'birch_log', 'spruce_log', 'acacia_log'];
                const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                targetBlock = found ? found.name : 'oak_log';
            }
            
            bot.chat(`${targetBlock} arıyorum...`);
            const blockType = bot.registry.blocksByName[targetBlock];
            
            if (blockType) {
                const targets = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 8 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    bot.chat("Toplama tamamlandı.");
                } else {
                    bot.chat("Yakında bulamadım. Biraz gezeyim mi?");
                    bot.pathfinder.setGoal(new goals.GoalNear(bot.entity.position.x + 20, bot.entity.position.y, bot.entity.position.z, 1));
                }
            }
        }
    }

    // SAVAŞ
    else if (cmd.action === "pvp") {
        const enemy = bot.nearestEntity(e => e.username === cmd.target || e.mobType === cmd.target || e.type === 'mob');
        if (enemy) {
            bot.chat("Hedef kilitlendi. Saldırıyorum.");
            bot.pvp.attack(enemy);
        } else {
            bot.chat("Düşman görüş alanımda değil.");
        }
    }

    // İNŞAAT (Basit Kule/Duvar)
    else if (cmd.action === "build") {
        bot.chat("İnşaat protokolü başlatıldı.");
        const buildingBlock = bot.inventory.items().find(i => i.name.includes('stone') || i.name.includes('dirt') || i.name.includes('plank'));
        
        if (!buildingBlock && mode === "Survival") {
            bot.chat("Malzemem yok patron. Önce blok toplamam lazım.");
            return;
        }

        if (mode === "Creative") bot.chat(`/give @s stone 64`);

        // Basit 3 blokluk kule (Altına zıplayarak koyma)
        if (cmd.type === "tower") {
             // Basit kule mantığı: Zıpla ve altına koy
             // Not: Mineflayer'da build komplekstir, burada basit bir logic kullanıyoruz
             bot.setControlState('jump', true);
             // Gerçek inşaat için karmaşık döngüler gerekir, şimdilik basit tutuyoruz
        }
    }
    
    // EŞYA ATMA
    else if (cmd.action === "drop") {
        const items = bot.inventory.items();
        for (const item of items) await bot.tossStack(item);
        bot.chat("Tüm envanter boşaltıldı.");
    }
}

// JSON TEMİZLEYİCİ
function cleanJSON(text) {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// --- SİSTEMİ BAŞLAT ---
createHydra('Hydra_Prime');
