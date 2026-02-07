const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

// --- AYARLAR ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BOSS_NAME = "Hasan"; 
const BOT_NAME = "Hydra_Warlord";

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: BOT_NAME,
        version: "1.20.1",
        auth: 'offline'
    });

    // --- YETENEKLERİ YÜKLE ---
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);

    bot.on('spawn', () => {
        console.log(`[OTONOM MOD] ${BOT_NAME} savaşa ve gelişime hazır!`);
        bot.chat("/login H123456");
        
        // Hareket ayarları
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));

        // Zırh Yönetimi (Otomatik en iyisini giyer)
        bot.armorManager.equipAll();

        // Otomatik Yemek
        bot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood: [] };
    });

    // --- 1. OTONOM KORUMA SİSTEMİ (Refleksler) ---
    // Her saniye etrafı tarar
    setInterval(() => {
        const mobFilter = e => e.type === 'mob' && (e.mobType === 'Zombie' || e.mobType === 'Skeleton' || e.mobType === 'Spider' || e.mobType === 'Creeper');
        const enemy = bot.nearestEntity(mobFilter);

        if (enemy) {
            // Eğer düşman 10 bloktan yakındaysa ve botun canı varsa saldır
            if (bot.entity.position.distanceTo(enemy.position) < 10 && bot.health > 5) {
                // Sadece savaş modundaysa veya saldırıya uğradıysa
                if (!bot.pvp.target) {
                    bot.chat("Tehdit algılandı! Savunma protokolü devreye giriyor.");
                    equipBestWeapon();
                    bot.pvp.attack(enemy);
                }
            }
        }
    }, 2000);

    // Biri bota vurursa affetmez
    bot.on('onCorrelateAttack', (attacker, victim, weapon) => {
        if (victim === bot.entity) {
            bot.chat(`Bana mı vurdun ${attacker.username || 'yaratık'}? Hatanı ödeyeceksin!`);
            equipBestWeapon();
            bot.pvp.attack(attacker);
        }
    });

    // En iyi silahı seçme fonksiyonu
    async function equipBestWeapon() {
        const items = bot.inventory.items();
        const sword = items.find(item => item.name.includes('sword'));
        const axe = items.find(item => item.name.includes('axe'));
        if (sword) await bot.equip(sword, 'hand');
        else if (axe) await bot.equip(axe, 'hand');
    }

    // --- 2. SÜPER ZEKA VE GELİŞİM ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (!username.toLowerCase().includes(BOSS_NAME.toLowerCase())) return;

        // Durum Analizi
        const status = {
            health: bot.health,
            food: bot.food,
            enemy: bot.pvp.target ? "FIGHTING" : "SAFE",
            inventory: bot.inventory.items().map(i => i.name).join(', '),
            position: bot.entity.position.floored()
        };

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen Hydra. Minecraft'ta OTONOM bir savaşçı ve yardımcısın.
                        
                        DURUMUN: ${JSON.stringify(status)}
                        
                        GÖREVİN: Patronun isteğine göre JSON formatında cevap ver.
                        
                        YETENEKLERİN VE FORMATLAR:
                        1. SAVAŞ / KORU: { "action": "fight", "target": "player_name" } (veya "mobs")
                        2. TAKİP ET / GEL: { "action": "guard", "target": "follow_boss" }
                        3. EŞYA TOPLA/GELİŞ: { "action": "loot", "target": "iron_ore" }
                        4. ZIRH GİY: { "action": "equip" }
                        5. SOHBET: { "action": "chat", "msg": "Mesajın" }
                        
                        Eğer "Kendini geliştir" denirse, etraftaki madenleri toplayıp "loot" yap.
                        Eğer "Beni koru" denirse "guard" yap.
                        ` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2
            });

            let aiResponse = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(aiResponse);

            console.log("AI Kararı:", data);

            if (data.action === "fight") {
                const target = bot.players[BOSS_NAME]?.entity; // Örnek hedef
                // Burada hedef belirleme mantığı eklenebilir
                bot.chat("Savaş moduna geçildi!");
            }
            else if (data.action === "guard") {
                const boss = bot.players[BOSS_NAME]?.entity;
                if (boss) {
                    bot.chat("Seni korumak için takip ediyorum patron.");
                    bot.pvp.stop(); // Eski savaşı bırak
                    bot.pathfinder.setGoal(new goals.GoalFollow(boss, 2), true);
                }
            }
            else if (data.action === "equip") {
                bot.chat("Envanterimi tarıyorum, en iyi ekipmanları giyiyorum.");
                bot.armorManager.equipAll();
                equipBestWeapon();
            }
            else if (data.action === "chat") {
                bot.chat(data.msg);
            }
            else if (data.action === "loot") {
                 // Maden toplama kodu buraya tetiklenir
                 bot.chat("Gelişmek için kaynak arıyorum.");
            }

        } catch (e) {
            console.log("Hata:", e.message);
        }
    });

    // --- 3. ÖLÜM VE YENİDEN DOĞUŞ ---
    bot.on('death', () => {
        bot.chat("Öldüm ama daha güçlü döneceğim!");
    });

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
