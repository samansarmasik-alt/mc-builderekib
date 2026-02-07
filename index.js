const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- SENİN VERDİĞİN API ANAHTARI ---
const groq = new Groq({ 
    apiKey: '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' 
});

const HOST = 'play4.eternalzero.cloud';
const PORT = 26608;

let MASTER = ""; // "hydraaktif" yazan kişi buraya atanır (hasanok olacak)
const bots = []; 

function createHydra(botName) {
    console.log(`[SİSTEM] ${botName} hazırlanıyor...`);

    const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: botName,
        version: "1.20.1",
        auth: 'offline'
    });

    // --- YETENEKLER ---
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);     
    bot.loadPlugin(autoEat);  
    bot.loadPlugin(pvp);      
    bot.loadPlugin(armorManager); 

    bot.on('spawn', () => {
        console.log(`[${botName}] Sahaya indi!`);
        bot.chat("/login H123456");
        bots.push(bot);

        // Hareket Ayarları
        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        moves.canDig = true;
        moves.allow1by1towers = true; 
        bot.pathfinder.setMovements(moves);
        bot.armorManager.equipAll(); 
        bot.autoEat.options = { priority: 'foodPoints', startAt: 16 };

        // --- OTONOM YAŞAM DÖNGÜSÜ (Burası Yeni) ---
        // Her 15 saniyede bir etrafı kontrol eder (Sen yazmasan bile)
        setInterval(() => lifeLoop(bot), 15000);
    });

    // --- GÖZLEM (Gözler) ---
    function getVisualContext() {
        // Yakındaki bloklar
        const blocks = bot.findBlocks({ matching: (b) => b.name !== 'air', maxDistance: 10, count: 5 });
        const blockNames = [...new Set(blocks.map(p => bot.blockAt(p).name))].join(', ');
        // Yakındaki varlıklar
        const entity = bot.nearestEntity(e => e.type === 'player' || e.type === 'mob');
        const entityInfo = entity ? `${entity.name} (${Math.floor(bot.entity.position.distanceTo(entity.position))}m uzakta)` : "Kimse yok";
        return `Bloklar: ${blockNames} | Varlıklar: ${entityInfo}`;
    }

    // --- YAŞAM DÖNGÜSÜ FONKSİYONU ---
    async function lifeLoop(bot) {
        if (!MASTER) return; // Patron yoksa kendi kafasına göre iş yapmasın
        if (bot.pathfinder.isMoving()) return; // Hareket ediyorsa düşünmesin

        const context = getVisualContext();
        console.log(`[${botName} Gözlem]: ${context}`); // Terminalde ne gördüğünü yazar

        // Otonom Karar İstemi
        const prompt = `
        Sen ${bot.username}. Patronun: ${MASTER}.
        Şu an kimse sana emir vermedi, kendi kendine karar vermelisin.
        
        ETRAFINDA GÖRDÜKLERİN: ${context}
        DURUMUN: Can: ${Math.round(bot.health)}, Envanter: ${bot.inventory.items().length > 0 ? 'Dolu' : 'Boş'}
        
        NE YAPMAK İSTERSİN? (JSON DÖN):
        1. { "action": "idle", "msg": "..." } -> Etraf sakinse bekle veya yorum yap.
        2. { "action": "watch", "target": "entity_name" } -> Birine bak.
        3. { "action": "follow_master" } -> Patron çok uzaklaştıysa yanına git.
        4. { "action": "chat", "msg": "Etrafta X gördüm, toplayayım mı?" } -> Bilgi ver.
        
        Sadece JSON ver.
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.4
            });
            const res = JSON.parse(completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
            
            if (res.action === "chat") bot.chat(res.msg);
            if (res.action === "follow_master") {
                const target = bot.players[MASTER]?.entity;
                if(target && bot.entity.position.distanceTo(target.position) > 10) {
                    bot.chat("Çok uzaklaştın patron, geliyorum.");
                    bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
                }
            }
        } catch(e) {}
    }

    // --- EYLEM MERKEZİ (Chat Komutları) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. PATRON OLMA (Burası kritik, hasanok ismini burası kapacak)
        if (message.toLowerCase() === "hydraaktif") {
            MASTER = username;
            bot.chat(`Anlaşıldı! Patronum sensin: ${MASTER} (hasanok).`);
            console.log(`YENİ PATRON: ${MASTER}`);
            return;
        }

        // 2. ÇOĞALMA
        if (message.toLowerCase() === "hydracogal" && username === MASTER) {
            if (bot === bots[0]) {
                const newName = `Hydra_v${Math.floor(Math.random() * 100)}`;
                createHydra(newName);
            }
            return;
        }

        if (username !== MASTER) return; // Başkasını dinleme

        // 3. AI KOMUT İŞLEYİCİ
        const prompt = `
        Sen ${bot.username}. Patronun (${MASTER}) dedi ki: "${message}"
        Gördüklerin: ${getVisualContext()}
        
        GÖREV: Emri JSON'a çevir.
        SEÇENEKLER:
        - { "action": "mine", "target": "log" } (Odun/Taş vb.)
        - { "action": "pvp", "target": "Zombie" }
        - { "action": "goto", "target": "${MASTER}" }
        - { "action": "chat", "msg": "Cevabın" }
        `;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });

            const decision = JSON.parse(completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
            console.log(`[KARAR] ${decision.action}`);

            if (decision.action === "chat") bot.chat(decision.msg);
            else if (decision.action === "goto") {
                const t = bot.players[MASTER]?.entity;
                if(t) bot.pathfinder.setGoal(new goals.GoalFollow(t, 1), true);
                else bot.chat("/tpa " + MASTER);
            }
            else if (decision.action === "mine") {
                bot.chat(`${decision.target} arıyorum...`);
                // Akıllı blok bulucu
                let targetName = decision.target;
                if(targetName === 'log') {
                    const logs = ['oak_log', 'birch_log', 'spruce_log'];
                    const found = bot.findBlock({ matching: b => logs.includes(b.name), maxDistance: 30 });
                    targetName = found ? found.name : 'oak_log';
                }
                const blockType = bot.registry.blocksByName[targetName];
                if(blockType) {
                    const b = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                    if(b.length > 0) await bot.collectBlock.collect(b.map(p => bot.blockAt(p)));
                    else bot.chat("Yakında yok.");
                }
            }
            else if (decision.action === "pvp") {
                const enemy = bot.nearestEntity(e => e.name === decision.target || e.type === 'mob');
                if(enemy) bot.pvp.attack(enemy);
            }

        } catch (e) {
            bot.chat("Kafam karıştı, tekrar söyle.");
        }
    });

    bot.on('error', console.log);
    bot.on('end', () => console.log(`${botName} düştü.`));
}

// BAŞLAT
createHydra('Hydra_Lider');
