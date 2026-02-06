const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// AYARLAR (BURAYI DOLDUR)
const serverIP = 'play4.eternalzero.cloud'; // Örn: 'mc.sunucum.com'
const serverPort = 26608; // Genelde budur
const serverVersion = '1.20.1'; // Sunucun hangi sürümse TAM ONU YAZ

// Supabase (Sadece kimlik için kullanıyoruz)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function startBot(role) {
    console.log(`[${role}] Başlatılıyor...`);

    // Kimlik oluşturma/çekme
    let { data: identity } = await supabase.from('bot_identities').select().eq('role', role).single();
    
    if (!identity) {
        const newName = `Hydra_${role.substring(0,3)}_${Math.floor(Math.random() * 999)}`;
        const newPass = "Hydra123!";
        await supabase.from('bot_identities').insert({ role, username: newName, password: newPass });
        identity = { username: newName, password: newPass };
        console.log(`[${role}] Yeni kimlik oluşturuldu: ${newName}`);
    }

    console.log(`[${role}] Bağlanmaya çalışıyor: ${serverIP} Sürüm: ${serverVersion}`);

    const bot = mineflayer.createBot({
        host: serverIP,
        port: serverPort,
        username: identity.username,
        version: serverVersion
    });

    // --- HATA TAKİBİ (BURASI ÇOK ÖNEMLİ) ---
    bot.on('login', () => {
        console.log(`[${role}] SUNUCUYA GİRİŞ YAPTI!`);
    });

    bot.on('error', (err) => {
        console.log(`[${role}] BAĞLANTI HATASI:`, err.message);
    });

    bot.on('kicked', (reason) => {
        console.log(`[${role}] SUNUCUDAN ATILDI:`, reason);
    });

    bot.on('end', () => {
        console.log(`[${role}] Bağlantı kapandı.`);
    });
}

// Botları sırayla başlat
['Mimar', 'Insaatci'].forEach(role => startBot(role));
