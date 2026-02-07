const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- AYARLAR ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BOSS_NAME = "Hasan"; 
const BOT_NAME = "Hydra_AI";

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: BOT_NAME,
        version: "1.20.1",
        auth: 'offline',
        checkTimeoutInterval: 120000 
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);

    bot.on('spawn', () => {
        console.log(`[SİSTEM] ${BOT_NAME} sınırsız modda aktif!`);
        bot.chat("/login H123456");
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
        bot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood: [] };
    });

    // --- 1. EYLEM MOTORU (Fiziksel İşler) ---
    async function executePhysicalAction(actionData) {
        const mcData = require('minecraft-data')(bot.version);
        
        try {
            if (actionData.type === 'collect') {
                const blockType = mcData.blocksByName[actionData.target];
                if (!blockType) {
                    bot.chat(`Minecraft'ta ${actionData.target} diye bir blok yok ama aramaya çalışabilirim.`);
                    return;
                }
                const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: actionData.count || 1 });
                if (blocks.length > 0) {
                    bot.chat(`${actionData.target} topluyorum.`);
                    await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                    bot.chat("Toplama bitti.");
                } else {
                    bot.chat("Etrafta ondan göremedim.");
                }
            } 
            else if (actionData.type === 'come') {
                const target = bot.players[BOSS_NAME]?.entity;
                if (target) {
                    bot.chat("Geliyorum.");
                    bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1));
                } else {
                    bot.chat("Seni göremiyorum patron.");
                }
            }
            else if (actionData.type === 'stop') {
                bot.pathfinder.setGoal(null);
                bot.chat("Durdum.");
            }
        } catch (err) {
            bot.chat("Bir engel var, yapamıyorum.");
            console.log(err);
        }
    }

    // --- 2. HİBRİT BEYİN (Karar Mekanizması) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (!message.toLowerCase().includes("hydra") && !username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        try {
            // AI'ya hem fiziksel yeteneklerini hem de sohbet özgürlüğünü veriyoruz
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen Minecraft asistanı Hydra'sın. Kullanıcı sana bir şey yazdığında iki seçeneğin var:
                        
                        SEÇENEK 1: Eğer kullanıcı FİZİKSEL bir iş istiyorsa (odun topla, gel, dur, kaz), şu JSON formatını ver:
                        { "intent": "physical", "type": "collect", "target": "oak_log", "count": 3 } 
                        (type şunlar olabilir: collect, come, stop. Target İngilizce blok adı olmalı.)

                        SEÇENEK 2: Eğer kullanıcı sohbet ediyorsa, soru soruyorsa veya senin yapamayacağın karmaşık bir şey (ev yap, maden bul) istiyorsa, SADECE normal bir cevap ver. JSON kullanma.
                        
                        Örnekler:
                        Kullanıcı: "Bana 3 taş getir" -> Çıktı: { "intent": "physical", "type": "collect", "target": "cobblestone", "count": 3 }
                        Kullanıcı: "Nasılsın?" -> Çıktı: İyiyim patron, sen nasılsın?
                        Kullanıcı: "Bana ev yap" -> Çıktı: Şu an mimari yeteneğim yok ama malzeme toplayabilirim. Ne lazım?
                        ` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-70b-versatile', 
                temperature: 0.3 
            });

            const aiResponse = completion.choices[0].message.content.trim();

            // Cevap JSON mu yoksa düz yazı mı? Kontrol et.
            if (aiResponse.startsWith('{') || aiResponse.includes('"intent": "physical"')) {
                // Bu bir eylem emri
                try {
                    // Temizlik yap (Markdown varsa sil)
                    const jsonStr = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    const command = JSON.parse(jsonStr);
                    executePhysicalAction(command);
                } catch (e) {
                    // JSON bozuksa sohbet olarak bas
                    bot.chat(aiResponse); 
                }
            } else {
                // Bu bir sohbet cevabı
                bot.chat(aiResponse);
            }

        } catch (e) {
            console.log("AI Hatası:", e);
        }
    });

    bot.on('end', () => setTimeout(startBot, 15000));
    bot.on('error', (err) => console.log("Hata:", err));
}

startBot();
