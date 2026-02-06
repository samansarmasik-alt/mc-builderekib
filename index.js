const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

// KONFİGÜRASYON
const SUPA_URL = "https://yiadkkvsmupoftppdfgl.supabase.co";
const SUPA_KEY = "sb_publishable_HFHs-7SG3yJY2hVdPnpZUQ_SL6kcumG";
const GROQ_KEY = "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";

const supabase = createClient(SUPA_URL, SUPA_KEY);
const groq = new Groq({ apiKey: GROQ_KEY });

async function initBot(role) {
    console.log("[" + role + "] Veritabanı kontrol ediliyor...");

    try {
        // 1. Ayarları Çek
        const { data: settings } = await supabase.from('bot_settings').select('*');
        let serverStr = "play4.eternalzero.cloud:26608";
        let bossName = "Patron";

        if (settings) {
            settings.forEach(s => {
                if (s.key_name === 'server_ip') serverStr = s.value_text;
                if (s.key_name === 'boss_name') bossName = s.value_text;
            });
        }

        const parts = serverStr.split(':');
        const host = parts[0];
        const port = parseInt(parts[1]) || 25565;

        // 2. Kimlik Çek
        let { data: id } = await supabase.from('bot_identities').select().eq('role', role).single();
        if (!id) {
            const nick = "Hydra_" + role + "_" + Math.floor(Math.random() * 99);
            await supabase.from('bot_identities').insert({ role: role, username: nick, password: 'H1' });
            id = { username: nick, password: 'H1' };
        }

        console.log("[" + role + "] Hedef: " + host + ":" + port + " olarak belirlendi.");

        // 3. Botu Başlat
        const bot = mineflayer.createBot({
            host: host,
            port: port,
            username: id.username,
            version: "1.20.1"
        });

        // EYLEMLER
        bot.on('spawn', () => {
            console.log("[" + role + "] OYUNA GIRDI.");
            bot.chat("/register H123456 H123456");
            bot.chat("/login H123456");
        });

        bot.on('chat', async (username, message) => {
            if (username === bot.username || username !== bossName) return;

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'Minecraft botusun. Adın ' + bot.username + '. Patronun: ' + bossName },
                        { role: 'user', content: message }
                    ],
                    model: 'llama3-8b-8192'
                });
                bot.chat(completion.choices[0].message.content);
            } catch (aiErr) {
                console.log("AI Hatası: " + aiErr.message);
            }
        });

        bot.on('error', (e) => console.log("Hata: " + e.message));
        bot.on('kicked', (r) => console.log("Atıldı: " + r));

    } catch (err) {
        console.log("Sistem hatası: " + err.message);
    }
}

// BAŞLATMA
initBot('Mimar');
