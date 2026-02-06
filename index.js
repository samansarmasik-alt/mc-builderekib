const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- BAĞLANTILAR (GitHub Secrets'tan gelir) ---
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

const supabase = createClient(SUPA_URL, SUPA_KEY);
const groq = new Groq({ apiKey: GROQ_KEY });

async function logToWeb(role, message) {
    console.log(`[${role}] ${message}`);
    await supabase.from('bot_logs').insert({ role, message });
}

async function startBot() {
    const role = "Mimar";
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_Mimar',
        version: "1.20.1",
        auth: 'offline'
    });

    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        logToWeb(role, "Sistem Aktif! Model: Llama 3.1");
        bot.chat("/register H123456 H123456");
        bot.chat("/login H123456");
    });

    // --- WEB TERMİNAL DİNLEYİCİ ---
    supabase.channel('web_commands').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, async (payload) => {
        if (payload.new.role === 'COMMAND') {
            const cmd = payload.new.message.toLowerCase();
            
            if (cmd === 'zıpla') {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            } else if (cmd === 'gel') {
                const target = Object.values(bot.players).find(p => p.username.toLowerCase().includes("hasan"))?.entity;
                if (target) {
                    const mcData = require('minecraft-data')(bot.version);
                    bot.pathfinder.setMovements(new Movements(bot, mcData));
                    bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1));
                    logToWeb(role, "Hasan'a doğru geliyorum!");
                }
            } else {
                bot.chat(cmd);
            }
        }
    }).subscribe();

    // --- AI CHAT SİSTEMİ (GÜNCEL MODEL) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Sen Minecraft mimarısın. Adın Hydra. Patronun Hasan. Kısa cevap ver.' },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.1-8b-instant', // <--- BURASI DÜZELDİ
            });
            bot.chat(chatCompletion.choices[0].message.content);
        } catch (e) {
            logToWeb(role, "Zeka Hatası: " + e.message);
        }
    });

    bot.on('error', (err) => logToWeb(role, "HATA: " + err.message));
    bot.on('kicked', (reason) => logToWeb(role, "Kovuldu: " + reason));
    bot.on('end', () => setTimeout(startBot, 5000));
}

startBot();
