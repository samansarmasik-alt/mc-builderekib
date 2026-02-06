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
        username: 'Hydra_Gekko',
        version: "1.20.1",
        auth: 'offline'
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(tool);

    bot.on('spawn', () => {
        console.log("Beyin devrede, emirlerini bekliyorum patron!");
        bot.chat("/login H123456");
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
    });

    // --- ÖZEL EYLEMLER ---
    async function performAction(action, target, amount = 1) {
        const mcData = require('minecraft-data')(bot.version);
        if (action === 'collect') {
            const blockType = mcData.blocksByName[target];
            if (!blockType) return bot.chat("O bloğu tanımıyorum.");
            const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: amount });
            if (blocks.length > 0) {
                bot.chat(`${target} toplamaya gidiyorum.`);
                await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                bot.chat("İş bitti patron.");
            } else {
                bot.chat("Etrafta hiç bulamadım.");
            }
        }
    }

    // --- DÜŞÜNEN AI SİSTEMİ ---
    bot.on('chat', async (username, message) => {
        if (username === bot.username || username !== BOSS_NAME) return;

        try {
            // AI'ya sadece sohbet değil, eylem planlatıyoruz
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: `Sen bir Minecraft asistanısın. Kullanıcı eylem istediğinde şu formatta yanıt ver: 
                        ACTION:collect TARGET:oak_log AMOUNT:3 (Örnek odun toplama)
                        ACTION:come (Yanına gelme)
                        Sadece sohbet ise normal cevap ver.` 
                    },
                    { role: 'user', content: message }
                ],
                model: 'llama-3.1-8b-instant',
            });

            const aiResponse = completion.choices[0].message.content;

            if (aiResponse.includes("ACTION:collect")) {
                const target = aiResponse.split("TARGET:")[1].split(" ")[0];
                performAction('collect', target, 3);
            } else if (aiResponse.includes("ACTION:come")) {
                const p = bot.players[username]?.entity;
                if (p) bot.pathfinder.setGoal(new goals.GoalNear(p.position.x, p.position.y, p.position.z, 1));
            } else {
                bot.chat(aiResponse);
            }
        } catch (e) { console.log("AI Beyin Hatası"); }
    });

    bot.on('end', () => setTimeout(startBot, 5000));
}

startBot();
