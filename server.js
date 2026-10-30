require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const PORT = process.env.PORT || 3000;

// Personalize aqui o "jeito" da sua IA
const SYSTEM_PROMPT =
  'Você é uma assistente de IA prestativa, clara e amigável. ' +
  'Responda sempre no idioma em que o usuário escrever (por padrão, português do Brasil). ' +
  'Seja direta e explique passo a passo quando o assunto for complexo. ' +
  'Quando mostrar código, use blocos de código com a linguagem indicada.';

// Limite simples por IP (protege a sua chave quando o site estiver publicado)
const LIMITE_POR_MINUTO = 20;
const acessos = new Map();

function limitar(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  const agora = Date.now();
  const recentes = (acessos.get(ip) || []).filter((t) => agora - t < 60000);
  if (recentes.length >= LIMITE_POR_MINUTO) {
    return res.status(429).json({ error: 'Muitas perguntas seguidas. Espere um minuto e tente de novo.' });
  }
  recentes.push(agora);
  acessos.set(ip, recentes);
  next();
}

setInterval(() => {
  const agora = Date.now();
  for (const [ip, tempos] of acessos) {
    if (!tempos.some((t) => agora - t < 60000)) acessos.delete(ip);
  }
}, 60000).unref();

app.post('/api/chat', limitar, async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'Chave da API não configurada no servidor (arquivo .env).' });
  }

  const recebidas = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = recebidas
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Mensagem inválida.' });
  }

  try {
    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    const data = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro da API:', data);
      return res.status(502).json({ error: data?.error?.message || 'Erro ao falar com a IA.' });
    }

    const reply = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não consegui falar com a IA agora. Tente de novo.' });
  }
});

app.listen(PORT, () => {
  console.log(`Site rodando em http://localhost:${PORT}`);
});
