const mineflayer = require('mineflayer');
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const fs = require('fs');
const { askAI } = require('./brain');

// --- AYARLARI YÖNETME ---
const CONFIG_FILE = 'config_local.json';

// Konsoldan girdi almak için
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function initialize() {
    let config = {};

    // 1. Ayar dosyası var mı kontrol et
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE));
    } else {
        console.log("⚠️  HİÇ AYAR BULUNAMADI! Lütfen Supabase bilgilerini gir.");
        console.log("Bu bilgileri sadece bir kez gireceksin.");
        
        config.supabaseUrl = await askQuestion('Supabase URL: ');
        config.supabaseKey = await askQuestion('Supabase Anon Key: ');
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
        console.log("✅ Ayarlar kaydedildi! Başlatılıyor...");
    }

    // 2. Sistemi Başlat
    startSwarm(config.supabaseUrl, config.supabaseKey);
}

// --- BOT SÜRÜSÜ MANTIĞI ---
async function startSwarm(supaUrl, supaKey) {
    const supabase = createClient(supaUrl, supaKey);

    // Brain.js'e de bu bilgileri gönderiyoruz (Environment Variable olarak inject ediyoruz)
    process.env.SUPABASE_URL = supaUrl;
    process.env.SUPABASE_KEY = supaKey;

    const roles = ['Mimar', 'Lojistikci', 'Insaatci'];
    
    console.log("📡 Sunucu IP'si bekleniyor...");
    
    // IP Kontrol Döngüsü
    setInterval(async () => {
        const { data } = await supabase.from('bot_settings').select().eq('key_name', 'server_ip').single();
        if (data && data.value_text && data.value_text !== 'bekleniyor') {
            // Eğer botlar henüz başlamadıysa başlat
            // (Basitlik için burada tek seferlik başlatma mantığı varsayalım)
        }
    }, 5000);

    roles.forEach(role => createBot(role, supabase));
}

async function createBot(role, supabase) {
    // ... (Önceki bot kodunun aynısı buraya gelecek) ...
    // Sadece IP çekme kısmını bekleme döngüsüne almalısın:
    
    let serverIP = 'bekleniyor';
    while(serverIP === 'bekleniyor') {
        const { data } = await supabase.from('bot_settings').select().eq('key_name', 'server_ip').single();
        if(data) serverIP = data.value_text;
        if(serverIP === 'bekleniyor') await new Promise(r => setTimeout(r, 5000));
    }

    // Kimlik işlemleri...
    let { data: identity } = await supabase.from('bot_identities').select().eq('role', role).single();
    if (!identity) {
        const newName = `Hydra_${role.substring(0,3)}_${Math.floor(Math.random()*999)}`;
        const newPass = Math.random().toString(36).slice(-8);
        await supabase.from('bot_identities').insert({ role, username: newName, password: newPass });
        identity = { username: newName, password: newPass };
    }

    console.log(`[${role}] Bağlanıyor: ${serverIP} (${identity.username})`);

    const bot = mineflayer.createBot({
        host: serverIP,
        username: identity.username,
        version: "1.20.1"
    });

    // ... (Diğer event listenerlar ve brain.js kullanımı aynı) ...
    // Groq API hatası alırsan:
    bot.on('chat', async (username, message) => {
        if(message.includes('test')) {
            const cevap = await askAI("Deneme", 'fast'); // Brain.js artık Supabase'den key çekiyor
            bot.chat(cevap);
        }
    });
}

// Uygulamayı başlat
initialize();
