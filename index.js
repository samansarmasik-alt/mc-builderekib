const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function startBot() {
    // İsmin sonuna 100-999 arası sayı ekler, çakışmayı önler
    const randomId = Math.floor(Math.random() * 900) + 100;
    const botName = `Hydra_${randomId}`;

    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: botName,
        version: "1.20.1",
        auth: 'offline'
    });

    bot.on('spawn', () => {
        console.log(`[Mimar] ${bot.username} olarak giriş yaptı!`);
        // Senin ismini whitelist'e eklemişiz gibi davranalım
        bot.chat("/register H123456 H123456");
        bot.chat("/login H123456");
    });

    bot.on('kicked', (reason) => {
        const msg = JSON.stringify(reason);
        console.log(`[Mimar] Atıldı: ${msg}`);
        // Eğer hala çakışma varsa daha uzun bekle
        if (msg.includes("duplicate")) {
            bot.end();
        }
    });

    bot.on('error', (err) => console.log(`[Mimar] Hata: ${err.message}`));
    
    bot.on('end', () => {
        console.log("[Mimar] Bağlantı bitti. 20 saniye sonra yeni isimle denenecek...");
        setTimeout(startBot, 20000);
    });
}

startBot();
