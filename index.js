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
let MASTER_NAME = "Hasan"; // Varsayılan patron, 'hydraaktif' ile değişir.
const HOST = 'play4.eternalzero.cloud';
const PORT = 26608;

// Tüm botların listesi
const bots = [];

// --- BOT FABRİKASI ---
function createHydra(name) {
    console.log(`[SİSTEM] Yeni birim oluşturuluyor: ${name}`);
    
    const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: name,
        version: "1.20.1",
        auth: 'offline'
    });

    // Eklentiler
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);

    bot.on('spawn', () => {
        console.log(`[${name}] Sahaya indi!`);
        bot.chat("/login H123456");
        bots.push(bot); // Listeye ekle

        // Hareket ayarları (Creative/Survival Dinamik)
        updateMovements(bot);
        
        // Zırh ve Yemek
        bot.armorManager.equipAll();
        bot.autoEat.options = { priority: 'foodPoints', startAt: 15, bannedFood: [] };
    });

    // --- DİNAMİK HAREKET AYARI ---
    function updateMovements(bot) {
        const mcData = require('minecraft-data')(bot.version);
        const moves = new Movements(bot, mcData);
        
        if (bot.player.gamemode === 1) { // Creative
            moves.canFly = true;
            moves.creative = true;
            moves.canDig = false; // Anında kırar
        } else { // Survival
            moves.canDig = true;
            moves.allow1by1towers = true;
            moves.canFly = false;
        }
        bot.pathfinder.setMovements(moves);
    }

    // --- CRAFTING SİSTEMİ (Basit) ---
    async function craftItem(itemName, count = 1) {
        const mcData = require('minecraft-data')(bot.version);
        const item = mcData.itemsByName[itemName];
        const recipe = bot.recipesFor(item.id, null, 1, null)[0];

        if (!recipe) {
            bot.chat("Bunun tarifini bilmiyorum veya malzemem eksik.");
            return;
        }
        
        bot.chat(`${itemName} üretiyorum...`);
        try {
            await bot.craft(recipe, count, null);
            bot.chat("Üretim tamam!");
        } catch (err) {
            bot.chat("Üretirken sorun çıktı: " + err.message);
        }
    }

    // --- EYLEM BEYNİ (GROQ) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        // 1. YÖNETİCİ SEÇİMİ VE ÇOĞALMA
        if (message.toLowerCase() === "hydraaktif") {
            MASTER_NAME = username;
            bot.chat(`Artık patronum sensin: ${MASTER_NAME}`);
            return;
        }
        if (message.toLowerCase() === "hydracogal") {
            if (username === MASTER_NAME) {
                bot.chat("Kopyalanıyorum...");
                const newId = Math.floor(Math.random() * 1000);
                createHydra(`Hydra_${newId}`);
            }
            return;
        }

        // Sadece patronu dinle
        if (username !== MASTER_NAME) return;

        // TPA Kabul Etme
        if (message.includes("/tpa") || message.includes("ışınlan")) {
            bot.chat("/tpaccept");
        }

        // --- AI ANALİZİ ---
        // Her bot mesajı alır ama sadece kendine uygunsa yapar.
        const status = {
            name: bot.username,
            mode: bot.player.gamemode === 1 ? "Creative" : "Survival",
            inventory: bot.inventory.items().map(i => i.name).join(','),
            pos: bot.entity.position.floored(),
            master_pos: bot.players[MASTER_NAME]?.entity?.position?.floored() || "Bilinmiyor"
        };

        // Gecikme önleyici (Tüm botlar aynı anda API'ye yüklenmesin diye ufak random gecikme)
        await new Promise(r => setTimeout(r, Math.random() * 2000));

        const prompt = `
        Sen ${bot.username}. Oyun Modun: ${status.mode}.
        Patron (${MASTER_NAME}) dedi ki: "${message}"
        
        GÖREVİN: Bu emrin SANA verilip verilmediğini anla.
        - Eğer emir genel ise ("Biriniz odun kessin") ve isminle uyumluysa veya rastgele seçilirse yap.
        - Eğer direkt ismin söylenirse ("${bot.username} gel") yap.
        
        YAPABİLECEKLERİN (JSON DÖN):
        1. { "action": "craft", "item": "iron_axe" } -> Aletin yoksa üret.
        2. { "action": "collect", "target": "log" } -> Blok topla. (Creative ise /give kullanır)
        3. { "action": "command", "cmd": "/tp ..." } -> Komut yaz.
        4. { "action": "follow" } -> Patronu takip et.
        5. { "action": "nothing" } -> Emir bana değil.

        DURUM: Envanter: ${status.inventory}.
        
        KURAL: Creative moddaysan toplama yapma, "command" ile kendine ver (/give @s item).
        KURAL: Survivaldaysan ve "balta yoksa", önce "craft" action ver.
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

            executeAction(bot, decision, status);

        } catch (e) {
            // Hata olursa sessiz kal
        }
    });

    // --- EYLEM UYGULAYICI ---
    async function executeAction(bot, data, status) {
        if (data.action === "nothing") return;

        if (data.action === "command") {
            bot.chat(data.cmd);
        }
        else if (data.action === "craft") {
            // Basitçe crafting table bulup yapmaya çalışır
            // Survival mantığı
            if (status.mode === "Survival") {
                const table = bot.findBlock({ matching: b => b.name === 'crafting_table' });
                if (table) {
                    bot.pathfinder.goto(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 1));
                    await craftItem(data.item);
                } else {
                    bot.chat("Çalışma masası bulamadım, önce onu yapmam lazım.");
                    // Burada odun varsa masaya çevirme eklenebilir
                }
            }
        }
        else if (data.action === "collect") {
            if (status.mode === "Creative") {
                bot.chat(`/give @s ${data.target} 64`);
                bot.chat("Creative güçlerimle aldım!");
            } else {
                // Survival Toplama
                const blockType = bot.registry.blocksByName[data.target] || bot.registry.blocksByName['oak_log'];
                if (blockType) {
                    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                    if (blocks.length > 0) {
                        bot.chat("Topluyorum...");
                        await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                    } else {
                        bot.chat("Etrafta bulamadım.");
                    }
                }
            }
        }
        else if (data.action === "follow") {
            const target = bot.players[MASTER_NAME]?.entity;
            if (target) {
                bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            } else {
                bot.chat("/tpa " + MASTER_NAME); // Uzaktaysa TPA atar
            }
        }
    }
    
    // Hata önleyiciler
    bot.on('kicked', console.log);
    bot.on('error', console.log);
    bot.on('end', () => console.log(`${name} düştü.`));
}

// İLK BOTU BAŞLAT
createHydra('Hydra_Lider');
