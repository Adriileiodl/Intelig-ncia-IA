const STORAGE_KEY = 'minha-ia:conversas';

const $messages = document.getElementById('messages');
const $form = document.getElementById('form');
const $input = document.getElementById('input');
const $sendBtn = document.getElementById('sendBtn');
const $list = document.getElementById('chatList');
const $newChat = document.getElementById('newChat');
const $title = document.getElementById('chatTitle');
const $sidebar = document.getElementById('sidebar');
const $overlay = document.getElementById('overlay');
const $menuBtn = document.getElementById('menuBtn');

let chats = carregar();
let currentId = chats.length ? chats[0].id : null;
let carregando = false;

/* ---------- armazenamento ---------- */
function carregar() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function salvar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function chatAtual() {
  return chats.find((c) => c.id === currentId) || null;
}

/* ---------- conversas ---------- */
function novaConversa() {
  // Se já existe uma conversa vazia, reaproveita
  const vazia = chats.find((c) => c.messages.length === 0);
  if (vazia) {
    currentId = vazia.id;
  } else {
    const chat = { id: String(Date.now()), title: 'Nova conversa', messages: [] };
    chats.unshift(chat);
    currentId = chat.id;
    salvar();
  }
  renderTudo();
  fecharMenu();
  $input.focus();
}

function abrirConversa(id) {
  currentId = id;
  renderTudo();
  fecharMenu();
}

function apagarConversa(id) {
  chats = chats.filter((c) => c.id !== id);
  if (currentId === id) currentId = chats.length ? chats[0].id : null;
  salvar();
  renderTudo();
}

/* ---------- renderização ---------- */
function renderTudo() {
  renderLista();
  renderMensagens();
}

function renderLista() {
  $list.innerHTML = '';

  if (!chats.length) {
    const p = document.createElement('li');
    p.className = 'empty-list';
    p.textContent = 'Nenhuma pergunta ainda.';
    $list.appendChild(p);
    return;
  }

  chats.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'chat-item' + (c.id === currentId ? ' active' : '');

    const nome = document.createElement('span');
    nome.className = 'name';
    nome.textContent = c.title;

    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Apagar';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Apagar esta conversa?')) apagarConversa(c.id);
    });

    li.append(nome, del);
    li.addEventListener('click', () => abrirConversa(c.id));
    $list.appendChild(li);
  });
}

function renderMensagens() {
  const chat = chatAtual();
  $messages.innerHTML = '';
  $title.textContent = chat && chat.messages.length ? chat.title : 'Minha IA';

  if (!chat || !chat.messages.length) {
    mostrarBoasVindas();
    return;
  }

  chat.messages.forEach((m) => adicionarBolha(m.role, m.content));
  rolarParaBaixo();
}

function mostrarBoasVindas() {
  const div = document.createElement('div');
  div.className = 'welcome';
  div.innerHTML = `
    <h2>Olá! Como posso ajudar?</h2>
    <p>Faça uma pergunta abaixo ou escolha uma sugestão.</p>
    <div class="chips"></div>
  `;
  const chips = div.querySelector('.chips');
  [
    'Explique como funciona a internet',
    'Me ajude a criar um plano de estudos',
    'Escreva um código em JavaScript',
    'Me dê ideias de projetos'
  ].forEach((texto) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = texto;
    b.addEventListener('click', () => {
      $input.value = texto;
      enviar();
    });
    chips.appendChild(b);
  });
  $messages.appendChild(div);
}

function adicionarBolha(role, texto, extraClasse = '') {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role} ${extraClasse}`.trim();
  const bolha = document.createElement('div');
  bolha.className = 'bubble';
  if (role === 'assistant' && !extraClasse) {
    bolha.innerHTML = markdown(texto);
  } else {
    bolha.textContent = texto;
  }
  wrap.appendChild(bolha);
  $messages.appendChild(wrap);
  return wrap;
}

function rolarParaBaixo() {
  $messages.scrollTop = $messages.scrollHeight;
}

/* ---------- markdown simples e seguro ---------- */
function escapar(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdown(texto) {
  const blocos = [];
  // separa blocos de código
  let html = escapar(texto).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocos.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    return `\u0000${blocos.length - 1}\u0000`;
  });

  html = html
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[Number(i)]);
}

/* ---------- envio ---------- */
async function enviar() {
  const texto = $input.value.trim();
  if (!texto || carregando) return;

  let chat = chatAtual();
  if (!chat) {
    chat = { id: String(Date.now()), title: 'Nova conversa', messages: [] };
    chats.unshift(chat);
    currentId = chat.id;
  }

  // O título da conversa vem da primeira pergunta
  if (!chat.messages.length) {
    chat.title = texto.length > 40 ? texto.slice(0, 40) + '…' : texto;
  }

  chat.messages.push({ role: 'user', content: texto });
  salvar();

  $input.value = '';
  ajustarAltura();
  renderTudo();

  carregando = true;
  $sendBtn.disabled = true;

  const digitando = adicionarBolha('assistant', '', 'typing-wrap');
  digitando.querySelector('.bubble').innerHTML =
    '<div class="typing"><span></span><span></span><span></span></div>';
  rolarParaBaixo();

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chat.messages })
    });
    const data = await resp.json();
    digitando.remove();

    if (!resp.ok) throw new Error(data.error || 'Erro inesperado.');

    chat.messages.push({ role: 'assistant', content: data.reply });
    salvar();
    adicionarBolha('assistant', data.reply);
  } catch (err) {
    digitando.remove();
    adicionarBolha('assistant', err.message || 'Erro ao responder.', 'error');
    // remove a pergunta sem resposta para não quebrar o histórico
    chat.messages.pop();
    salvar();
    $input.value = texto;
  } finally {
    carregando = false;
    $sendBtn.disabled = false;
    renderLista();
    rolarParaBaixo();
    $input.focus();
  }
}

/* ---------- caixa de texto ---------- */
function ajustarAltura() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 180) + 'px';
}

$input.addEventListener('input', ajustarAltura);

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  enviar();
});

/* ---------- menu no celular ---------- */
function abrirMenu() {
  $sidebar.classList.add('open');
  $overlay.classList.add('show');
}
function fecharMenu() {
  $sidebar.classList.remove('open');
  $overlay.classList.remove('show');
}

$menuBtn.addEventListener('click', abrirMenu);
$overlay.addEventListener('click', fecharMenu);
$newChat.addEventListener('click', novaConversa);

/* ---------- início ---------- */
renderTudo();
