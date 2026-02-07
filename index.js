/* PROJECT HYDRA: OMNI (NO-MIMIC FIX)
   Author: Gemini Advanced (For Patron)
   Fix: Prevents AI from repeating user input (Echo/Parrot fix)
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

// --- ANAHTAR VE AYARLAR ---
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

// --- JSON CERRAHI (Hata Önleyici) ---
function extractJSON(text) {
    try {
        const startIndex = text.indexOf('{');
        const endIndex = text.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            return text.substring(startIndex, endIndex + 1);
        }
        return text;
    } catch (e) { return text; }
}

function createHydra(name) {
    log('SİSTEM', `${name} hazırlanıyor...`);

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
    });

    // --- GÖZLEM ---
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

    // --- KOMUT İŞLEYİCİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. LİDERLİK
        if (message.toLowerCase() === "hydraaktif") {
            MASTER_USER = username;
            bot.chat(`Emredersin Patron ${MASTER_USER}. Papağan modu kapalı.`);
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

        // 3. ZEKİ ANALİZ (Anti-Papağan Prompt)
        const env = scanEnvironment();
        const mode = bot.player.gamemode === 1 ? "Creative" : "Survival";
        
        const prompt = `
        Sen ${bot.username}. Mod: ${mode}.
        Patron (${MASTER_USER}) dedi ki: "${message}"
        
        ÇEVRE: ${env.blocks} | VARLIKLAR: ${env.entities}
        
        GÖREV: Emri anla ve JSON aksiyonu ver.
        
        ÇOK ÖNEMLİ KURAL: Patronun söylediği cümleyi ASLA tekrar etme. 
        Eğer "yanıma gel" derse, sakın "yanıma gel" deme. { "action": "goto" } ver.
        
        SEÇENEKLER:
        1. { "action": "mine", "target": "log" } -> Blok kaz.
        2. { "action": "pvp", "target": "Zombie" } -> Saldır.
        3. { "action": "goto", "target": "${MASTER_USER}" } -> Yanına git / Takip et.
        4. { "action": "chat", "msg": "Tamamdır." } -> Cevap ver (Kısa ve öz).
        5. { "action": "drop" } -> Eşya at.
        
        Sadece JSON döndür.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1 // Yaratıcılık düşük, hata payı az
            });
            
            const rawText = completion.choices[0].message.content;
            console.log(`[AI DÜŞÜNCESİ]: ${rawText}`); 

            const jsonText = extractJSON(rawText);
            const cmd = JSON.parse(jsonText);
            
            // Güvenlik Kontrolü: Eğer AI papağan gibi mesajı tekrar ederse engelle
            if (cmd.action === "chat" && cmd.msg.toLowerCase() === message.toLowerCase()) {
                console.log("Papağanlık engellendi.");
                return; // Hiçbir şey yapma
            }

            executeAction(bot, cmd, mode);

        } catch (e) {
            console.log(`[HATA]: ${e.message}`);
        }
    });

    bot.on('error', console.log);
}

// --- EYLEMLER ---
async function executeAction(bot, cmd, mode) {
    if (cmd.action === "chat") bot.chat(cmd.msg);
    
    else if (cmd.action === "goto") {
        const target = bot.players[MASTER_USER]?.entity;
        if (target) {
            bot.chat("Geliyorum patron.");
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
            if (t.includes('log')) { 
                const logs = ['oak_log', 'birch_log', 'spruce_log'];
                const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                t = found ? found.name : 'oak_log';
            }
            
            bot.chat(`${t} kazıyorum.`);
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
        if (enemy) {
            bot.chat("Saldırıyorum!");
            bot.pvp.attack(enemy);
        }
    }
    
    else if (cmd.action === "drop") {
        const items = bot.inventory.items();
        for (const item of items) await bot.tossStack(item);
        bot.chat("Boşalttım.");
    }
}

createHydra('Hydra_Lider');
