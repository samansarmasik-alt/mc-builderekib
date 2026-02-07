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

// BOT ÇÖKMESİNİ ENGELLEYEN SİSTEM
process.on('uncaughtException', (err) => console.log('HATA ÖNLENDİ:', err));

const bot = mineflayer.createBot({
    host: 'play4.eternalzero.cloud',
    port: 26608,
    username: 'Hydra_Stabil_AI',
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
let BUSY = false;

bot.on('spawn', () => {
    console.log(`[SİSTEM] Hydra Stabil Modda Aktif.`);
    bot.chat("/login H123456");
    
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    moves.canDig = true;
    moves.allowParkour = true;
    moves.allowSprinting = true;
    bot.pathfinder.setMovements(moves);
    bot.autoEat.options = { priority: 'foodPoints', startAt: 14 };
});

// AKILLI ARAMA FONKSİYONU
function findBlocks(term) {
    return bot.findBlocks({
        matching: (block) => {
            const n = block.name.toLowerCase();
            if (term === 'log') return n.includes('log') || n.includes('stem');
            if (term === 'stone') return n.includes('stone') || n.includes('cobblestone');
            return n.includes(term);
        },
        maxDistance: 64,
        count: 5
    });
}

// GÖREV SIFIRLAMA (BOZULMAYI ÖNLEYEN ANAHTAR)
async function clearAll() {
    bot.pathfinder.setGoal(null);
    bot.pvp.stop();
    try {
        bot.collectBlock.cancelTask(); // Kazma işlemini durdur
    } catch (e) {}
    BUSY = false;
}

bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    if (message.toLowerCase() === "hydraaktif") {
        MASTER = username;
        bot.chat("Sistemler stabilize edildi patron. Emirlerini bekliyorum.");
        return;
    }
    if (username !== MASTER) return;

    // YENİ EMİR GELDİ, HER ŞEYİ DURDUR
    await clearAll();

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'Minecraft asistanısın. [ACTION:FOLLOW/MINE:item/ATTACK/STOP/DROP] kodlarını kullan.' },
                { role: 'user', content: message }
            ],
            model: 'llama-3.3-70b-versatile'
        });

        const aiResponse = completion.choices[0].message.content;
        const actionMatch = aiResponse.match(/\[ACTION:(.+?)\]/);
        const chatMsg = aiResponse.replace(/\[ACTION:(.+?)\]/g, "").trim();

        if (chatMsg) bot.chat(chatMsg);

        if (actionMatch) {
            const action = actionMatch[1];
            console.log(`[HAREKET]: ${action}`);

            if (action === "FOLLOW") {
                const p = bot.players[MASTER]?.entity;
                if (p) bot.pathfinder.setGoal(new goals.GoalFollow(p, 2), true);
            } 
            else if (action.startsWith("MINE:")) {
                const target = action.split(":")[1];
                const blocks = findBlocks(target);
                if (blocks.length > 0) {
                    BUSY = true;
                    bot.collectBlock.collect(blocks.map(p => bot.blockAt(p)), (err) => {
                        if (err) console.log("Kazma iptal edildi.");
                        else bot.chat("İşimi bitirdim patron.");
                        BUSY = false;
                    });
                } else bot.chat("Etrafta " + target + " göremiyorum.");
            }
            else if (action === "ATTACK") {
                const e = bot.nearestEntity(e => e.type === 'mob');
                if (e) bot.pvp.attack(e);
            }
            else if (action === "DROP") {
                for (const item of bot.inventory.items()) await bot.tossStack(item);
                bot.chat("Envanterimi boşalttım.");
            }
        }
    } catch (e) {
        console.error("API HATASI:", e.message);
    }
});
