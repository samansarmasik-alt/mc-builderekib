const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const { createClient } = require('@supabase/supabase-js');
const { Groq } = require('groq-sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BOSS_NAME = "Hasan"; 

function startBot() {
    const bot = mineflayer.createBot({
        host: 'play4.eternalzero.cloud',
        port: 26608,
        username: 'Hydra_Isci',
        version: "1.20.1",
        auth: 'offline'
    });

    // --- YETENEKLERİ YÜKLE ---
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);

    bot.on('spawn', () => {
        console.log("Hydra İşçi Modu Aktif!");
        bot.chat("/login H123456");
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
    });

    // --- ANA EYLEM FONKSİYONU (Ağaç, Maden, Blok) ---
    async function collectSpecificBlock(blockName, count = 1) {
        const mcData = require('minecraft-data')(bot.version);
        const blockType = mcData.blocksByName[blockName];

        if (!blockType) {
            bot.chat(`${blockName} diye bir blok tanımıyorum patron.`);
            return;
        }

        const blocks = bot.findBlocks({
            matching: blockType.id,
            maxDistance: 64,
            count: count
        });

        if (blocks.length > 0) {
            bot.chat(`${blockName} buldum, topluyorum!`);
            try {
                const targetBlocks = blocks.map(p => bot.blockAt(p));
                await bot.collectBlock.collect(targetBlocks);
                bot.chat("İşlem tamamlandı.");
            } catch (err) {
                bot.chat("Blok toplarken bir sorun çıktı.");
            }
        } else {
            bot.chat(`Yakınlarda hiç ${blockName} bulamadım.`);
        }
    }

    // --- KOMUT DİNLEYİCİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        const msg = message.toLowerCase();

        // 1. AĞAÇ KESME KOMUTU
        if (msg.includes("odun topla") || msg.includes("ağaç kes")) {
            collectSpecificBlock('oak_log', 3); // Meşe odunu toplar
            return;
        }

        // 2. MADEN KAZMA KOMUTU
        if (msg.includes("taş topla") || msg.includes("maden yap")) {
            collectSpecificBlock('cobblestone', 5);
            return;
        }

        // 3. AI PLANLAMA VE CEVAP
        if (msg.includes("hydra") || username === BOSS_NAME) {
            try {
                const completion = await groq.chat.completions.create({
                    messages: [{ role: 'system', content: 'Sen Minecraft yardımcısısın. Maden, odun ve inşaat işlerinden anlarsın.' }, { role: 'user', content: message }],
                    model: 'llama-3.1-8b-instant',
                });
                bot.chat(completion.choices[0].message.content);
            } catch (e) { console.log("AI Hatası"); }
        }
    });

    bot.on('end', () => setTimeout(startBot, 10000));
}

startBot();
