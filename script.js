// ============================================================
//  PES SORTEIO — FRONT-END (script.js)
//  Responsabilidade: SOMENTE renderização e emissão de eventos.
//  Toda lógica de negócio vive no server.js.
// ============================================================

// TESTE: Se você vê esta mensagem, o arquivo foi atualizado!
console.log('✅✅✅ SCRIPT.JS CARREGADO COM SUCESSO - v2.1 ✅✅✅');
// Ambiente: local vs produção
const isLocalFrontend = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const configuredBackendUrl = window.PES_CONFIG?.backendUrl;
const BACKEND_URL = configuredBackendUrl || (isLocalFrontend
  ? 'http://localhost:3000'
  : 'https://pes-backend-production.up.railway.app');
const _params = new URLSearchParams(window.location.search);
const TOURNAMENT_ID = _params.get('id') || null;
const IS_NEW_ROOM = _params.get('new') === '1';

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
      const response = await fetch(`${BACKEND_URL}/api/tournament/${TOURNAMENT_ID}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.warn('⚠️ Backend respondeu com erro:', response.status);
        return;
      }
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
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM carregado');

  initSocket();
  updateNameCount();
});

// ─── CONSTANTES DE COR ───────────────────────────────────────

const COLORS = [
  { badge: '#00e5ff', badgeText: '#000', dot: '#00e5ff', border: '#00e5ff44', bg: '#00e5ff11' },
  { badge: '#ff0066', badgeText: '#fff', dot: '#ff0066', border: '#ff006644', bg: '#ff006611' },
  { badge: '#7c3aed', badgeText: '#fff', dot: '#7c3aed', border: '#7c3aed44', bg: '#7c3aed11' },
  { badge: '#f59e0b', badgeText: '#000', dot: '#f59e0b', border: '#f59e0b44', bg: '#f59e0b11' },
  { badge: '#10b981', badgeText: '#000', dot: '#10b981', border: '#10b98144', bg: '#10b98111' },
  { badge: '#ef4444', badgeText: '#fff', dot: '#ef4444', border: '#ef444444', bg: '#ef444411' },
  { badge: '#3b82f6', badgeText: '#fff', dot: '#3b82f6', border: '#3b82f644', bg: '#3b82f611' },
  { badge: '#ec4899', badgeText: '#fff', dot: '#ec4899', border: '#ec489944', bg: '#ec489911' },
  { badge: '#14b8a6', badgeText: '#000', dot: '#14b8a6', border: '#14b8a644', bg: '#14b8a611' },
  { badge: '#f97316', badgeText: '#000', dot: '#f97316', border: '#f9731644', bg: '#f9731611' },
  { badge: '#a855f7', badgeText: '#fff', dot: '#a855f7', border: '#a855f744', bg: '#a855f711' },
  { badge: '#84cc16', badgeText: '#000', dot: '#84cc16', border: '#84cc1644', bg: '#84cc1611' },
];

// ─── ESTADO LOCAL (read-only espelho do servidor) ─────────────

let groupData = [];
let matchData = [];
let scoringMode = 'goals';

// ─── HELPERS ─────────────────────────────────────────────────

/** Lê nomes do textarea */
function getNames() {
  const el = document.getElementById('nameList');
  if (!el) return [];

  return el.value
    .split('\n')
    .map(n => n.trim())
    .filter(n => n.length > 0);
}

function getSelectedLeagues() {
  return Array.from(document.querySelectorAll('.league-checkbox:checked')).map(cb => cb.value);
}

function getUseRepechage() {
  const el = document.getElementById('useRepechage');
  return Boolean(el && el.checked);
}

function isVictoryScoring() {
  return scoringMode === 'victory';
}



function clearLeagues() {
  document.querySelectorAll('.league-checkbox').forEach(cb => cb.checked = false);
}

/** Criação de elementos com atributos e filhos */
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'style') e.style.cssText = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
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
    if (count >= 8) return `Quartas de Final`;
    if (count >= 4) return `Semifinal`;
    if (count === 2) return `Final`;
  }
  if (stage === 'repechage') {
    if (count >= 4) return `Semifinal da Repescagem`;
    if (count === 2) return `Final da Repescagem`;
  }
  return `Rodada ${round}`;
}

// ─── LISTENER: contador de nomes ─────────────────────────────

function safeAddListener(id, event, callback) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`⚠️ Elemento não encontrado: ${id}`);
    return;
  }
  el.addEventListener(event, callback);
}

['nameList', 'numGroups'].forEach(id => {
  safeAddListener(id, 'input', updateNameCount);
});

function updateNameCount() {
  const nameListEl = document.getElementById('nameList');
  const numGroupsEl = document.getElementById('numGroups');
  const nameCountEl = document.getElementById('nameCount');

  if (!nameListEl || !numGroupsEl || !nameCountEl) return;

  const n = getNames().length;
  const g = parseInt(numGroupsEl.value) || 2;

  nameCountEl.innerHTML =
    `<span>${n}</span> jogadores para <span>${g}</span> grupos (Média: ~${(n / g).toFixed(1)})`;
}


// ─── SOCKET: RECEBE ESTADO ATUALIZADO DO SERVIDOR ────────────
// Este é o único ponto onde o front atualiza a tela.

function onStateUpdated(state) {
  groupData = state.groupData || [];
  matchData = state.matchData || [];
  scoringMode = state.scoringMode || 'goals';

  const drawBtn = document.getElementById('drawBtn');
  const leagueSelector = document.getElementById('leagueSelector');
  const useRepechageEl = document.getElementById('useRepechage');
  const resetBtn = document.querySelector('.groups-header .btn-reset');
  if (useRepechageEl) {
    useRepechageEl.checked = Boolean(state.useRepechage);
    useRepechageEl.disabled = Boolean(state.isDrawn);
  }
  if (state.isDrawn) {
    if (drawBtn) drawBtn.style.display = 'none';
    if (leagueSelector) leagueSelector.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
  } else {
    if (drawBtn) drawBtn.style.display = 'block';
    if (leagueSelector) leagueSelector.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-block';
  }

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
      ? getRoundLabel('final', round, matches.length)
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
  checkAndRenderChampion('final', '#00e5ff', '🏆 Campeão da Chave Principal', 'championFinalSection');
  checkAndRenderChampion('repechage', '#f59e0b', '🏅 Campeão da Repescagem', 'championRepSection');
}

// ─── DRAW: emite sorteio para o servidor ─────────────────────

function draw() {
  const err = document.getElementById('errorMsg');
  err.style.display = 'none';

  const names = getNames();
  const g = parseInt(document.getElementById('numGroups').value) || 2;
  const leaguesSelected = getSelectedLeagues();
  const useRepechage = getUseRepechage();

  if (names.length < g) {
    err.textContent = `É necessário pelo menos ${g} jogadores para preencher os grupos.`;
    err.style.display = 'block';
    return;
  }

  // Envia apenas o tournamentId, a lista de nomes e a quantidade de grupos
  socket.emit('drawTournament', { tournamentId: TOURNAMENT_ID, names, g, leaguesSelected, useRepechage });
}

// ─── RENDER: GRUPOS ──────────────────────────────────────────

function renderGroups() {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = '';

  groupData.forEach((group, gi) => {
    const col = COLORS[gi % COLORS.length];
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
      const txt = player.team ? `${player.name} - ${player.team}` : player.name;
      row.appendChild(el('div', { class: 'player-name' }, [txt]));
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
    section = el('div', { id: 'standingsSection' });
    const wrapper = document.getElementById('standingsWrapper');
    if (wrapper) {
      wrapper.appendChild(section);
    } else {
      section.style.marginTop = '30px';
      document.getElementById('groupsContainer').after(section);
    }
  }
  section.innerHTML = '';

  section.appendChild(
    el('div', { class: 'groups-title', style: 'font-size: 14px; color: #888; margin-bottom: 12px;' }, ['Classificação'])
  );

  const grid = el('div', { class: 'groups-grid' });

  groupData.forEach((group, gi) => {
    const col = COLORS[gi % COLORS.length];
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
    const labels = isVictoryScoring() ? ['Jogador', 'Vitórias'] : ['Jogador', 'Pts', 'SG', 'GP', 'GC'];
    labels.forEach((label, i) =>
      th.appendChild(el('div', { style: `flex:${i === 0 ? 4 : 1}; text-align:${i === 0 ? 'left' : 'center'};` }, [label]))
    );
    table.appendChild(th);

    // Linhas
    const half = Math.ceil(group.players.length / 2);
    group.players.forEach((p, rank) => {
      const isQ = rank < half;
      const color = isQ ? '#fff' : '#888';

      const tr = el('div', {
        style: `display:flex; font-size:13px; color:${color}; padding:6px 0; border-top:1px solid #1e1e2e; align-items:center;`
      });

      const nameCol = el('div', { style: 'flex:4; display:flex; align-items:center; gap:6px; overflow:hidden;' });
      nameCol.appendChild(el('span', { style: `font-size:10px; color:${col.badge}; width:12px; flex-shrink:0;` }, [String(rank + 1)]));
      nameCol.appendChild(el('span', { style: 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' }, [p.name]));

      if (isVictoryScoring()) {
        tr.append(
          nameCol,
          el('div', { style: 'flex:1; font-weight:bold; text-align:center;' }, [String(p.points)])
        );
      } else {
        const sg = p.goalDifference;
        tr.append(
          nameCol,
          el('div', { style: 'flex:1; font-weight:bold; text-align:center;' }, [String(p.points)]),
          el('div', { style: 'flex:1; text-align:center;' }, [sg > 0 ? `+${sg}` : String(sg)]),
          el('div', { style: 'flex:1; text-align:center; color:#888;' }, [String(p.goalsFor)]),
          el('div', { style: 'flex:1; text-align:center; color:#888;' }, [String(p.goalsAgainst)])
        );
      }
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
  const grid = el('div', { class: 'match-grid' });

  matches.forEach(match => {
    const col = COLORS[match.groupIndex % COLORS.length];
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
  const isBye = match.player2 === 'BYE';
  const isFinished = match.isFinished;
  const isDraw = match.draw && !isFinished; // empate aguardando pênaltis
  const usesVictory = isVictoryScoring() && match.stage === 'group';

  const card = el('div', {
    class: `match-card ${isFinished ? 'is-finished' : ''}`,
    style: `border-color:${col.border};`
  });

  const p1Win = isFinished && match.winner === match.player1;
  const p2Win = isFinished && match.winner === match.player2;
  const needsPenalty = isDraw && match.stage !== 'group';
  const hasPenalty = match.pen1 !== null && match.pen2 !== null;
  const matchLabel = match.stage === 'group'
    ? `Grupo ${match.group}`
    : getRoundLabel(match.stage, match.round, Math.max(1, Math.ceil(matchData.filter(m => m.stage === match.stage && m.round === match.round).length)));
  const statusText = isBye ? 'BYE' : (isFinished ? (hasPenalty ? 'FIM (P)' : 'FIM') : (needsPenalty ? 'PÊN.' : 'ABERTO'));

  const g1Input = el('input', {
    type: isBye ? 'text' : 'number', min: 0,
    class: 'match-score-input',
    value: match.goals1 !== null ? String(match.goals1) : '0'
  });
  const g2Input = el('input', {
    type: isBye ? 'text' : 'number', min: 0,
    class: 'match-score-input',
    value: match.goals2 !== null ? String(match.goals2) : '0'
  });

  if (isFinished || isBye) {
    g1Input.disabled = true;
    g2Input.disabled = true;
  }

  let pen1Input = null;
  let pen2Input = null;
  if (needsPenalty) {
    pen1Input = el('input', { type: 'number', min: 0, class: 'match-pen-input', value: '0' });
    pen2Input = el('input', { type: 'number', min: 0, class: 'match-pen-input', value: '0' });
  }

  const header = el('div', { class: 'match-card-header' }, [
    el('div', { class: 'match-meta' }, [`${matchLabel} — Jogo ${match.matchIndex}`]),
    el('div', { class: 'match-status' }, [statusText]),
  ]);

  const scoreHead = el('div', { class: 'match-score-head' }, [
    el('span', {}, ['G']),
    el('span', {}, ['P']),
  ]);

  function avatar(name, winner) {
    const initials = String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
    return el('span', {
      class: `match-avatar ${winner ? 'winner' : ''}`,
      style: winner ? `background:${col.badge}; color:${col.badgeText};` : ''
    }, [initials || '?']);
  }

  function scoreNode(playerNumber, input, penValue) {
    const pen = needsPenalty
      ? (playerNumber === 1 ? pen1Input : pen2Input)
      : el('span', { class: 'match-pen-value' }, [penValue !== null ? `(${penValue})` : '']);
    return el('div', { class: 'match-score-cells' }, [input, pen]);
  }

  function teamRow(name, winner, input, penValue, playerNumber) {
    return el('div', { class: `match-team-row ${winner ? 'winner' : ''}` }, [
      el('div', { class: 'match-team-name' }, [
        avatar(name, winner),
        el('span', { class: 'match-team-text' }, [name]),
      ]),
      scoreNode(playerNumber, input, penValue),
      winner ? el('span', { class: 'match-winner-arrow' }, ['◂']) : el('span', { class: 'match-winner-arrow empty' }, ['']),
    ]);
  }

  function emitScore(pen1 = null, pen2 = null) {
    const v1 = parseInt(g1Input.value);
    const v2 = parseInt(g2Input.value);

    if (isNaN(v1) || isNaN(v2)) {
      alert('Preencha os dois campos de gols!');
      return;
    }

    if (usesVictory && v1 === v2) {
      alert('No Mortal Kombat, informe o vencedor geral. Use 1 x 0 ou 0 x 1.');
      return;
    }

    if (needsPenalty) {
      pen1 = parseInt(pen1Input.value);
      pen2 = parseInt(pen2Input.value);
      if (isNaN(pen1) || isNaN(pen2)) {
        alert('Preencha os pênaltis!');
        return;
      }
      if (pen1 === pen2) {
        alert('Pênaltis não podem terminar empatados!');
        return;
      }
    }

    socket.emit('updateMatchScore', {
      tournamentId: TOURNAMENT_ID,
      matchId: match.id,
      goals1: v1,
      goals2: v2,
      pen1,
      pen2,
    });
  }

  const teams = el('div', { class: 'match-teams' }, [
    teamRow(match.player1, p1Win, g1Input, match.pen1, 1),
    teamRow(match.player2, p2Win, g2Input, match.pen2, 2),
  ]);

  const total = isBye
    ? `${match.player1} avança sem adversário`
    : `Total: ${g1Input.value} - ${g2Input.value}${hasPenalty ? ` (${match.pen1} - ${match.pen2} pên.)` : ''}`;
  const footer = el('div', { class: 'match-footer' }, [
    el('span', {}, [total]),
  ]);

  const actions = el('div', { class: 'match-actions' });
  if (!isFinished && !isBye) {
    actions.appendChild(el('button', { class: 'match-action-btn primary', onclick: () => emitScore() }, [
      needsPenalty ? 'Confirmar Pênaltis' : (usesVictory ? 'Confirmar Vencedor' : 'Confirmar Placar')
    ]));
  } else if (isFinished && !isBye) {
    actions.appendChild(el('button', {
      class: 'match-action-btn',
      onclick: () => {
        g1Input.disabled = false;
        g2Input.disabled = false;
        actions.innerHTML = '';
        actions.appendChild(el('button', {
          class: 'match-action-btn primary',
          onclick: () => emitScore(match.pen1, match.pen2)
        }, ['Salvar Correção']));
      }
    }, ['Editar']));
  }

  card.append(header, scoreHead, teams, footer);
  if (actions.childNodes.length) card.appendChild(actions);

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
  clearLeagues();

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
