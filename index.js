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
const BOT_NAME = "Hydra_Prime";

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
        console.log(`[SÜPER MOD] ${BOT_NAME} uçuşa hazır!`);
        bot.chat("/login H123456");
        bot.chat("/gamemode creative"); // Kendini creative yapar

        // --- UÇUŞ AYARLARI ---
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        
        defaultMove.canFly = true;  // UÇABİLİR
        defaultMove.creative = true; // YARATICI MOD FİZİĞİ
        defaultMove.canDig = false; // Kırmaya uğraşmaz, geçer gider
        
        bot.pathfinder.setMovements(defaultMove);
    });

    // --- ÖZEL YETENEK 1: HIZLI İNŞAAT ---
    async function fastBuild(structureType) {
        bot.chat("Hızlı inşaat başlatılıyor...");
        const startPos = bot.entity.position.offset(2, 0, 2).floored();
        
        // Basit bir Ev Şeması (Dinamik yapılabilir)
        let blocks = [];
        if (structureType.includes("ev") || structureType.includes("house")) {
            // 5x5x4 Basit kutu ev
            for(let x=0; x<5; x++) {
                for(let y=0; y<4; y++) {
                    for(let z=0; z<5; z++) {
                        // Sadece duvarları yap
                        if(x===0 || x===4 || z===0 || z===4 || y===0 || y===3) {
                            blocks.push(startPos.offset(x, y, z));
                        }
                    }
                }
            }
        }

        // Hızlı Yerleştirme Döngüsü
        for (const pos of blocks) {
            // Creative'de envanter kontrolüne gerek yok, direkt komutla setblock daha hızlıdır
            // Ama botun "yapıyormuş" gibi görünmesi için:
            try {
                // Işınlanarak yap (Çok hızlı)
                bot.chat(`/tp ${pos.x} ${pos.y + 2} ${pos.z}`); 
                await bot.waitForTicks(2); // Çok az bekle
                bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} stone`);
            } catch (e) {}
        }
        bot.chat("İnşaat bitti patron.");
    }

    // --- ÖZEL YETENEK 2: ARAZİ KAŞİFİ (Düz Alan Bulma) ---
    async function findFlatLand() {
        bot.chat("Düz arazi taraması için havalanıyorum...");
        bot.chat("/tp ~ ~50 ~"); // 50 blok yukarı çık
        await bot.waitForTicks(20);

        let found = false;
        let attempts = 0;

        while (!found && attempts < 10) {
            // Aşağıya bak
            const blockBelow = bot.blockAt(bot.entity.position.offset(0, -50, 0));
            
            if (blockBelow && (blockBelow.name === 'grass_block' || blockBelow.name === 'sand')) {
                bot.chat(`Potansiyel alan buldum! Koordinatlar: ${blockBelow.position}`);
                bot.chat("/tp ~ ~-50 ~"); // Aşağı in
                found = true;
            } else {
                bot.chat("Burası bozuk, ileri gidiyorum...");
                bot.chat("/tp ~100 ~ ~"); // 100 blok ileri ışınlan
                await bot.waitForTicks(40); // Chunk yüklenmesini bekle
                attempts++;
            }
        }
        if (!found) bot.chat("Çok uzaklaştım ama mükemmel bir yer bulamadım.");
    }

    // --- SÜPER ZEKA (Her Şeyi Yapabilen) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (!username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        // Botun Durumu
        const status = {
            pos: bot.entity.position.floored(),
            biome: "Unknown", // Mineflayer biyom verisini direkt vermez ama bloklardan tahmin edebiliriz
        };

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen Minecraft'ta "Hydra" adında YARATICI MOD (GOD MODE) bir botsun.
                        Kullanıcının isteğine göre şu JSON formatlarından birini ver:

                        1. UÇ VE KEŞFET (Düz alan bul, okyanus bul vb.):
                        { "action": "scout", "target": "flat_land" }

                        2. HIZLI İNŞAAT (Ev yap, duvar ör):
                        { "action": "build", "type": "house" }

                        3. KOMUT/IŞINLANMA (Bana gel, şuraya git):
                        { "action": "command", "cmd": "/tp Hasan" } (veya "/time set day" vb.)

                        4. EŞYA VER (Bana elmas at):
                        { "action": "command", "cmd": "/give Hasan diamond 64" }

                        5. SOHBET:
                        { "action": "chat", "msg": "Tamamdır." }
                        
                        DİKKAT: "Uç", "Arazi bul", "Keşfet" kelimeleri geçerse "scout" kullan. "Ev yap" derse "build" kullan.
                        ` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });

            let aiResponse = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(aiResponse);
            console.log("AI Emri:", data);

            if (data.action === "scout") {
                findFlatLand();
            }
            else if (data.action === "build") {
                fastBuild(data.type);
            }
            else if (data.action === "command") {
                bot.chat(data.cmd);
            }
            else if (data.action === "chat") {
                bot.chat(data.msg);
            }

        } catch (e) {
            console.log("Hata:", e.message);
            bot.chat("Beyin dalgalarım karıştı patron.");
        }
    });

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
