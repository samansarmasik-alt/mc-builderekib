const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const { Groq } = require('groq-sdk');
const v = require('vec3');

const groq = new Groq({ apiKey: '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' });

const bot = mineflayer.createBot({
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Full_Auto',
    version: "1.20.1",
    auth: 'offline'
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(autoEat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);

let MASTER = "";

bot.on('spawn', () => {
    console.log(`[OTOMASYON] Hydra Full Auto aktif. Artık her şeyi görüyorum.`);
    bot.chat("/login H123456");
    
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allowParkour = true;
    moves.allowSprinting = true;
    bot.pathfinder.setMovements(moves);
});

// Akıllı Blok Bulucu (Odun, Taş, Maden gruplarını otomatik anlar)
function findTargetBlocks(term, count = 5) {
    const mcData = require('minecraft-data')(bot.version);
    return bot.findBlocks({
        matching: (block) => {
            const name = block.name.toLowerCase();
            if (term === 'log' || term === 'odun') return name.includes('log') || name.includes('stem');
            if (term === 'stone' || term === 'taş') return name.includes('stone') || name.includes('cobblestone');
            if (term === 'coal' || term === 'kömür') return name.includes('coal_ore');
            if (term === 'iron' || term === 'demir') return name.includes('iron_ore');
            if (term === 'diamond' || term === 'elmas') return name.includes('diamond_ore');
            return name.includes(term);
        },
        maxDistance: 64, // Görüş mesafesini 64 bloğa çıkardık
        count: count
    });
}

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Tam otomasyon moduna geçtim patron. Gözümden hiçbir şey kaçmaz.");
        return;
    }
    if (username !== MASTER) return;

    try {
        const inventory = bot.inventory.items().map(i => `${i.name}`).join(', ') || "boş";
        
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: `Sen Minecraft'ta Hydra'sın. [ACTION:MINE:item_name:miktar] veya [ACTION:FOLLOW] komutlarını kullan. Örnek: [ACTION:MINE:log:5]` },
                { role: 'user', content: `Mesaj: ${message} | Envanter: ${inventory}` }
            ],
            model: 'llama-3.3-70b-versatile'
        });

        const aiResponse = completion.choices[0].message.content;
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const chatMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (chatMsg) bot.chat(chatMsg);

        if (actionMatch) {
            const parts = actionMatch[1].split(':');
            const action = parts[0];

            if (action === "MINE") {
                const target = parts[1];
                const amount = parseInt(parts[2]) || 3;
                
                bot.chat(`${target} aramaya çıkıyorum...`);
                const blocks = findTargetBlocks(target, amount);

                if (blocks.length > 0) {
                    try {
                        await bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)));
                        bot.chat(`İşlem tamam, ${blocks.length} adet topladım.`);
                    } catch (err) {
                        bot.chat("Bazı bloklara ulaşamadım ama aramaya devam ediyorum.");
                    }
                } else {
                    bot.chat("Şu an etrafımda hiç " + target + " göremiyorum, biraz gezip tekrar bakacağım.");
                    // Bulamazsa rastgele bir yöne 10 blok gidip tekrar araması için hedef verilebilir
                }
            } else if (action === "FOLLOW") {
                const player = bot.players[MASTER]?.entity;
                if (player) bot.pathfinder.setGoal(new goals.GoalFollow(player, 2), true);
            }
            // Diğer aksiyonlar (ATTACK, DROP vb.) önceki kodla aynı kalabilir
        }
    } catch (e) {
        console.error(e);
    }
});
