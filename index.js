const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- BAĞLANTILAR ---
const SUPA_URL = process.env.SUPABASE_URL || "URL_GIR";
const SUPA_KEY = process.env.SUPABASE_KEY || "KEY_GIR";
const GROQ_KEY = process.env.GROQ_API_KEY || "GROQ_KEY_GIR";

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
        logToWeb(role, "Sunucuya Girdi! Siteden komut gönderebilirsin.");
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
                    logToWeb(role, "Patrona doğru koşuyorum!");
                }
            } else {
                bot.chat(cmd); // Siteden yazılan her şeyi oyunda söyler veya /komut çalıştırır
            }
        }
    }).subscribe();

    // --- AI CHAT SİSTEMİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Sen Minecraft mimarısın. Adın Hydra. Patronun adı Hasan. Kısa cevaplar ver.' },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.3-7b-versatile',
            });
            bot.chat(chatCompletion.choices[0].message.content);
        } catch (e) {
            logToWeb(role, "AI Hatası: " + e.message);
        }
    });

    bot.on('error', (err) => logToWeb(role, "HATA: " + err.message));
    bot.on('kicked', (reason) => logToWeb(role, "ATILDI: " + reason));
    bot.on('end', () => setTimeout(startBot, 10000)); // Kapanırsa 10 sn sonra geri açılır
}

startBot();
