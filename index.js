const v = require('vec3'); // En üste ekle
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// ... (Supabase ve Groq bağlantı kodların burada kalsın) ...

async function startBot(role) {
    const bot = mineflayer.createBot({
        host: host,
        port: port,
        username: 'Hydra_Mimar',
        version: "1.20.1",
        auth: 'offline'
    });

    // PATHFINDER YÜKLE (Botun yürümesi için şart)
    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        logToWeb(role, "Mimar hazır! Creative yetkisi bekliyorum.");
    });

    // --- İNŞAAT FONKSİYONU (Basit Bir Kule/Duvar) ---
    async function buildSimpleStructure(position) {
        const mcData = require('minecraft-data')(bot.version);
        const movements = new Movements(bot, mcData);
        bot.pathfinder.setMovements(movements);

        // Elinde taş olduğundan emin ol (Creative modda her şeyi alabilir)
        const blockType = mcData.blocksByName.stone.id;

        logToWeb(role, "İnşaat başlıyor...");
        
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 3; x++) {
                const targetPos = position.offset(x, y, 0);
                if (bot.blockAt(targetPos).name === 'air') {
                    await bot.lookAt(targetPos);
                    // Creative modda blok koyma
                    try {
                        await bot.placeBlock(bot.blockAt(targetPos.offset(0, -1, 0)), new require('vec3')(0, 1, 0));
                    } catch (e) {
                        console.log("Blok koyulamadı: " + e.message);
                    }
                }
            }
        }
        logToWeb(role, "İnşaat tamamlandı!");
    }

    // --- KOMUT DİNLEYİCİSİ (Siteden Gelen) ---
    supabase.channel('web_commands').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, async (payload) => {
        if (payload.new.role === 'COMMAND') {
            const cmd = payload.new.message;

            if (cmd === 'inşaat-yap') {
                const p = bot.entity.position.offset(2, 0, 2);
                buildSimpleStructure(p);
            } else if (cmd === 'gel') {
                // Patronun (senin) yanına gelme komutu
                const player = bot.players[bossName];
                if (player) {
                    const target = player.entity.position;
                    bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 1));
                    logToWeb(role, "Yanına geliyorum patron!");
                }
            } else {
                bot.chat(cmd);
            }
        }
    }).subscribe();
}
