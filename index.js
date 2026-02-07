const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- AYARLAR ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BOSS_NAME = "Hasan"; // Kendi tam ismin
const BOT_NAME = "Hydra_AI";

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: BOT_NAME,
        version: "1.20.1",
        auth: 'offline'
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);

    bot.on('spawn', () => {
        console.log(`[GPS AKTİF] ${BOT_NAME} koordinat uydusuna bağlandı.`);
        bot.chat("/login H123456");
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
    });

    // --- SENİN KOORDİNATINI BULMA ---
    function getBossLocation() {
        const boss = bot.players[BOSS_NAME]?.entity;
        if (boss) {
            return {
                visible: true,
                x: Math.floor(boss.position.x),
                y: Math.floor(boss.position.y),
                z: Math.floor(boss.position.z),
                distance: Math.floor(bot.entity.position.distanceTo(boss.position))
            };
        } else {
            return { visible: false, info: "Görüş mesafesinde değil veya sunucuda yok." };
        }
    }

    // --- SÜPER BEYİN (GPS Destekli) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (!username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        // 1. Verileri Topla
        const bossLoc = getBossLocation();
        const botLoc = bot.entity.position.floored();
        
        // Botun Durum Özeti (Prompt için)
        const statusReport = {
            my_location: { x: botLoc.x, y: botLoc.y, z: botLoc.z },
            boss_location: bossLoc,
            inventory: bot.inventory.items().map(i => i.name).join(', ')
        };

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen Minecraft'ta "Hydra" isimli gelişmiş bir Yapay Zekasın.
                        
                        ŞU ANKİ DURUMUN: ${JSON.stringify(statusReport)}
                        
                        GÖREVİN: Kullanıcının (Patron) isteğine göre JSON formatında emir oluşturmak.
                        
                        KURALLAR:
                        1. Eğer patron ÇOK UZAKTAYSA (>50 blok) ve yanına gelmeni istiyorsa "/tp" komutunu kullan.
                        2. Eğer patron YAKINDAYSA yürüyerek git (pathfinder).
                        3. Eğer "yanıma ev yap" derse, patronun koordinatlarını (boss_location) kullan.

                        CEVAP FORMATLARI (Sadece JSON):
                        - Komut: { "action": "command", "cmd": "/tp Hasan" }
                        - Yürüme: { "action": "move", "x": 100, "y": 64, "z": -200 }
                        - Sohbet: { "action": "chat", "msg": "Patron X:100 Y:64 konumundasın, geliyorum." }
                        - İnşaat/Eşya: { "action": "collect", "target": "oak_log" }
                        ` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });

            let aiResponse = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(aiResponse);

            console.log("AI Kararı:", data);

            // --- EYLEMLERİ UYGULA ---
            if (data.action === "command") {
                bot.chat(data.cmd);
            } 
            else if (data.action === "chat") {
                bot.chat(data.msg);
            }
            else if (data.action === "move") {
                bot.chat(`Hedefe yürüyorum: ${data.x}, ${data.y}, ${data.z}`);
                bot.pathfinder.setGoal(new goals.GoalNear(data.x, data.y, data.z, 1));
            }
            else if (data.action === "collect") {
                // (Toplama kodu önceki gibi kalır)
                const blockType = bot.registry.blocksByName[data.target];
                if(blockType) {
                    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                    if(blocks.length > 0) await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                }
            }

        } catch (e) {
            console.log("AI Hatası:", e.message);
            // Hata olursa en azından konuşsun
            bot.chat("Hesaplama hatası yaptım patron.");
        }
    });

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
