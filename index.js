const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

// --- BAĞLANTILAR ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BOSS_NAME = "Hasan"; // Kendi Minecraft adını buraya tam yaz!

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_Mimar',
        version: "1.20.1",
        auth: 'offline'
    });

    // --- OYUN İÇİ CHAT DİNLEME (AI) ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return; // Kendi kendine cevap verme
        
        // Sadece patron yazınca veya adını duyunca cevap versin
        if (username.toLowerCase().includes(BOSS_NAME.toLowerCase()) || message.includes("Hydra")) {
            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'Sen Minecraft mimarı Hydra. Patronun Hasan. Kısa ve zeki cevaplar ver.' },
                        { role: 'user', content: `${username} diyor ki: ${message}` }
                    ],
                    model: 'llama-3.1-8b-instant',
                });
                bot.chat(completion.choices[0].message.content);
            } catch (e) {
                console.log("AI Hatası: " + e.message);
            }
        }
    });

    // --- WEB SİTESİNDEN GELEN KOMUTLAR ---
    supabase.channel('web_commands')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, (payload) => {
            if (payload.new.role === 'COMMAND') {
                const cmd = payload.new.message;
                console.log("Web'den gelen emir:", cmd);
                
                if (cmd === 'zıpla') {
                    bot.setControlState('jump', true);
                    setTimeout(() => bot.setControlState('jump', false), 500);
                } else {
                    bot.chat(cmd); // Siteden ne yazarsan oyunda onu yapar/söyler
                }
            }
        })
        .subscribe();

    bot.on('spawn', () => {
        console.log("Hydra uyandı ve seni dinliyor patron!");
        bot.chat("/login H123456");
    });

    bot.on('end', () => {
        console.log("Bağlantı koptu, 15sn sonra tekrar denenecek...");
        setTimeout(startBot, 15000);
    });

    bot.on('error', (err) => console.log("Hata:", err));
}

startBot();
