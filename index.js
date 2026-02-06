const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

// --- BAĞLANTILAR ---
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

const supabase = createClient(SUPA_URL, SUPA_KEY);
const groq = new Groq({ apiKey: GROQ_KEY });

async function logToWeb(role, message) {
    console.log(`[${role}] ${message}`);
    await supabase.from('bot_logs').insert({ role, message });
}

function startBot() {
    const role = "Mimar";
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_Mimar',
        version: "1.20.1",
        auth: 'offline',
        checkTimeoutInterval: 60000 // Bağlantı zaman aşımını uzattık
    });

    bot.loadPlugin(pathfinder);

    // --- DOĞUŞ VE HAYATTA KALMA ---
    bot.on('spawn', () => {
        logToWeb(role, "Sunucuya Girdi ve Sabitlendi!");
        
        // 1. Giriş Komutları (Gecikmeli yaparak kick yemeyi önlüyoruz)
        setTimeout(() => bot.chat("/register H123456 H123456"), 1000);
        setTimeout(() => bot.chat("/login H123456"), 2000);

        // 2. Anti-AFK (30 saniyede bir küçük bir hareket yapar, sunucu atmasın diye)
        setInterval(() => {
            if (bot.entity) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            }
        }, 30000); 
    });

    // --- WEB TERMİNAL DİNLEYİCİ ---
    supabase.channel('web_commands').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, async (payload) => {
        if (payload.new.role === 'COMMAND') {
            const cmd = payload.new.message.toLowerCase();
            if (cmd === 'zıpla') {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            } else if (cmd === 'gel') {
                // ... (Gelme kodları aynı kalabilir) ...
            } else {
                bot.chat(cmd);
            }
        }
    }).subscribe();

    // --- AI CHAT (GÜNCEL MODEL) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Sen Minecraft mimarısın. Adın Hydra. Patronun Hasan. Kısa cevap ver.' },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.1-8b-instant', 
            });
            bot.chat(chatCompletion.choices[0].message.content);
        } catch (e) {
            logToWeb(role, "Zeka Hatası: " + e.message);
        }
    });

    // --- KRİTİK: DÜŞERSE GERİ DÖN ---
    bot.on('kicked', (reason) => {
        logToWeb(role, "Atıldı! Sebep: " + reason);
    });

    bot.on('error', (err) => {
        logToWeb(role, "Hata Oluştu: " + err.message);
    });

    bot.on('end', () => {
        logToWeb(role, "Bağlantı koptu. 10 saniye içinde tekrar deneniyor...");
        setTimeout(startBot, 10000); // 10 saniye sonra otomatik restart
    });
}

startBot();
