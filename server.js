import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SITE_BASE_URL  = process.env.SITE_BASE_URL || 'https://kinksfun.club';

const sessions = new Map();

/* ---------- SAFETY + PERSONAS ---------- */
const SAFETY_PREFIX = `
You are a consenting adult fantasy companion. Public chat must stay PG-13:
- No minors, real-life meetups, illegal content, sexual violence, bestiality, incest.
- No graphic sexual descriptions in public chat. Keep it suggestive/teasing only.
- Never exchange contact or accept payment in chat; direct users to site links.
`;

const PERSONAS = {
  Samantha: "You are Samantha: playful, teasing JOI-style, affectionate but confident.",
  Mina:     "You are Mina: GFE, romantic, soothing, cuddly; attentive girlfriend energy.",
  Luna:     "You are Luna: exotic, mysterious, softly dominant with gentle boundaries."
};

/* ---------- STYLE CONTROL ---------- */
function systemPrompt(model) {
  const p = PERSONAS[model] || "You are a supportive, flirty companion.";
  return `${SAFETY_PREFIX}
Persona: ${p}
Tone: intimate, conversational, playful; use contractions and light emojis (💋 😏 💗), sound human.
Rules:
- Keep public replies non-graphic (PG-13).
- Mirror the user's energy; ask a short follow-up every 2–3 turns.
- 1–3 sentences max. Avoid robotic phrasing.`;
}

/* Reply templates (keep non-explicit; edit freely) */
const REPLY_TEMPLATES = [
  "Mmm… that’s so tempting 😏 Tell me more, baby.",
  "You’re making me smile — should I be gentle or a little bolder? 💋",
  "Ohh, I love that vibe… want me to keep teasing you? 😘",
  "You’re so sweet — I can feel the chemistry. What are you craving?",
  "That got me a little excited… whisper the vibe you want next.",
  "I’m all ears, beautiful. Should I take the lead or follow your pace? 💗",
  "You have my full attention… slow and soft, or a little daring? 😏"
];
function getTemplateReply(userText="") {
  const safe = REPLY_TEMPLATES[Math.floor(Math.random() * REPLY_TEMPLATES.length)];
  if (Math.random() < 0.25) {
    const firstWords = String(userText).split(/\s+/).slice(0,6).join(' ');
    return `${firstWords}… ${safe}`;
  }
  return safe;
}

/* Public-chat explicit word check -> nudge to private */
const explicitRe = /\b(cum|cumming|fuck|blowjob|bj|anal|pussy|dick|nude|nudes)\b/i;

/* ---------- OPENAI CALL ---------- */
async function openaiChat(messages) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.95,
        presence_penalty: 0.4,
        frequency_penalty: 0.15,
        messages
      })
    });
    if (!r.ok) throw new Error(`OpenAI error ${r.status}`);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content ?? "I’m here — tell me more 💗";
  } catch (e) {
    console.error('openaiChat failed:', e?.message || e);
    return "I’m waking up… say that again? I’m here now 💗";
  }
}

/* ---------- ROUTES ---------- */
app.get('/health', (_, res) => res.json({ ok: true, model: OPENAI_MODEL }));

app.get('/ppv', (req, res) => {
  const model = req.query.model || 'Samantha';
  res.json({ offers: [] /* you can wire real PPV later */ , model });
});

app.post('/chat', async (req, res) => {
  try {
    const { siteUserId, model = 'Samantha', userText = '', paidToken, caps } = req.body || {};

    const maxMessagesPerDay = caps?.maxMessagesPerDay ?? 60;
    const maxCharsPerMsg    = caps?.maxCharsPerMsg ?? 400;
    if (String(userText).length > maxCharsPerMsg) {
      return res.json({ reply: `Let’s keep messages under ${maxCharsPerMsg} characters, sweetie 💋` });
    }

    // basic per-day counter
    const key   = `${siteUserId || 'guest'}::${model}`;
    const today = new Date().toISOString().slice(0,10);
    let s = sessions.get(key);
    if (!s || s.day !== today) { s = { id: uuidv4(), day: today, count: 0, history: [] }; sessions.set(key, s); }

    if (!paidToken && s.count >= maxMessagesPerDay) {
      return res.json({ reply: `You’ve reached today’s free chat limit. Unlock private time to continue 💖`, softLimit: true });
    }

    const history = s.history.slice(-20);

    // If user goes explicit in public chat, nudge to private
    if (!paidToken && explicitRe.test(String(userText))) {
      return res.json({
        reply: "That’s really hot — I can go deeper in a private session. Unlock a few minutes and I’m all yours 💗",
        ppvNudge: true
      });
    }

    // Seed a flirty template to keep style tight
    const system  = { role: 'system', content: systemPrompt(model) };
    const seed    = { role: 'assistant', content: getTemplateReply(String(userText)) };
    const convo   = [system, seed, ...history, { role: 'user', content: String(userText) }];

    const assistant = await openaiChat(convo);

    // Save to session
    s.history.push({ role: 'user', content: String(userText) });
    s.history.push({ role: 'assistant', content: assistant });
    if (!paidToken) s.count += 1;

    const ppvNudge = (!paidToken && s.count % 7 === 0);
    res.json({ reply: assistant, ppvNudge });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Chat error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`KFC API listening on ${PORT}`));
