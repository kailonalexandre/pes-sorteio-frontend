// ============================================================
// DETECÇÃO DE AMBIENTE (Isolamento de Escopo)
// Garante que o Front-end e o Back-end convivam no mesmo arquivo
// sem que um quebre o ambiente do outro.
// ============================================================
const isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';
const isBrowser = typeof window !== 'undefined';

// ============================================================
//  CÓDIGO DO BACK-END (Rodará APENAS no Servidor Node.js)
// ============================================================
if (isNode) {
  // ============================================================
  //  PES SORTEIO — BACKEND (server.js)
  //  Node.js + Express + Socket.IO
  //
  //  REGRAS DE PROGRESSÃO:
  //  1. Fase de grupos: round-robin completo (todos vs todos no grupo)
  //  2. Avançam sempre os 2 primeiros de cada grupo
  //  3. Repescagem SÓ existe se houver ao menos 1 grupo com nº ímpar
  //     de jogadores — o jogador "sobrando" (3º de grupo ímpar vs
  //     2º de grupo menor) disputa a última vaga na chave principal
  //  4. Se todos os grupos forem pares → sem repescagem, chave
  //     principal montada diretamente com os classificados
  // ============================================================

  const express = require('express');
  const http    = require('http');
  const { Server } = require('socket.io');
  const cors    = require('cors');

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  // ─── BANCO EM MEMÓRIA ────────────────────────────────────────
  const tournaments = {};

  // ─── CONSTANTES ──────────────────────────────────────────────
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ─── HELPERS PUROS ───────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function initializePlayerStats(name) {
    return { name, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
  }

  function createMatchObj(stage, round, groupIndex, groupName, name1, name2, id) {
    let p1 = name1;
    let p2 = name2;
    if (!p1 && p2) { p1 = p2; p2 = null; }

    const isBye = !p2 || p2 === 'BYE';

    return {
      id,
      stage,        
      round,        
      groupIndex,   
      group: groupName,
      matchIndex: 0,
      player1: p1,
      player2: isBye ? 'BYE' : p2,
      goals1:  isBye ? '-' : null,
      goals2:  isBye ? '-' : null,
      pen1: null,
      pen2: null,
      winner:     isBye ? p1 : null,
      loser:      isBye ? 'BYE' : null,
      draw:       false,
      isFinished: isBye,
    };
  }

  function generateRoundRobinMatches(group, groupIndex, t) {
    const players = group.players;
    const matches = [];

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        matches.push(
          createMatchObj('group', 1, groupIndex, group.letter, players[i].name, players[j].name, t.matchIdCounter++)
        );
      }
    }

    return matches;
  }

  function recalculateAllPlayerStats(t) {
    t.groupData.forEach(g =>
      g.players.forEach(p => {
        p.points = 0; p.goalsFor = 0; p.goalsAgainst = 0; p.goalDifference = 0;
      })
    );

    t.matchData
      .filter(m => m.stage === 'group' && m.isFinished && m.player2 !== 'BYE')
      .forEach(m => {
        let p1Ref, p2Ref;
        t.groupData.forEach(g => {
          const f1 = g.players.find(p => p.name === m.player1);
          const f2 = g.players.find(p => p.name === m.player2);
          if (f1) p1Ref = f1;
          if (f2) p2Ref = f2;
        });
        if (!p1Ref || !p2Ref) return;

        p1Ref.goalsFor      += m.goals1;
        p1Ref.goalsAgainst  += m.goals2;
        p1Ref.goalDifference = p1Ref.goalsFor - p1Ref.goalsAgainst;

        p2Ref.goalsFor      += m.goals2;
        p2Ref.goalsAgainst  += m.goals1;
        p2Ref.goalDifference = p2Ref.goalsFor - p2Ref.goalsAgainst;

        if      (m.goals1 > m.goals2) p1Ref.points += 3;
        else if (m.goals2 > m.goals1) p2Ref.points += 3;
        else { p1Ref.points += 1; p2Ref.points += 1; }
      });

    t.groupData.forEach(g =>
      g.players.sort((a, b) => {
        if (b.points          !== a.points)          return b.points          - a.points;
        if (b.goalDifference  !== a.goalDifference)  return b.goalDifference  - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      })
    );
  }

  function checkGroupStageEnd(t) {
    const groupMatches = t.matchData.filter(m => m.stage === 'group');
    if (!groupMatches.length) return;
    if (!groupMatches.every(m => m.isFinished)) return;
    if (t.matchData.some(m => m.stage === 'final' || m.stage === 'repechage')) return;

    buildPostGroupStage(t);
  }

  function buildPostGroupStage(t) {
    const hasOddGroup = t.groupData.some(g => g.players.length % 2 !== 0);
    const oddGroups  = t.groupData.filter(g => g.players.length % 2 !== 0); 
    const evenGroups = t.groupData.filter(g => g.players.length % 2 === 0); 

    const directQualifiers = []; 

    t.groupData.forEach((g, gi) => {
      directQualifiers.push({ name: g.players[0].name, groupLetter: g.letter, groupIndex: gi });
      if (g.players.length >= 2) {
        directQualifiers.push({ name: g.players[1].name, groupLetter: g.letter, groupIndex: gi });
      }
    });

    if (!hasOddGroup) {
      buildFinalBracket(t, directQualifiers.map(q => q.name), []);
      return;
    }

    const repMatches = [];
    const pairsCount = Math.min(oddGroups.length, evenGroups.length);

    for (let k = 0; k < pairsCount; k++) {
      const gOdd  = oddGroups[k];   
      const gEven = evenGroups[k];  

      const giOdd  = t.groupData.indexOf(gOdd);
      const giEven = t.groupData.indexOf(gEven);

      const p1 = gOdd.players[1];   
      const p2 = gEven.players[2];  

      if (p1 && p2) {
        const m = createMatchObj(
          'repechage', 1,
          Math.min(giOdd, giEven),
          `${gOdd.letter}×${gEven.letter}`,
          p1.name, p2.name,
          t.matchIdCounter++
        );
        m.matchIndex = k + 1;
        m._repContext = {
          oddGroupLetter:  gOdd.letter,
          evenGroupLetter: gEven.letter,
          playerToReplaceIfLose: p1.name,
          replacementIfWin:      p2.name,
        };
        repMatches.push(m);
      }
    }

    t.matchData.push(...repMatches);
  }

  function checkRepechageEnd(t) {
    const repMatches = t.matchData.filter(m => m.stage === 'repechage' && m.round === 1);
    if (!repMatches.length) return;
    if (!repMatches.every(m => m.isFinished)) return;
    if (t.matchData.some(m => m.stage === 'final')) return;

    const qualifiers = [];
    t.groupData.forEach(g => {
      qualifiers.push(g.players[0].name);
      if (g.players.length >= 2) qualifiers.push(g.players[1].name);
    });

    repMatches.forEach(m => {
      if (!m._repContext) return;
      const { playerToReplaceIfLose, replacementIfWin } = m._repContext;

      if (m.winner !== m.player1) {
        const idx = qualifiers.indexOf(playerToReplaceIfLose);
        if (idx !== -1) qualifiers[idx] = m.winner;
      }
    });

    const uniqueQualifiers = [...new Set(qualifiers)];
    buildFinalBracket(t, uniqueQualifiers, []);
  }

  function buildFinalBracket(t, qualifierNames, _unused) {
    if (!qualifierNames.length) return;

    const nameToGroup = {};
    t.groupData.forEach((g, gi) => {
      g.players.forEach((p, rank) => {
        nameToGroup[p.name] = { groupIndex: gi, letter: g.letter, rank };
      });
    });

    const byGroup = {};
    t.groupData.forEach((g, gi) => {
      byGroup[gi] = qualifierNames.filter(n => nameToGroup[n]?.groupIndex === gi);
    });

    const finalMatches = [];
    const groupIndices = Object.keys(byGroup).map(Number);

    for (let i = 0; i + 1 < groupIndices.length; i += 2) {
      const gi1 = groupIndices[i];
      const gi2 = groupIndices[i + 1];
      const q1  = byGroup[gi1] || [];
      const q2  = byGroup[gi2] || [];

      const maxLen = Math.max(q1.length, q2.length);
      for (let j = 0; j < maxLen; j++) {
        const p1 = q1[j];
        const p2 = q2[q2.length - 1 - j];
        if (p1 || p2) {
          finalMatches.push(
            createMatchObj(
              'final', 1,
              Math.min(gi1, gi2),
              `${t.groupData[gi1].letter}×${t.groupData[gi2].letter}`,
              p1, p2,
              t.matchIdCounter++
            )
          );
        }
      }
    }

    if (groupIndices.length % 2 !== 0) {
      const lastGi = groupIndices[groupIndices.length - 1];
      (byGroup[lastGi] || []).forEach(name => {
        const m = createMatchObj('final', 1, lastGi, t.groupData[lastGi].letter, name, 'BYE', t.matchIdCounter++);
        finalMatches.push(m);
      });
    }

    finalMatches.forEach((m, idx) => (m.matchIndex = idx + 1));
    t.matchData.push(...finalMatches);
  }

  function checkKnockoutStageEnd(t, stage, round) {
    const roundMatches = t.matchData.filter(m => m.stage === stage && m.round === round);
    if (!roundMatches.length) return;
    if (!roundMatches.every(m => m.isFinished)) return;

    if (stage === 'repechage') {
      checkRepechageEnd(t);
    } else {
      handleKnockoutProgression(t, stage, round);
    }
  }

  function handleKnockoutProgression(t, stage, currentRound) {
    const roundMatches = t.matchData.filter(m => m.stage === stage && m.round === currentRound);
    const winners = roundMatches.map(m => m.winner).filter(Boolean);

    if (winners.length <= 1) return; 

    const nextRound = currentRound + 1;
    if (t.matchData.some(m => m.stage === stage && m.round === nextRound)) return;

    for (let i = 0; i + 1 < winners.length; i += 2) {
      const m = createMatchObj(stage, nextRound, 0, getRoundName(winners.length), winners[i], winners[i + 1], t.matchIdCounter++);
      m.matchIndex = Math.floor(i / 2) + 1;
      t.matchData.push(m);
    }

    if (winners.length % 2 !== 0) {
      const byeM = createMatchObj(stage, nextRound, 0, getRoundName(winners.length), winners[winners.length - 1], 'BYE', t.matchIdCounter++);
      byeM.matchIndex = Math.ceil(winners.length / 2);
      t.matchData.push(byeM);
    }
  }

  function getRoundName(playerCount) {
    if (playerCount >= 16) return '16-avos de Final';
    if (playerCount >= 8)  return 'Quartas de Final';
    if (playerCount >= 4)  return 'Semifinal';
    if (playerCount === 2) return 'Final';
    return 'Fase Eliminatória';
  }

  app.get('/api/tournament/:id', (req, res) => {
    const t = tournaments[req.params.id];
    if (!t) return res.status(404).json({ error: 'Sala não encontrada' });
    res.json(t);
  });

  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('createTournament', (tournamentId) => {
      if (tournaments[tournamentId]) {
        socket.emit('roomError', 'Esse código já está em uso. Tente outro.');
        return;
      }
      tournaments[tournamentId] = { groupData: [], matchData: [], matchIdCounter: 0 };
      socket.join(tournamentId);
      socket.emit('roomJoined', { tournamentId, state: tournaments[tournamentId] });
      console.log('Sala criada:', tournamentId);
    });

    socket.on('joinTournament', (tournamentId) => {
      if (!tournaments[tournamentId]) {
        socket.emit('roomError', 'Sala não encontrada. Verifique o código.');
        return;
      }
      socket.join(tournamentId);
      socket.emit('roomJoined', { tournamentId, state: tournaments[tournamentId] });
      console.log('Socket', socket.id, 'entrou na sala:', tournamentId);
    });

    socket.on('drawTournament', ({ tournamentId, names, g, p, groups }) => {
      const t = tournaments[tournamentId];
      if (!t) return;

      t.groupData      = [];
      t.matchData      = [];
      t.matchIdCounter = 0;

      if (groups && Array.isArray(groups)) {
        groups.forEach((grp, gi) => {
          t.groupData.push({
            letter: LETTERS[gi],
            players: grp.playerNames.map(initializePlayerStats),
          });
        });
      } else {
        const total   = (g || 2) * (p || 4);
        const shuffled = shuffle([...names]).slice(0, total);
        for (let i = 0; i < (g || 2); i++) {
          t.groupData.push({
            letter: LETTERS[i],
            players: shuffled.slice(i * (p || 4), (i + 1) * (p || 4)).map(initializePlayerStats),
          });
        }
      }

      let matchCounter = 1;
      t.groupData.forEach((group, groupIndex) => {
        const rrMatches = generateRoundRobinMatches(group, groupIndex, t);
        rrMatches.forEach(m => { m.matchIndex = matchCounter++; });
        t.matchData.push(...rrMatches);
      });

      io.to(tournamentId).emit('stateUpdated', t);
      console.log(`Torneio ${tournamentId} sorteado: ${t.groupData.length} grupos`);
    });

    socket.on('updateMatchScore', ({ tournamentId, matchId, goals1, goals2, pen1, pen2 }) => {
      const t = tournaments[tournamentId];
      if (!t) return;

      const match = t.matchData.find(m => m.id === matchId);
      if (!match || match.isFinished) return;

      match.goals1 = goals1;
      match.goals2 = goals2;

      const isDraw = goals1 === goals2;

      if (isDraw && match.stage !== 'group') {
        if (pen1 !== null && pen2 !== null && pen1 !== pen2) {
          match.pen1       = pen1;
          match.pen2       = pen2;
          match.isFinished = true;
          match.draw       = false;
          match.winner     = pen1 > pen2 ? match.player1 : match.player2;
          match.loser      = pen1 > pen2 ? match.player2 : match.player1;
        } else {
          match.draw       = true;
          match.isFinished = false;
          io.to(tournamentId).emit('stateUpdated', t);
          return;
        }
      } else {
        match.isFinished = true;
        match.draw       = isDraw;

        if      (goals1 > goals2) { match.winner = match.player1; match.loser = match.player2; }
        else if (goals2 > goals1) { match.winner = match.player2; match.loser = match.player1; }
        else {
          match.winner = null;
          match.loser  = null;
        }
      }

      recalculateAllPlayerStats(t);

      if (match.stage === 'group') {
        checkGroupStageEnd(t);
      } else {
        checkKnockoutStageEnd(t, match.stage, match.round);
      }

      io.to(tournamentId).emit('stateUpdated', t);
    });

    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Backend rodando em http://localhost:${PORT}`);
  });
}

// ============================================================
//  CÓDIGO DO FRONT-END (Rodará APENAS no Navegador)
// ============================================================
if (isBrowser) {
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

  // Adicionado ao escopo global (window) para que botões HTML possam chamar a função
  window.initSocket = function initSocket() {
    console.log('🔧 Inicializando Socket.io...');
    console.log('🔌 Backend URL:', BACKEND_URL);
    
    // O 'io' precisa estar importado no HTML via <script src=".../socket.io.js"></script>
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
      if (typeof window.joinRoom === 'function') window.joinRoom();
    });

    socket.on('disconnect', () => {
      console.warn('⚠️ WebSocket Desconectado. Iniciando polling...');
      if (typeof window.startPolling === 'function') window.startPolling();  // Fallback para polling
    });

    socket.on('roomJoined', ({ tournamentId, state }) => {
      console.log('🎫 Sala entrada:', tournamentId);
      if (typeof window.onStateUpdated === 'function') window.onStateUpdated(state);
    });

    socket.on('roomError', (msg) => {
      console.error('❌ Erro na sala:', msg);
      sessionStorage.setItem('lobbyError', msg);
      window.location.href = 'lobby.html';
    });

    socket.on('stateUpdated', (state) => {
      console.log('📡 Estado atualizado recebido via Socket');
      if (typeof window.onStateUpdated === 'function') window.onStateUpdated(state);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Erro de conexão Socket:', error.message);
    });
  }

  // ─── FUNÇÕES DE SALA ─────────────────────────────────────────
  // (Suas funções do front-end devem vir aqui dentro)
}
