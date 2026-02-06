const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');

// index.js çalıştığında process.env değerlerini doldurmuş olacak
function getSupabase() {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

async function getApiKey(provider) {
    const supabase = getSupabase();
    const { data } = await supabase.from('api_vault').select('api_key').eq('provider', provider).eq('is_active', true);
    if (!data || data.length === 0) return null;
    return data[Math.floor(Math.random() * data.length)].api_key;
}

async function askAI(prompt, type = 'fast') {
    try {
        if (type === 'fast') {
            const key = await getApiKey('groq');
            if (!key) return "Groq API anahtarı yok patron!";
            
            const groq = new Groq({ apiKey: key });
            const res = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-8b-8192'
            });
            return res.choices[0].message.content;
        }
        // Gemini kısmı da benzer mantıkla...
    } catch (e) {
        return "Beyin hatası: " + e.message;
    }
}

module.exports = { askAI };
