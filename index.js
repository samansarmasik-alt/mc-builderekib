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
const BOSS_NAME = "Hasan"; // Kendi adını buraya yaz (Büyük/küçük harf duyarlı!)
const BOT_NAME = "Hydra_AI_V2";

function startBot() {
    console.log("Bot başlatılıyor...");
    
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
        console.log(`${BOT_NAME} sunucuya girdi!`);
        bot.chat("/login H123456");
        
        // Hareket yeteneklerini aç
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.canDig = true;
        defaultMove.allow1by1towers = true; // Kule yapabilir
        bot.pathfinder.setMovements(defaultMove);
    });

    // --- GERÇEK AI İŞLEMCİSİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        
        // Sadece patron konuşunca devreye gir
        if (!username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        console.log(`[DUYDU] ${username}: ${message}`);

        // AI'ya gönderilecek durum raporu
        const botStatus = {
            gamemode: bot.player.gamemode, // 0: Survival, 1: Creative
            pos: bot.entity.position.floored(),
            inventory_full: bot.inventory.emptySlotCount() === 0
        };

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen bir Minecraft botusun. Adın Hydra.
                        Kullanıcının isteğini analiz et ve kesinlikle JSON formatında cevap ver.
                        
                        YAPABİLECEĞİN EYLEMLER (type):
                        1. "command": Sunucu komutu yazmak için (Örn: /gamemode creative, /tp Hasan, /time set day).
                        2. "chat": Sohbet etmek için.
                        3. "collect": Blok toplamak için (Örn: stone, oak_log, dirt).
                        4. "goto": Birinin yanına gitmek için (target: oyuncu_adı).

                        FORMAT ÖRNEKLERİ:
                        - "Yaratıcı moda geç": { "type": "command", "content": "/gamemode creative" }
                        - "Bana ışınlan": { "type": "command", "content": "/tp Hasan" }
                        - "Taş kaz": { "type": "collect", "content": "stone", "count": 10 }
                        - "Nasılsın?": { "type": "chat", "content": "İyiyim patron, emret." }

                        ŞU ANKİ DURUMUN: ${JSON.stringify(botStatus)}
                        DİKKAT: Asla markdown (backticks) kullanma. Sadece saf JSON ver.
                        ` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-70b-versatile', // En güçlü model
                temperature: 0.1 // Yaratıcılığı kısıp itaatkar yapıyoruz
            });

            // Gelen cevabı temizle
            let rawResponse = completion.choices[0].message.content;
            console.log(`[AI HAM CEVAP]: ${rawResponse}`); // Bunu terminalde göreceksin!

            // JSON temizliği (Bazen AI ```json ekler, onu siliyoruz)
            rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const action = JSON.parse(rawResponse);

            // --- EYLEME DÖKME ---
            if (action.type === 'command') {
                console.log(`[KOMUT] ${action.content}`);
                bot.chat(action.content);
            } 
            else if (action.type === 'chat') {
                bot.chat(action.content);
            }
            else if (action.type === 'collect') {
                bot.chat(`${action.content} aramaya başlıyorum...`);
                const blockType = bot.registry.blocksByName[action.content];
                if (blockType) {
                    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: action.count || 5 });
                    if (blocks.length > 0) {
                        await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                        bot.chat("Toplama bitti.");
                    } else {
                        bot.chat("Etrafta ondan bulamadım.");
                    }
                } else {
                    bot.chat("Böyle bir blok bilmiyorum.");
                }
            }
            else if (action.type === 'goto') {
                const targetName = action.content || BOSS_NAME;
                const target = bot.players[targetName]?.entity;
                if (target) {
                    bot.chat("Geliyorum...");
                    bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
                } else {
                    bot.chat("Seni göremiyorum, '/tp' kullanayım mı?");
                }
            }

        } catch (e) {
            console.log("HATA:", e.message);
            bot.chat("Bir hata oluştu patron. Terminali kontrol et.");
        }
    });

    bot.on('kicked', console.log);
    bot.on('error', console.log);
}

startBot();
