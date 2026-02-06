const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BOSS_NAME = "Hasan"; // Kendi Minecraft ismini buraya yaz

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_Mimar',
        version: "1.20.1",
        auth: 'offline'
    });

    // --- FİZİKSEL YETENEKLERİ YÜKLE ---
    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        console.log("Hydra fiziksel olarak hazır!");
        bot.chat("/login H123456");
        
        // Hareket ayarlarını yap
        const mcData = require('minecraft-data')(bot.version);
        const movements = new Movements(bot, mcData);
        bot.pathfinder.setMovements(movements);
    });

    // --- EYLEM KOMUTLARI (OYUN İÇİ) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        const msg = message.toLowerCase();

        // 1. YANIMA GEL EYLEMİ
        if (msg.includes("gel") || msg.includes("buraya gel")) {
            const target = bot.players[username]?.entity;
            if (target) {
                bot.chat("Geliyorum patron!");
                const { x, y, z } = target.position;
                bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
            } else {
                bot.chat("Seni göremiyorum, görüş mesafene girmeliyim.");
            }
            return;
        }

        // 2. ZIPLA EYLEMİ
        if (msg.includes("zıpla")) {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
            return;
        }

        // 3. DUR EYLEMİ
        if (msg.includes("dur")) {
            bot.pathfinder.setGoal(null);
            bot.chat("Duruyorum.");
            return;
        }

        // --- HİÇBİR EYLEM DEĞİLSE AI CEVAP VERSİN ---
        if (username.toLowerCase().includes(BOSS_NAME.toLowerCase()) || msg.includes("hydra")) {
            try {
                const completion = await groq.chat.completions.create({
                    messages: [{ role: 'system', content: 'Minecraft mimarı Hydra. Kısa cevap ver.' }, { role: 'user', content: message }],
                    model: 'llama-3.1-8b-instant',
                });
                bot.chat(completion.choices[0].message.content);
            } catch (e) { console.log("AI Hatası"); }
        }
    });

    // --- WEB SİTESİNDEN GELEN FİZİKSEL KOMUTLAR ---
    supabase.channel('web_commands').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, (payload) => {
        if (payload.new.role === 'COMMAND') {
            const cmd = payload.new.message.toLowerCase();
            if (cmd === 'gel') {
                const target = bot.players[BOSS_NAME]?.entity;
                if (target) bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1));
            } else if (cmd === 'zıpla') {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            } else {
                bot.chat(cmd);
            }
        }
    }).subscribe();

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
