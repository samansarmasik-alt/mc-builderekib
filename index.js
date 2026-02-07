/* PROJECT HYDRA: OMNI (STABLE JSON FIX)
   Author: Gemini Advanced (For Patron)
   Fix: Advanced JSON Extraction & Debugging
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

let MASTER_USER = ""; 
const SWARM = []; 

function log(botName, msg) { console.log(`[${botName}] ${msg}`); }

// --- JSON TEMİZLEYİCİ (CERRAHİ MÜDAHALE) ---
function extractJSON(text) {
    try {
        const startIndex = text.indexOf('{');
        const endIndex = text.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            return text.substring(startIndex, endIndex + 1);
        }
        return text; // JSON bulamazsa olduğu gibi döndür (Hata verir ama logda görürüz)
    } catch (e) {
        return text;
    }
}

function createHydra(name) {
    log('SİSTEM', `${name} başlatılıyor...`);

    const bot = mineflayer.createBot({
        host: CONFIG.host,
        port: CONFIG.port,
        username: name,
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
        log(name, 'Giriş Başarılı.');
        bot.chat(`/login ${CONFIG.pass}`);
        SWARM.push(bot);

        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        moves.canDig = true;
        moves.allow1by1towers = true; 
        moves.allowParkour = true; 
        bot.pathfinder.setMovements(moves);

        bot.armorManager.equipAll();
        bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };

        // Otonom döngü
        setInterval(() => consciousnessLoop(bot), 15000);
    });

    function scanEnvironment() {
        const blocks = bot.findBlocks({ matching: (b) => b.name !== 'air', maxDistance: 10, count: 5 });
        const blockNames = [...new Set(blocks.map(p => bot.blockAt(p).name))].join(', ') || "Hava";
        const entities = Object.values(bot.entities)
            .filter(e => e.type === 'player' || e.type === 'mob')
            .filter(e => bot.entity.position.distanceTo(e.position) < 15 && e !== bot.entity)
            .map(e => e.username || e.mobType)
            .join(', ') || "Kimse yok";
        
        return { blocks: blockNames, entities: entities };
    }

    // --- BİLİNÇ DÖNGÜSÜ ---
    async function consciousnessLoop(bot) {
        if (!MASTER_USER) return;
        if (bot.pathfinder.isMoving()) return;

        const env = scanEnvironment();
        // Otonom düşünceyi basitleştirip sadece hayati durumlarda tetikleyelim
        // (Kod kalabalığı yapmasın diye şimdilik boş geçiyorum, chat komutu önemli)
    }

    // --- KOMUT İŞLEYİCİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. LİDERLİK
        if (message.toLowerCase() === "hydraaktif") {
            MASTER_USER = username;
            bot.chat(`Patron tanımlandı: ${MASTER_USER}.`);
            return;
        }

        // 2. ÇOĞALMA
        if (message.toLowerCase() === "hydracogal" && username === MASTER_USER) {
            if (bot === SWARM[0]) {
                const id = Math.floor(Math.random() * 999);
                createHydra(`Hydra_v${id}`);
            }
            return;
        }

        if (username !== MASTER_USER) return;

        // 3. AI ANALİZİ
        const env = scanEnvironment();
        const mode = bot.player.gamemode === 1 ? "Creative" : "Survival";
        
        const prompt = `
        Sen ${bot.username}. Mod: ${mode}.
        Komut: "${message}"
        
        ÇEVRE: ${env.blocks} | VARLIKLAR: ${env.entities}
        
        Görevi yap ve SADECE JSON döndür. Asla başka yazı yazma.
        
        SEÇENEKLER:
        1. { "action": "mine", "target": "log" }
        2. { "action": "pvp", "target": "Zombie" }
        3. { "action": "goto", "target": "${MASTER_USER}" }
        4. { "action": "chat", "msg": "..." }
        5. { "action": "drop" }
        
        NOT: "odun" denirse ve etrafta "oak_log" varsa target="oak_log" yap.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1 // Yaratıcılığı kısıp hatayı azaltıyoruz
            });
            
            const rawText = completion.choices[0].message.content;
            console.log(`[AI HAM CEVAP]: ${rawText}`); // HATA OLURSA BURAYA BAK

            const jsonText = extractJSON(rawText);
            const cmd = JSON.parse(jsonText);
            
            log(bot.username, `Emir Algılandı: ${cmd.action}`);
            executeAction(bot, cmd, mode);

        } catch (e) {
            console.log(`[JSON HATASI]: ${e.message}`);
            // Hata olursa chat'e basma ki spam olmasın, terminale bas.
            bot.chat("Beynim karıştı (JSON Hatası). Terminale bak patron.");
        }
    });

    bot.on('error', console.log);
}

// --- EYLEM MOTORU ---
async function executeAction(bot, cmd, mode) {
    if (cmd.action === "chat") bot.chat(cmd.msg);
    
    else if (cmd.action === "goto") {
        const target = bot.players[MASTER_USER]?.entity;
        if (target) {
            bot.chat("Geliyorum.");
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
        } else {
            bot.chat(`/tpa ${MASTER_USER}`);
        }
    }

    else if (cmd.action === "mine") {
        if (mode === "Creative") {
            bot.chat(`/give @s ${cmd.target} 64`);
        } else {
            let t = cmd.target;
            if (t.includes('log')) { // Akıllı ağaç seçimi
                const logs = ['oak_log', 'birch_log', 'spruce_log'];
                const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                t = found ? found.name : 'oak_log';
            }
            
            bot.chat(`${t} arıyorum...`);
            const bType = bot.registry.blocksByName[t];
            if (bType) {
                const targets = bot.findBlocks({ matching: bType.id, maxDistance: 64, count: 5 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                    bot.chat("Bitti.");
                } else bot.chat("Yakında yok.");
            }
        }
    }

    else if (cmd.action === "pvp") {
        const enemy = bot.nearestEntity(e => e.username === cmd.target || e.mobType === cmd.target || e.type === 'mob');
        if (enemy) bot.pvp.attack(enemy);
        else bot.chat("Düşman yok.");
    }
    
    else if (cmd.action === "drop") {
        const items = bot.inventory.items();
        for (const item of items) await bot.tossStack(item);
        bot.chat("Boşalttım.");
    }
}

createHydra('Hydra_Prime');
