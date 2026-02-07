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
const BOSS_NAME = "Hasan"; 
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
        console.log(`[GOD MODE] ${BOT_NAME} yetkili modda başlatıldı.`);
        bot.chat("/login H123456");
        // Botun hareket yeteneklerini tanımla
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.canDig = true;
        defaultMove.placeCost = 1; // Blok koymayı sevsin
        bot.pathfinder.setMovements(defaultMove);
    });

    // --- ÇEVRE ANALİZİ (Gözler) ---
    function scanEnvironment() {
        const blocks = bot.findBlocks({
            matching: (block) => block.name.includes('log') || block.name.includes('ore'),
            maxDistance: 10,
            count: 10
        });
        // Sadece isimleri al ve benzersizleri listele
        const names = [...new Set(blocks.map(p => bot.blockAt(p).name))];
        return names.join(', ');
    }

    // --- İNŞAAT MOTORU (AI Koordinat Verir, Bot Yapar) ---
    async function buildStructure(buildData) {
        bot.chat("İnşaata başlıyorum...");
        const ref = bot.entity.position.floored(); // Botun şu anki yeri referans

        for (const block of buildData) {
            try {
                // Göreceli konum (Botun 2 blok önü, 1 blok yukarısı gibi)
                const targetPos = ref.offset(block.x, block.y, block.z);
                
                // Oraya git
                await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 4));
                
                // Yüzünü dön
                await bot.lookAt(targetPos);

                // Eğer elinde o blok yoksa Creative moddan al
                const item = bot.registry.itemsByName[block.type];
                if (!bot.inventory.items().find(i => i.name === block.type)) {
                    bot.chat(`/give @s ${block.type} 64`);
                    await bot.waitForTicks(20); // Eşya gelmesi için bekle
                }

                // Bloğu koy (Referans bloğu bulmamız lazım, havaya koyamaz)
                // Basitlik için: Eğer hedef boşsa ve altında blok varsa koymayı dener
                const blockBelow = bot.blockAt(targetPos.offset(0, -1, 0));
                if (blockBelow && blockBelow.name !== 'air') {
                     await bot.placeBlock(blockBelow, new v(0, 1, 0));
                }
            } catch (e) {
                console.log("Blok koyma hatası:", e.message);
            }
        }
        bot.chat("Yapı tamamlandı.");
    }

    // --- SÜPER BEYİN (Komut ve İnşaat Yetkili) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (!username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        // Çevrede ne var?
        const nearby = scanEnvironment();
        
        // Botun durumu
        const status = {
            gamemode: bot.player.gamemode,
            nearby_blocks: nearby,
            inventory: bot.inventory.items().map(i => i.name).join(', ')
        };

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen Minecraft'ta YETKİLİ (OP) bir botsun. Her şeyi yapabilirsin. 
                        
                        Kullanıcı isteğine göre şu JSON formatında CEVAP VERMELİSİN:

                        1. KOMUT KULLANMA (Creative geçmek, saat değiştirmek, ışınlanmak):
                        { "action": "command", "cmd": "/gamemode creative" }

                        2. BLOK TOPLAMA (Survival ise):
                        { "action": "collect", "target": "birch_log" } 
                        (DİKKAT: "nearby_blocks" listesine bak. Eğer "oak_log" yoksa "birch_log" seç!)

                        3. İNŞAAT YAPMA (Build):
                        { "action": "build", "blocks": [ {"x": 1, "y": 0, "z": 0, "type": "stone"}, {"x": 2, "y": 0, "z": 0, "type": "stone"} ] }
                        (Botun olduğu yere göre X, Y, Z farkları. Basit yapılar kur.)

                        4. SOHBET:
                        { "action": "chat", "msg": "Tamamdır patron." }

                        DURUMUN: ${JSON.stringify(status)}
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

            // --- EYLEMLER ---
            if (data.action === "command") {
                bot.chat(data.cmd);
            } 
            else if (data.action === "chat") {
                bot.chat(data.msg);
            }
            else if (data.action === "collect") {
                bot.chat(`${data.target} topluyorum.`);
                const blockType = bot.registry.blocksByName[data.target];
                if (blockType) {
                    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count: 5 });
                    if (blocks.length > 0) {
                        await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                    }
                }
            }
            else if (data.action === "build") {
                // İnşaat moduna geç
                bot.chat("/gamemode creative");
                await buildStructure(data.blocks);
            }

        } catch (e) {
            console.log("AI Hatası:", e);
            bot.chat("Beynim yandı ama deniyorum...");
        }
    });

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
