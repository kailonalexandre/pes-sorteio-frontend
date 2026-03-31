// ============================================================
//  PES SORTEIO — FRONT-END (script.js)
//  Responsabilidade: SOMENTE renderização e emissão de eventos.
//  Toda lógica de negócio vive no server.js.
// ============================================================

// TESTE: Se você vê esta mensagem, o arquivo foi atualizado!
console.log('✅✅✅ SCRIPT.JS CARREGADO COM SUCESSO - v2.1 ✅✅✅');
// Ambiente: local vs produção
const BACKEND_URL = 'https://pes-backend-production.up.railway.app';
const _params = new URLSearchParams(window.location.search);
const TOURNAMENT_ID = _params.get('id') || null;
const IS_NEW_ROOM   = _params.get('new') === '1';

if (!TOURNAMENT_ID) {
  window.location.href = 'lobby.html';
}

// ─── INICIALIZAÇÃO DO SOCKET.IO ──────────────────────────────

let socket = null;
let pollInterval = null;
let lastStateHash = null;

function initSocket() {
  console.log('🔧 Inicializando Socket.io...');
  console.log('🔌 Backend URL:', BACKEND_URL);
  
  socket = io(BACKEND_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    transports: ['websocket', 'polling']  // Tenta WebSocket primeiro, depois polling
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket Conectado:', socket.id);
    clearInterval(pollInterval);  // Para polling se tinha iniciado
    joinRoom();
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ WebSocket Desconectado. Iniciando polling...');
    startPolling();  // Fallback para polling
  });

  socket.on('roomJoined', ({ tournamentId, state }) => {
    console.log('🎫 Sala entrada:', tournamentId);
    onStateUpdated(state);
  });

  socket.on('roomError', (msg) => {
    console.error('❌ Erro na sala:', msg);
    sessionStorage.setItem('lobbyError', msg);
    window.location.href = 'lobby.html';
  });

  socket.on('stateUpdated', (state) => {
    console.log('📡 Estado atualizado recebido via Socket');
    onStateUpdated(state);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Erro de conexão Socket:', error.message);
  });
}

// ─── FUNÇÕES DE SALA ─────────────────────────────────────────

function joinRoom() {
  if (!socket || !socket.connected) {
    console.warn('⚠️ Socket não está conectado. Tentando novamente...');
    setTimeout(joinRoom, 2000);
    return;
  }

  if (IS_NEW_ROOM) {
    console.log('📍 Criando novo torneio:', TOURNAMENT_ID);
    socket.emit('createTournament', TOURNAMENT_ID);
  } else {
    console.log('📍 Entrando no torneio:', TOURNAMENT_ID);
    socket.emit('joinTournament', TOURNAMENT_ID);
  }
}

// ─── POLLING HTTP (FALLBACK) ────────────────────────────────

function startPolling() {
  console.log('📊 Iniciando polling a cada 2 segundos...');
  
  if (pollInterval) clearInterval(pollInterval);
  
  pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tournament/${TOURNAMENT_ID}`);
      if (response.ok) {
        const state = await response.json();
        if (state) {
          const stateHash = JSON.stringify(state);
          if (stateHash !== lastStateHash) {
            console.log('📡 Estado atualizado via Polling');
            lastStateHash = stateHash;
            onStateUpdated(state);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Polling error:', err.message);
    }
  }, 2000);
}

// Iniciar Socket.io ao carregar
initSocket();

// ─── CONSTANTES DE COR ───────────────────────────────────────

const COLORS = [
  { badge:'#00e5ff', badgeText:'#000', dot:'#00e5ff', border:'#00e5ff44', bg:'#00e5ff11' },
  { badge:'#ff0066', badgeText:'#fff', dot:'#ff0066', border:'#ff006644', bg:'#ff006611' },
  { badge:'#7c3aed', badgeText:'#fff', dot:'#7c3aed', border:'#7c3aed44', bg:'#7c3aed11' },
  { badge:'#f59e0b', badgeText:'#000', dot:'#f59e0b', border:'#f59e0b44', bg:'#f59e0b11' },
  { badge:'#10b981', badgeText:'#000', dot:'#10b981', border:'#10b98144', bg:'#10b98111' },
  { badge:'#ef4444', badgeText:'#fff', dot:'#ef4444', border:'#ef444444', bg:'#ef444411' },
  { badge:'#3b82f6', badgeText:'#fff', dot:'#3b82f6', border:'#3b82f644', bg:'#3b82f611' },
  { badge:'#ec4899', badgeText:'#fff', dot:'#ec4899', border:'#ec489944', bg:'#ec489911' },
  { badge:'#14b8a6', badgeText:'#000', dot:'#14b8a6', border:'#14b8a644', bg:'#14b8a611' },
  { badge:'#f97316', badgeText:'#000', dot:'#f97316', border:'#f9731644', bg:'#f9731611' },
  { badge:'#a855f7', badgeText:'#fff', dot:'#a855f7', border:'#a855f744', bg:'#a855f711' },
  { badge:'#84cc16', badgeText:'#000', dot:'#84cc16', border:'#84cc1644', bg:'#84cc1611' },
];

// ─── ESTADO LOCAL (read-only espelho do servidor) ─────────────

let groupData = [];
let matchData = [];

// ─── HELPERS ─────────────────────────────────────────────────

/** Lê nomes do textarea */
function getNames() {
  return document.getElementById('nameList').value
    .split('\n').map(n => n.trim()).filter(n => n.length > 0);
}

/** Criação de elementos com atributos e filhos */
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'style')                         e.style.cssText = v;
    else if (k === 'class')                    e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else                                       e.setAttribute(k, v);
  });
  children.forEach(c =>
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  );
  return e;
}

/** Nome legível para rodada baseado no nº de jogadores restantes */
function getRoundLabel(stage, round, matchesSameRound) {
  const count = matchesSameRound * 2; // aprox. de jogadores
  if (stage === 'final') {
    if (count >= 8)  return `Quartas de Final`;
    if (count >= 4)  return `Semifinal`;
    if (count === 2) return `Final`;
  }
  if (stage === 'repechage') {
    if (count >= 4)  return `Semifinal da Repescagem`;
    if (count === 2) return `Final da Repescagem`;
  }
  return `Rodada ${round}`;
}

// ─── LISTENER: contador de nomes ─────────────────────────────

['nameList', 'numGroups', 'perGroup'].forEach(id =>
  document.getElementById(id).addEventListener('input', updateNameCount)
);

function updateNameCount() {
  const n = getNames().length;
  const g = parseInt(document.getElementById('numGroups').value) || 2;
  const p = parseInt(document.getElementById('perGroup').value)  || 4;
  document.getElementById('nameCount').innerHTML =
    `<span>${n}</span> de ${g * p} nomes (${g} grupos × ${p})`;
}
updateNameCount();

// ─── SOCKET: RECEBE ESTADO ATUALIZADO DO SERVIDOR ────────────
// Este é o único ponto onde o front atualiza a tela.

function onStateUpdated(state) {
  groupData = state.groupData;
  matchData = state.matchData;

  if (groupData.length === 0) return;

  // Seção de grupos
  document.getElementById('groupsContainer').style.display = 'block';
  renderGroups();
  renderStandings();

  // Confrontos de grupos
  renderMatchSection(
    matchData.filter(m => m.stage === 'group'),
    'matchesSection',
    'Confrontos da Fase de Grupos'
  );

  // Chave principal (todas as rodadas)
  const finalRounds = [...new Set(matchData.filter(m => m.stage === 'final').map(m => m.round))].sort();
  finalRounds.forEach(round => {
    const matches = matchData.filter(m => m.stage === 'final' && m.round === round);
    const sectionId = `finalMatchesSection_r${round}`;
    const title = round === 1
      ? 'Chave Principal (Mata-Mata)'
      : getRoundLabel('final', round, matches.length);
    renderMatchSection(matches, sectionId, title, '#00e5ff');
  });

  // Repescagem (todas as rodadas)
  const repRounds = [...new Set(matchData.filter(m => m.stage === 'repechage').map(m => m.round))].sort();
  repRounds.forEach(round => {
    const matches = matchData.filter(m => m.stage === 'repechage' && m.round === round);
    const sectionId = `repMatchesSection_r${round}`;
    const title = round === 1
      ? 'Repescagem (Mata-Mata)'
      : getRoundLabel('repechage', round, matches.length);
    renderMatchSection(matches, sectionId, title, '#f59e0b');
  });

  // Campeões (quando chave tem só 1 vencedor)
  checkAndRenderChampion('final',     '#00e5ff', '🏆 Campeão da Chave Principal', 'championFinalSection');
  checkAndRenderChampion('repechage', '#f59e0b', '🏅 Campeão da Repescagem',      'championRepSection');
}

// ─── DRAW: emite sorteio para o servidor ─────────────────────

function draw() {
  const err   = document.getElementById('errorMsg');
  err.style.display = 'none';

  const names = getNames();
  const g = parseInt(document.getElementById('numGroups').value) || 2;
  const p = parseInt(document.getElementById('perGroup').value)  || 4;
  const total = g * p;

  if (names.length < total) {
    err.textContent  = `São necessários ${total} nomes (${g} × ${p}). Você tem ${names.length}.`;
    err.style.display = 'block';
    return;
  }
  if (names.length > total) {
    err.textContent  = `Você tem ${names.length} nomes mas só cabem ${total}. Os excedentes serão ignorados.`;
    err.style.display = 'block';
  }

  socket.emit('drawTournament', { tournamentId: TOURNAMENT_ID, names, g, p });
}

// ─── RENDER: GRUPOS ──────────────────────────────────────────

function renderGroups() {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = '';

  groupData.forEach((group, gi) => {
    const col  = COLORS[gi % COLORS.length];
    const card = el('div', {
      class: 'group-card',
      style: `animation-delay:${gi * 70}ms; border-color:${col.border};`
    });

    const hbar = el('div', { class: 'group-header-bar', style: `background:${col.bg}` }, [
      el('div', { class: 'group-badge', style: `background:${col.badge};color:${col.badgeText}` }, [group.letter]),
      el('div', { class: 'group-name-label' }, ['Grupo ' + group.letter]),
    ]);

    const playerList = el('div', { class: 'group-players' });
    group.players.forEach((player, idx) => {
      const row = el('div', { class: 'group-player' });
      row.appendChild(el('div', { class: 'player-pos' }, [String(idx + 1)]));
      row.appendChild(el('div', { class: 'player-dot', style: `background:${col.dot}` }));
      row.appendChild(el('div', { class: 'player-name' }, [player.name]));
      playerList.appendChild(row);
    });

    card.append(hbar, playerList);
    grid.appendChild(card);
  });
}

// ─── RENDER: CLASSIFICAÇÃO ───────────────────────────────────

function renderStandings() {
  let section = document.getElementById('standingsSection');
  if (!section) {
    section = el('div', { id: 'standingsSection', style: 'margin-top: 30px;' });
    document.getElementById('groupsContainer').after(section);
  }
  section.innerHTML = '';

  section.appendChild(
    el('div', { class: 'groups-title', style: 'margin-bottom: 16px;' }, ['Classificação'])
  );

  const grid = el('div', { class: 'groups-grid' });

  groupData.forEach((group, gi) => {
    const col  = COLORS[gi % COLORS.length];
    const card = el('div', {
      class: 'group-card',
      style: `border-color:${col.border}; padding: 0; overflow: hidden;`
    });

    // Cabeçalho
    const hbar = el('div', {
      class: 'group-header-bar',
      style: `background:${col.bg}; padding: 10px; border-bottom: 1px solid ${col.border};`
    }, [
      el('div', { style: `color:${col.badge}; font-weight: bold; font-size: 14px;` }, [`Grupo ${group.letter}`])
    ]);
    card.appendChild(hbar);

    // Tabela
    const table = el('div', { style: 'padding: 10px;' });

    // Cabeçalho da tabela
    const th = el('div', { style: 'display:flex; font-size:11px; color:#888; font-weight:bold; margin-bottom:8px;' });
    ['Jogador','Pts','SG','GP','GC'].forEach((label, i) =>
      th.appendChild(el('div', { style: `flex:${i === 0 ? 4 : 1}; text-align:${i === 0 ? 'left' : 'center'};` }, [label]))
    );
    table.appendChild(th);

    // Linhas
    const half = Math.ceil(group.players.length / 2);
    group.players.forEach((p, rank) => {
      const isQ   = rank < half;
      const color = isQ ? '#fff' : '#888';

      const tr = el('div', {
        style: `display:flex; font-size:13px; color:${color}; padding:6px 0; border-top:1px solid #1e1e2e; align-items:center;`
      });

      const nameCol = el('div', { style: 'flex:4; display:flex; align-items:center; gap:6px; overflow:hidden;' });
      nameCol.appendChild(el('span', { style: `font-size:10px; color:${col.badge}; width:12px; flex-shrink:0;` }, [String(rank + 1)]));
      nameCol.appendChild(el('span', { style: 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' }, [p.name]));

      const sg = p.goalDifference;
      tr.append(
        nameCol,
        el('div', { style: 'flex:1; font-weight:bold; text-align:center;' }, [String(p.points)]),
        el('div', { style: 'flex:1; text-align:center;' }, [sg > 0 ? `+${sg}` : String(sg)]),
        el('div', { style: 'flex:1; text-align:center; color:#888;' }, [String(p.goalsFor)]),
        el('div', { style: 'flex:1; text-align:center; color:#888;' }, [String(p.goalsAgainst)])
      );
      table.appendChild(tr);
    });

    card.appendChild(table);
    grid.appendChild(card);
  });

  section.appendChild(grid);
}

// ─── RENDER: SEÇÃO DE CONFRONTOS ─────────────────────────────

/**
 * Renderiza (ou re-renderiza) uma seção de confrontos.
 * @param {Array}  matches     - Lista de partidas filtradas
 * @param {string} sectionId   - ID único do elemento na DOM
 * @param {string} title       - Título da seção
 * @param {string} accentColor - Cor de destaque (opcional)
 */
function renderMatchSection(matches, sectionId, title, accentColor = null) {
  if (!matches.length) return;

  let section = document.getElementById(sectionId);
  if (!section) {
    section = el('div', { id: sectionId, style: 'margin-top: 30px;' });
    document.getElementById('app').appendChild(section);
  }
  section.innerHTML = '';

  // Título
  const titleEl = el('div', { class: 'groups-title', style: 'margin-bottom: 16px;' }, [title]);
  if (accentColor) titleEl.style.color = accentColor;
  section.appendChild(titleEl);

  // Grid de cards
  const grid = el('div', { class: 'groups-grid' });

  matches.forEach(match => {
    const col  = COLORS[match.groupIndex % COLORS.length];
    grid.appendChild(buildMatchCard(match, col));
  });

  section.appendChild(grid);

  // Scroll automático apenas na primeira vez que a seção aparece
  if (!section.dataset.shown) {
    section.dataset.shown = '1';
    setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }
}

// ─── RENDER: CARD DE CONFRONTO ────────────────────────────────

function buildMatchCard(match, col) {
  const isBye      = match.player2 === 'BYE';
  const isFinished = match.isFinished;
  const isDraw     = match.draw && !isFinished; // empate aguardando pênaltis

  const card = el('div', {
    class: 'group-card',
    style: `border-color:${col.border}; padding:12px; display:flex; flex-direction:column; gap:10px;`
  });

  // Rótulo do confronto
  const prefix = match.stage === 'group' ? 'Grupo' : 'Chave';
  card.appendChild(el('div', {
    style: `color:${col.badge}; font-size:12px; font-weight:bold; text-transform:uppercase; text-align:center;`
  }, [`${prefix} ${match.group} — Jogo ${match.matchIndex}`]));

  // ── Placar ──────────────────────────────────────────────────
  const scoreboard = el('div', {
    style: 'display:flex; align-items:center; justify-content:space-between; background:#15151f; padding:10px; border-radius:8px; border:1px solid #1e1e2e; width:100%; box-sizing:border-box;'
  });

  const nameStyle = (isWinner) =>
    `flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:${isWinner ? 'right' : 'left'}; font-weight:${isWinner ? 'bold' : 'normal'}; color:${isWinner ? col.badge : '#ccc'}; font-size:14px;`;

  const p1Win = isFinished && match.winner === match.player1;
  const p2Win = isFinished && match.winner === match.player2;

  const p1Col = el('div', { style: nameStyle(p1Win) }, [match.player1]);
  const p2Col = el('div', { style: nameStyle(p2Win) }, [match.player2]);

  // Bloco central: inputs de gol e pênaltis
  const centerBlock = el('div', {
    style: 'display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:110px; flex-shrink:0; gap:4px; margin:0 10px;'
  });

  const inputStyle = 'width:40px; height:35px; text-align:center; background:#0f0f17; border:1px solid #333; color:#fff; border-radius:6px; font-size:16px; font-weight:bold;';

  const g1Input = el('input', {
    type: isBye ? 'text' : 'number', min: 0,
    style: inputStyle,
    value: match.goals1 !== null ? String(match.goals1) : '0'
  });
  const g2Input = el('input', {
    type: isBye ? 'text' : 'number', min: 0,
    style: inputStyle,
    value: match.goals2 !== null ? String(match.goals2) : '0'
  });

  if (isFinished || isBye) {
    g1Input.disabled = true;
    g2Input.disabled = true;
    g1Input.style.borderColor = col.badge;
    g2Input.style.borderColor = col.badge;
  }

  const centerRow = el('div', { style: 'display:flex; align-items:center; gap:8px;' });
  centerRow.append(
    g1Input,
    el('span', { style: 'color:#666; font-size:12px; font-weight:bold;' }, ['×']),
    g2Input
  );
  centerBlock.appendChild(centerRow);

  // Pênaltis (só aparece em mata-mata com empate aguardando resolução)
  let pen1Input, pen2Input;
  if (isDraw && match.stage !== 'group') {
    const penRow = el('div', { style: 'display:flex; align-items:center; gap:4px; margin-top:4px;' });
    penRow.appendChild(el('span', { style: 'color:#f59e0b; font-size:10px; font-weight:bold;' }, ['PÊN:']));
    pen1Input = el('input', { type: 'number', min: 0, style: 'width:28px; height:22px; text-align:center; background:#1e1e2e; border:1px solid #f59e0b; color:#fff; border-radius:4px; font-size:12px;', value: '0' });
    pen2Input = el('input', { type: 'number', min: 0, style: 'width:28px; height:22px; text-align:center; background:#1e1e2e; border:1px solid #f59e0b; color:#fff; border-radius:4px; font-size:12px;', value: '0' });
    penRow.append(pen1Input, el('span', { style: 'color:#888; font-size:10px;' }, ['×']), pen2Input);
    centerBlock.appendChild(penRow);
  }

  // Exibe pênaltis históricos
  if (isFinished && match.pen1 !== null) {
    centerBlock.appendChild(el('div', {
      style: 'color:#f59e0b; font-size:11px; font-weight:bold; text-align:center; margin-top:2px;'
    }, [`Pên: ${match.pen1} × ${match.pen2}`]));
  }

  scoreboard.append(p1Col, centerBlock, p2Col);
  card.appendChild(scoreboard);

  // ── Botão confirmar / status ──────────────────────────────
  if (!isFinished) {
    const hasPen = isDraw && match.stage !== 'group';
    const btnLabel = hasPen ? 'Confirmar Pênaltis' : 'Confirmar Placar';

    const btn = el('button', {
      class: 'btn-reset',
      style: `width:100%; padding:8px; border-color:${col.border}; color:${col.badge}; margin-top:4px;`,
      onclick: () => {
        const v1 = parseInt(g1Input.value);
        const v2 = parseInt(g2Input.value);

        if (isNaN(v1) || isNaN(v2)) {
          alert('Preencha os dois campos de gols!');
          return;
        }

        let p1 = null, p2 = null;
        if (hasPen) {
          p1 = parseInt(pen1Input.value);
          p2 = parseInt(pen2Input.value);
          if (isNaN(p1) || isNaN(p2)) {
            alert('Preencha os pênaltis!');
            return;
          }
          if (p1 === p2) {
            alert('Pênaltis não podem terminar empatados!');
            return;
          }
        }

        socket.emit('updateMatchScore', {
          tournamentId: TOURNAMENT_ID,
          matchId: match.id,
          goals1: v1,
          goals2: v2,
          pen1: p1,
          pen2: p2,
        });
      }
    }, [btnLabel]);

    card.appendChild(btn);

  } else {
    // Status final
    let statusText;
    if (isBye)                          statusText = `${match.player1} avança (BYE)`;
    else if (match.stage === 'group' && match.draw) statusText = 'Empate';
    else                                statusText = `Vencedor: ${match.winner}`;

    card.appendChild(el('div', {
      style: `text-align:center; font-size:12px; color:${col.badge}; font-weight:bold; margin-top:4px;`
    }, [statusText]));
  }

  return card;
}

// ─── RENDER: CAMPEÃO ─────────────────────────────────────────

function checkAndRenderChampion(stage, color, title, sectionId) {
  const stageMatches = matchData.filter(m => m.stage === stage);
  if (!stageMatches.length) return;

  // Última rodada do stage
  const lastRound = Math.max(...stageMatches.map(m => m.round));
  const lastMatches = stageMatches.filter(m => m.round === lastRound);

  if (!lastMatches.every(m => m.isFinished)) return;

  const winners = lastMatches.map(m => m.winner).filter(Boolean);
  if (winners.length !== 1) return; // Ainda tem mais rodadas

  let section = document.getElementById(sectionId);
  if (!section) {
    section = el('div', { id: sectionId, style: 'margin-top: 40px; text-align: center;' });
    document.getElementById('app').appendChild(section);
  }

  // Só re-renderiza se mudou
  if (section.dataset.champion === winners[0]) return;
  section.dataset.champion = winners[0];
  section.innerHTML = '';

  const card = el('div', {
    class: 'group-card',
    style: `border-color:${color}; display:inline-block; padding:30px 50px; background:${color}11;`
  });
  card.appendChild(el('div', {
    style: `color:${color}; font-size:15px; font-weight:bold; margin-bottom:12px; text-transform:uppercase; letter-spacing:2px;`
  }, [title]));
  card.appendChild(el('div', {
    style: 'font-size:28px; color:#fff; font-weight:bold; text-transform:uppercase;'
  }, [winners[0]]));

  section.appendChild(card);
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

// ─── RESET ───────────────────────────────────────────────────

function reset() {
  groupData = [];
  matchData = [];

  document.getElementById('groupsContainer').style.display = 'none';
  document.getElementById('errorMsg').style.display = 'none';

  // Remove todas as seções dinâmicas
  [
    'standingsSection',
    'matchesSection',
    'championFinalSection',
    'championRepSection',
    // Seções com sufixo de rodada
    ...Array.from(document.querySelectorAll('[id^="finalMatchesSection_r"]')).map(e => e.id),
    ...Array.from(document.querySelectorAll('[id^="repMatchesSection_r"]')).map(e => e.id),
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Avisa o servidor para resetar também (opcional: faz novo draw zerar tudo)
  socket.emit('drawTournament', { tournamentId: TOURNAMENT_ID, names: [], g: 0, p: 0 });
}