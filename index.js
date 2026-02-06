const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = "https://yiadkkvsmupoftppdfgl.supabase.co";
const SUPA_KEY = "sb_publishable_HFHs-7SG3yJY2hVdPnpZUQ_SL6kcumG";
const supabase = createClient(SUPA_URL, SUPA_KEY);

// SİTEYE LOG GÖNDERME FONKSİYONU
async function logToWeb(role, message) {
    console.log(`[${role}] ${message}`); // Bilgisayarda göster
    await supabase.from('bot_logs').insert({ role, message }); // Sitedeki terminale gönder
}

async function startBot(role) {
    await logToWeb(role, "Bağlantı kuruluyor...");

    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_' + role,
        version: "1.20.1"
    });

    bot.on('spawn', () => {
        logToWeb(role, "Sunucuya Girdi! Aktif.");
    });

    bot.on('chat', (username, message) => {
        logToWeb(role, `${username}: ${message}`);
    });

    bot.on('error', (err) => logToWeb(role, "HATA: " + err.message));
    bot.on('kicked', (reason) => logToWeb(role, "ATILDI: " + reason));
}

startBot('Mimar');
