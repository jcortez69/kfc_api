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

const SAFETY_PREFIX = `
You are a consenting adult fantasy companion. Rules:
- No minors, IRL meetups, illegal content, sexual violence, bestiality, incest.
- Keep it suggestive and flirty without graphic descriptions.
- Never share contact or accept payment in chat; direct users to the site links.
`;

const PERSONAS = {
  Samantha: "You are Samantha: playful, teasing JOI-style, affectionate but confident.",
  Mina:     "You are Mina: GFE, romantic, soothing, cuddly; attentive girlfriend energy.",
  Luna:     "You are Luna: exotic, mysterious, softly dominant with gentle boundaries."
};

const PPV_OFFERS = [
  { id: 501, title: "Samantha: Private Pic Set (5)", price: 9.99, model: "Samantha" },
  { id: 502, title: "Mina: Voice Tease (60s)",       price: 7.99, model: "Mina" },
  { id: 503, title: "Luna: Fantasy Pic Pair (2)",    price: 6.99, model: "Luna" }
];

function systemPrompt(model) {
  const p = PERSONAS[model] || "You are a supportive, flirty companion.";
  return ${SAFETY_PREFIX}\nPersona: ${p}\nTone: warm, seductive, consent-first.\nKeep replies short (1–3 lines).;
}

async function openaiChat(messages) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': Bearer ${OPENAI_API_KEY} },
    body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.95, messages })
  });
  if (!r.ok) throw new Error(OpenAI error ${r.status});
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? '...';
}

app.get('/health', (_, res) => res.json({ ok: true, model: OPENAI_MODEL }));

app.get('/ppv', (req, res) => {
  const model = req.query.model || 'Samantha';
  res.json({ offers: PPV_OFFERS.filter(o => o.model === model) });
});

app.post('/chat', async (req, res) => {
  try {
    const { siteUserId, model = 'Samantha', userText = '', paidToken, caps } = req.body || {};
    const maxMessagesPerDay = caps?.maxMessagesPerDay ?? 60;
    const maxCharsPerMsg    = caps?.maxCharsPerMsg ?? 400;

    if (String(userText).length > maxCharsPerMsg) {
      return res.json({ reply: Let’s keep messages under ${maxCharsPerMsg} characters, sweetie 💋 });
    }

    const key   = ${siteUserId || 'guest'}::${model};
    const today = new Date().toISOString().slice(0, 10);
    let s = sessions.get(key);
    if (!s || s.day !== today) { s = { id: uuidv4(), day: today, count: 0, history: [] }; sessions.set(key, s); }

    if (!paidToken && s.count >= maxMessagesPerDay) {
      return res.json({ reply: You’ve reached today’s free chat limit. Unlock private time to continue 💖, softLimit: true });
    }

    const history = s.history.slice(-20);
    const system  = { role: 'system', content: systemPrompt(model) };
    const convo   = [system, ...history, { role: 'user', content: String(userText) }];

    const assistant = await openaiChat(convo);

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
app.listen(PORT, () => console.log(KFC API listening on ${PORT}));
