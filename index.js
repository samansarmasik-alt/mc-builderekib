const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');
const v = require('vec3');

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
        auth: 'offline'
    });

    bot.loadPlugin(pathfinder);

    // --- AKILLI GİRİŞ SİSTEMİ ---
    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString();
        // Sunucu mesajlarını terminale bas ki neden atıldığını görelim
        if (msg.includes("kayıt") || msg.includes("register") || msg.includes("şifre")) {
            logToWeb(role, "Sunucu Mesajı: " + msg);
        }

        if (msg.includes("/register")) {
            bot.chat("/register H123456 H123456");
            logToWeb(role, "Kayıt olundu.");
        } else if (msg.includes("/login")) {
            bot.chat("/login H123456");
            logToWeb(role, "Giriş yapıldı.");
        }
    });

    bot.on('spawn', () => {
        logToWeb(role, "Sunucuya Girdi! Beklemede...");
        // Doğar doğmaz zıpla ki bot korumasına takılmasın
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
    });

    // --- WEB KOMUTLARI ---
    supabase.channel('web_commands').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, async (payload) => {
        if (payload.new.role === 'COMMAND') {
            const cmd = payload.new.message.toLowerCase();
            if (cmd === 'zıpla') {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            } else if (cmd.startsWith('/')) {
                bot.chat(cmd);
            }
        }
    }).subscribe();

    // --- HATA VE KİCK YÖNETİMİ ---
    bot.on('kicked', (reason) => {
        // Atılma sebebini Vercel terminaline detaylıca yazar
        logToWeb(role, "!!! ATILDI !!! Sebep: " + JSON.stringify(reason));
    });

    bot.on('error', (err) => logToWeb(role, "HATA: " + err.message));

    bot.on('end', () => {
        logToWeb(role, "Bağlantı kesildi. 15 saniye sonra yeniden denenecek...");
        setTimeout(startBot, 15000);
    });
}

startBot();
