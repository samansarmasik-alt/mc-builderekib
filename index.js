/* PROJECT HYDRA: OMNI-PLANNER (Gerçek AI Beyni)
   Mantık: Bot nasıl yapılacağını bilmez. Groq'a sorar, Groq adım adım liste verir, Bot uygular.
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

// --- SENİN ANAHTARIN ---
const groq = new Groq({ apiKey: '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' });

const CONFIG = {
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Brain',
    version: "1.20.1",
    pass: "H123456"
};

let MASTER = ""; 
let IS_BUSY = false; // Şu an bir plan uyguluyor mu?

const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: 'offline'
});

// Pluginler
bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

bot.on('spawn', () => {
    console.log('Bot bağlandı. Beyin aktif.');
    bot.chat(`/login ${CONFIG.pass}`);

    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allow1by1towers = true; 
    moves.allowParkour = true;
    bot.pathfinder.setMovements(moves);
    bot.armorManager.equipAll();
    bot.autoEat.options = { priority: 'foodPoints', startAt: 15 };
});

// --- YARDIMCI: JSON TEMİZLEME ---
function extractJSON(text) {
    try {
        const s = text.indexOf('['); // Liste bekliyoruz
        const e = text.lastIndexOf(']');
        if (s !== -1 && e !== -1) return text.substring(s, e + 1);
        return null;
    } catch (e) { return null; }
}

// --- EYLEM MOTORU (Botun Elleri) ---
async function executePlan(steps) {
    IS_BUSY = true;
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        bot.chat(`[Adım ${i+1}/${steps.length}]: ${step.desc}`);
        console.log(`Uygulanıyor: ${step.action} -> ${step.target}`);

        try {
            // 1. MINE (Kaz/Topla)
            if (step.action === "mine") {
                let blockName = step.target;
                if (blockName.includes("_log")) { // Odun genellemesi
                     const logs = ['oak_log', 'birch_log', 'spruce_log'];
                     const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 32 });
                     blockName = found ? found.name : 'oak_log';
                }

                const blockType = bot.registry.blocksByName[blockName];
                if (!blockType) { bot.chat("Blok bulunamadı, geçiyorum."); continue; }
                
                const targets = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: step.count || 1 });
                if (targets.length > 0) {
                    await bot.collectBlock.collect(targets.map(p => bot.blockAt(p)));
                } else {
                    bot.chat("Etrafta bulamadım.");
                }
            }

            // 2. CRAFT (Üret)
            else if (step.action === "craft") {
                const mcData = require('minecraft-data')(bot.version);
                const item = mcData.itemsByName[step.target];
                const recipe = bot.recipesFor(item.id, null, 1, null)[0];
                if (recipe) {
                    const table = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 4 });
                    await bot.craft(recipe, 1, table);
                } else {
                    bot.chat(`Tarif yok veya malzeme eksik: ${step.target}`);
                }
            }

            // 3. PLACE (Koy - Crafting Table vb.)
            else if (step.action === "place") {
                const item = bot.inventory.items().find(i => i.name === step.target);
                if (item) {
                    await bot.equip(item, 'hand');
                    const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0));
                    if (ref) await bot.placeBlock(ref, new v(0, 1, 0));
                }
            }

            // 4. GOTO (Git)
            else if (step.action === "goto") {
                if (step.target === "master") {
                    const m = bot.players[MASTER]?.entity;
                    if(m) await bot.pathfinder.goto(new goals.GoalNear(m.position.x, m.position.y, m.position.z, 1));
                } else {
                    // Koordinat varsa
                    if (step.x && step.y && step.z) {
                        await bot.pathfinder.goto(new goals.GoalNear(step.x, step.y, step.z, 1));
                    }
                }
            }

            // 5. ATTACK (Saldır)
            else if (step.action === "kill") {
                const entity = bot.nearestEntity(e => e.type === 'mob');
                if (entity) {
                    await bot.pvp.attack(entity);
                    await bot.waitForTicks(20); // Biraz bekle
                }
            }

            // 6. EQUIP (Giy/Tak)
            else if (step.action === "equip") {
                const item = bot.inventory.items().find(i => i.name.includes(step.target));
                if(item) await bot.equip(item, 'hand');
            }

        } catch (e) {
            console.log("Adım hatası:", e.message);
            bot.chat("Bu adımda takıldım, sonrakine geçiyorum.");
        }
    }
    
    bot.chat("Plan tamamlandı patron.");
    IS_BUSY = false;
}

// --- ANA BEYİN ---
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat(`Beyin Aktif. Patron: ${MASTER}. Emret, planlayayım.`);
        return;
    }

    if (username !== MASTER) return;
    if (IS_BUSY) {
        bot.chat("Şu an meşgulüm, bitince haber veririm.");
        return;
    }

    bot.chat("Groq'a soruyorum, plan hazırlanıyor...");

    const inventory = bot.inventory.items().map(i => i.name).join(', ') || "Boş";
    
    // BURASI ÇOK ÖNEMLİ: AI'ya "Nasıl Yapılır?" sorusunu sorduruyoruz.
    const prompt = `
    Sen Minecraft uzmanı bir yapay zekasın. Botunu yönetiyorsun.
    BOT ENVANTERİ: ${inventory}
    PATRON İSTEĞİ: "${message}"
    
    GÖREV: Bu isteği gerçekleştirmek için gereken TÜM adımları sırasıyla JSON listesi olarak ver.
    Bot hiçbir şey bilmiyor. Ona "Crafting table yap" deme, "Önce odun kaz, sonra tahta yap, sonra masa yap, sonra masayı yere koy" de.
    
    KULLANABİLECEĞİN KOMUTLAR (action):
    - "mine" (target: "oak_log", "stone", "iron_ore", count: 1)
    - "craft" (target: "stick", "crafting_table", "iron_pickaxe") -> Sadece üretir.
    - "place" (target: "crafting_table", "torch") -> Yere koyar.
    - "equip" (target: "iron_pickaxe") -> Eline alır.
    - "goto" (target: "master") -> Patrona gider.
    - "kill" (target: "mob") -> En yakın düşmana saldırır.
    
    ÖRNEK: "Bana taş kazma yap" denirse ve envanter boşsa:
    [
      {"action": "mine", "target": "oak_log", "count": 3, "desc": "Odun topluyorum"},
      {"action": "craft", "target": "oak_planks", "desc": "Tahta yapıyorum"},
      {"action": "craft", "target": "stick", "desc": "Çubuk yapıyorum"},
      {"action": "craft", "target": "crafting_table", "desc": "Masa yapıyorum"},
      {"action": "place", "target": "crafting_table", "desc": "Masayı kuruyorum"},
      {"action": "craft", "target": "wooden_pickaxe", "desc": "Tahta kazma yapıyorum"},
      {"action": "equip", "target": "wooden_pickaxe", "desc": "Kazmayı elime alıyorum"},
      {"action": "mine", "target": "stone", "count": 3, "desc": "Taş topluyorum"},
      {"action": "craft", "target": "stone_pickaxe", "desc": "Taş kazma yapıyorum"}
    ]
    
    SADECE JSON ARRAY DÖNDÜR.
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1
        });

        const raw = completion.choices[0].message.content;
        console.log(`[GROQ PLANI]: ${raw}`); // Terminalde planı gör
        
        const jsonStr = extractJSON(raw);
        if (!jsonStr) {
            bot.chat("Plan yapamadım (JSON Hatası).");
            return;
        }

        const steps = JSON.parse(jsonStr);
        bot.chat(`${steps.length} adımlık plan hazır. Başlıyorum.`);
        
        // Planı Uygula
        executePlan(steps);

    } catch (e) {
        console.log("Hata:", e);
        bot.chat("Beyin hatası.");
    }
});
