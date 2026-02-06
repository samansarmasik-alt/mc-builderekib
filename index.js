const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

// --- SENİN BİLGİLERİN ---
const SUPA_URL = "https://yiadkkvsmupoftppdfgl.supabase.co";
const SUPA_KEY = "sb_publishable_HFHs-7SG3yJY2hVdPnpZUQ_SL6kcumG";
const GROQ_KEY = "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";

const supabase = createClient(SUPA_URL, SUPA_KEY);

async function startBot(role) {
    console.log(`[${role}] Sistemi başlatılıyor...`);

    // 1. Supabase'den Sunucu IP ve Boss Adını Çek
    let { data: settings } = await supabase.from('bot_settings').select('*');
    const serverIP = settings.find(s => s.key_name === 'server_ip')?.value_text || "play4.eternalzero.cloud:26608";
    const bossName = settings.find(s => s.key_name === 'boss_name')?.value_text || "Patron";

    const [host, port] = serverIP.split(':');

    // 2. Bot Kimliğini Ayarla (Yoksa oluştur)
    let { data: identity } = await supabase.from('bot_identities').select().eq('role', role).single();
    
    if (!identity) {
        const newName = `Hydra_${role}_${Math.floor(Math.random() * 99)}`;
        const newPass = "Hydra123!";
        await supabase.from('bot_identities').insert({ role, username: newName, password: newPass });
        identity = { username: newName, password: newPass };
    }

    console.log(`[${role}] Bağlanıyor: ${host}:${port || 25565} (Sürüm: 1.20.1)`);

    // 3. Botu Oluştur
    const bot = mineflayer.createBot({
        host: host,
        port: parseInt(port) || 25565,
        username: identity.username,
        version: "1.20.1",
        checkTimeoutInterval: 60000
    });

    // --- BOT ETKİLEŞİMLERİ ---

    bot.on('spawn', () => {
        console.log(`[${role}] Sunucuya girdi! Kullanıcı adı: ${bot.username}`);
        // Sunucuya girince otomatik kayıt/giriş (AuthMe varsa)
        bot.chat(`/register ${identity.password} ${identity.password}`);
        bot.chat(`/login ${identity.password}`);
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username || username !== bossName) return;

        console.log(`[${role}] Mesaj alındı (${username}): ${message}`);

        // AI Yanıtı (Groq Llama 3)
        try {
            const groq = new Groq({ apiKey: GROQ_KEY });
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: `Sen bir Minecraft botusun. Adın ${bot.username}, rolün ${role}. Patronun adı ${bossName}. Kısa ve öz cevap ver.` },
                    { role: 'user', content: message }
                ],
                model: 'llama3-8b-8192',
            });

            const reply = chatCompletion.choices[0].message.content;
            bot.chat(reply);
        } catch (err) {
            console.error("AI Hatası:", err.message);
        }
    });

    // Hata Yönetimi
    bot.on('error', (err) => console.log(`[${role}] Hata:`, err.message));
    bot.on('kicked', (reason) => console.log(`[${role}] Atıldı:`, reason));
}

// Botları Çalıştır
startBot('Mimar');
// startBot('Savasci'); // İstersen daha fazla bot ekleyebilirsin
