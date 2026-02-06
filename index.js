const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

// --- AYARLARIN ---
const SUPA_URL = "https://yiadkkvsmupoftppdfgl.supabase.co";
const SUPA_KEY = "sb_publishable_HFHs-7SG3yJY2hVdPnpZUQ_SL6kcumG";
const GROQ_KEY = "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";

const supabase = createClient(SUPA_URL, SUPA_KEY);
const groq = new Groq({ apiKey: GROQ_KEY });

// SİTEYE YAZI GÖNDEREN FONKSİYON
async function logToWeb(role, message) {
    console.log(`[${role}] ${message}`);
    await supabase.from('bot_logs').insert({ role, message });
}

async function startBot(role) {
    // 1. Bilgileri Supabase'den çek
    const { data: settings } = await supabase.from('bot_settings').select('*');
    let serverIP = "play4.eternalzero.cloud:26608";
    let bossName = "Patron";

    if (settings) {
        settings.forEach(s => {
            if (s.key_name === 'server_ip') serverIP = s.value_text;
            if (s.key_name === 'boss_name') bossName = s.value_text;
        });
    }

    const [host, port] = serverIP.split(':');
    await logToWeb(role, `${host}:${port} adresine bağlanılıyor...`);

    // 2. Botu Oluştur
    const bot = mineflayer.createBot({
        host: host,
        port: parseInt(port) || 25565,
        username: 'Hydra_' + role,
        version: "1.20.1"
    });

    // --- WEB'DEN GELEN KOMUTLARI DİNLE (CMD BURASI) ---
    supabase.channel('web_commands')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, (payload) => {
            if (payload.new.role === 'COMMAND') {
                const cmd = payload.new.message;
                logToWeb(role, `Web CMD İşleniyor: ${cmd}`);
                
                if (cmd.startsWith('/')) {
                    bot.chat(cmd); // Siteden gelen / ile başlayan her şeyi sunucuda yazar
                } else if (cmd === 'gel') {
                    // Özel komut örneği: Yanına ışınlanma vs.
                    bot.chat(`${bossName} yanına geliyorum!`);
                } else {
                    bot.chat(cmd); // Normal mesaj olarak gönder
                }
            }
        })
        .subscribe();

    // --- BOT OLAYLARI ---
    bot.on('spawn', () => {
        logToWeb(role, "Sunucuya Girdi! Siteden komut gönderebilirsin.");
        bot.chat("/register H123456 H123456");
        bot.chat("/login H123456");
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username || username !== bossName) return;
        
        // AI Yanıtı
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: message }],
                model: 'llama3-8b-8192',
            });
            bot.chat(chatCompletion.choices[0].message.content);
        } catch (e) { logToWeb(role, "AI Hatası: " + e.message); }
    });

    bot.on('error', (err) => logToWeb(role, "HATA: " + err.message));
    bot.on('kicked', (reason) => logToWeb(role, "Kovuldu: " + reason));
}

// BAŞLAT
startBot('Mimar');
