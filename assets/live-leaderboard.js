// ── ELONDASH LIVE LEADERBOARD, PILOT CONTROLLER & SYNC ENGINE ──
(function() {
  let cachedLeaderboard = [];

  function getPilotName() {
    const stored = (localStorage.getItem('elondash_pilot_name') || '').trim();
    if (stored) return stored;
    // Default to HRITIK or Pilot if no name entered yet
    return 'HRITIK';
  }

  function setPilotName(name) {
    name = (name || '').trim();
    if (!name) name = 'Pilot';
    localStorage.setItem('elondash_pilot_name', name);

    // Update pilot callsign button in DOM
    const pilotBtn = document.getElementById('pilot-name');
    if (pilotBtn) pilotBtn.textContent = name;

    // Sync with game engine pilot if present
    try {
      if (window.Y && typeof window.Y.getPlayer === 'function') {
        const p = window.Y.getPlayer();
        if (p) p.nickname = name;
      }
    } catch(e) {}

    // Update leaderboard callsign matching
    syncGameBestWithLeaderboard();
    renderLeaderboard();
  }

  function loadLocalLeaderboard() {
    try {
      const stored = localStorage.getItem('elondash_live_leaderboard');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return deduplicateList(parsed);
        }
      }
    } catch(e) {}
    return [];
  }

  function saveLocalLeaderboard(data) {
    try {
      const deduplicated = deduplicateList(data);
      localStorage.setItem('elondash_live_leaderboard', JSON.stringify(deduplicated));
    } catch(e) {}
  }

  // Deduplicate array: keep highest distance & score per unique pilot name (case-insensitive)
  function deduplicateList(list) {
    if (!Array.isArray(list)) return [];
    const map = new Map();

    for (const item of list) {
      if (!item) continue;
      const rawName = String(item.name || 'Pilot').trim();
      const normName = rawName.toLowerCase();
      const dist = Math.round(Number(item.distance) || 0);
      const scr = Math.round(Number(item.score) || 0);
      const date = item.date || 'Just now';

      if (!map.has(normName)) {
        map.set(normName, {
          name: rawName,
          distance: dist,
          score: scr,
          date
        });
      } else {
        const existing = map.get(normName);
        existing.distance = Math.max(existing.distance, dist);
        existing.score = Math.max(existing.score, scr);
        // Retain latest date or best
        if (dist > existing.distance || scr > existing.score) {
          existing.name = rawName;
          existing.date = date;
        }
      }
    }

    const result = Array.from(map.values());
    // Sort primarily by distance desc, secondarily by score desc
    result.sort((a, b) => {
      if (b.distance !== a.distance) return b.distance - a.distance;
      return b.score - a.score;
    });

    return result.slice(0, 50);
  }

  // Upsert a record into board in-memory
  function upsertLeaderboardEntry(board, newEntry) {
    if (!newEntry) return board;
    const rawName = String(newEntry.name || 'Pilot').trim();
    const normName = rawName.toLowerCase();
    const dist = Math.round(Number(newEntry.distance) || 0);
    const scr = Math.round(Number(newEntry.score) || 0);
    const date = newEntry.date || 'Just now';

    let found = false;
    for (let i = 0; i < board.length; i++) {
      if ((board[i].name || '').trim().toLowerCase() === normName) {
        board[i].distance = Math.max(board[i].distance || 0, dist);
        board[i].score = Math.max(board[i].score || 0, scr);
        board[i].name = rawName;
        board[i].date = date;
        found = true;
        break;
      }
    }

    if (!found) {
      board.push({ name: rawName, distance: dist, score: scr, date });
    }

    return deduplicateList(board);
  }

  // Fetch leaderboard from server and merge with local data
  // GUARANTEE: Never overwrite local data with empty array
  async function fetchLeaderboard() {
    let localBoard = loadLocalLeaderboard();

    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const serverData = await res.json();
        if (Array.isArray(serverData)) {
          // Merge server data with local data
          let merged = [...localBoard];
          for (const sItem of serverData) {
            merged = upsertLeaderboardEntry(merged, sItem);
          }

          // If server had 0 entries but client has entries (e.g. server restart / shutdown / Vercel cold boot),
          // re-hydrate server with client records!
          if (serverData.length === 0 && localBoard.length > 0) {
            for (const lItem of localBoard) {
              fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lItem)
              }).catch(() => {});
            }
          }

          cachedLeaderboard = deduplicateList(merged);
          saveLocalLeaderboard(cachedLeaderboard);
          syncGameBestWithLeaderboard();
          renderLeaderboard();
          return;
        }
      }
    } catch(e) {}

    // Fallback: local only
    cachedLeaderboard = deduplicateList(localBoard);
    syncGameBestWithLeaderboard();
    renderLeaderboard();
  }

  // Submit score to both server and local storage
  async function submitScore(name, distance, score) {
    name = (name || getPilotName() || 'Pilot').trim();
    distance = Math.round(Number(distance) || 0);
    score = Math.round(Number(score) || 0);

    // Update local immediately
    cachedLeaderboard = upsertLeaderboardEntry(cachedLeaderboard, {
      name,
      distance,
      score,
      date: 'Just now'
    });
    saveLocalLeaderboard(cachedLeaderboard);
    syncGameBestWithLeaderboard();
    renderLeaderboard();

    // Post to backend
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, distance, score })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          let merged = [...cachedLeaderboard];
          for (const item of data) {
            merged = upsertLeaderboardEntry(merged, item);
          }
          cachedLeaderboard = deduplicateList(merged);
          saveLocalLeaderboard(cachedLeaderboard);
          renderLeaderboard();
        }
      }
    } catch(e) {}
  }

  // Parse integer from formatted string like "19,666" or "3,875 m"
  function parseNumber(text) {
    if (!text) return 0;
    const cleaned = String(text).replace(/[^0-9]/g, '');
    return parseInt(cleaned, 10) || 0;
  }

  // Bi-directional synchronization between the game's Best score/distance and the Live Leaderboard
  function syncGameBestWithLeaderboard() {
    const myName = getPilotName();
    if (!myName) return;

    const bestScoreEl = document.getElementById('best-score');
    const bestDistEl = document.getElementById('best-dist');
    const pilotBtn = document.getElementById('pilot-name');

    // Keep pilot button in sync with chosen name
    if (pilotBtn && pilotBtn.textContent !== myName) {
      pilotBtn.textContent = myName;
    }

    let domScore = bestScoreEl ? parseNumber(bestScoreEl.textContent) : 0;
    let domDist = bestDistEl ? parseNumber(bestDistEl.textContent) : 0;

    // Check cached pilot record in leaderboard
    const myEntry = cachedLeaderboard.find(
      e => (e.name || '').trim().toLowerCase() === myName.toLowerCase()
    );

    let finalScore = Math.max(domScore, myEntry?.score || 0);
    let finalDist = Math.max(domDist, myEntry?.distance || 0);

    // If game has a recorded run (e.g. 19666 pts, 3875 m), ensure it's in the leaderboard!
    if (finalScore > 0 || finalDist > 0) {
      if (!myEntry || (myEntry.score < finalScore || myEntry.distance < finalDist)) {
        cachedLeaderboard = upsertLeaderboardEntry(cachedLeaderboard, {
          name: myName,
          distance: finalDist,
          score: finalScore,
          date: 'Recorded run'
        });
        saveLocalLeaderboard(cachedLeaderboard);

        // Inform backend of this pilot's best
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: myName, distance: finalDist, score: finalScore })
        }).catch(() => {});
      }

      // If leaderboard had higher values, update DOM
      if (bestScoreEl && domScore < finalScore && finalScore > 0) {
        bestScoreEl.textContent = finalScore.toLocaleString('en-US');
      }
      if (bestDistEl && domDist < finalDist && finalDist > 0) {
        bestDistEl.textContent = `${finalDist.toLocaleString('en-US')} m`;
      }
    }

    // Clean up generic "Pilot" 129m test entry if user has their own real name entry
    if (myName.toLowerCase() !== 'pilot') {
      const pilotIdx = cachedLeaderboard.findIndex(
        e => (e.name || '').trim().toLowerCase() === 'pilot' && (e.distance || 0) <= 200
      );
      if (pilotIdx !== -1) {
        cachedLeaderboard.splice(pilotIdx, 1);
        saveLocalLeaderboard(cachedLeaderboard);
      }
    }
  }

  function renderLeaderboard() {
    const listEl = document.getElementById('live-lb-list');
    if (!listEl) return;
    const myName = getPilotName();

    const sorted = deduplicateList(cachedLeaderboard);

    listEl.innerHTML = '';

    // Empty state
    if (sorted.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'live-empty-state';
      emptyLi.innerHTML = `
        <div class="live-empty-icon">🏁</div>
        <div class="live-empty-title">NO RUNS RECORDED YET</div>
        <div class="live-empty-desc">Hit PLAY to launch and set your first record on the leaderboard!</div>
      `;
      listEl.appendChild(emptyLi);

      const myStatEl = document.getElementById('live-my-stat');
      if (myStatEl) {
        myStatEl.textContent = myName ? `${myName} — Ready` : 'Ready to race';
      }
      return;
    }

    let myBestRank = null;
    let myBestVal = null;

    sorted.slice(0, 10).forEach((item, idx) => {
      const rank = idx + 1;
      const isMe = myName && item.name && item.name.toLowerCase() === myName.toLowerCase();
      if (isMe && (!myBestRank || rank < myBestRank)) {
        myBestRank = rank;
        myBestVal = `${(item.distance || 0).toLocaleString()} m · ${(item.score || 0).toLocaleString()} pts`;
      }

      const li = document.createElement('li');
      li.className = isMe ? 'me' : '';
      if (rank === 1) li.classList.add('top1');
      else if (rank === 2) li.classList.add('top2');
      else if (rank === 3) li.classList.add('top3');

      let medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';

      li.innerHTML = `
        <span class="r">${medal}${rank}</span>
        <span class="n">${escapeHtml(item.name || 'Pilot')} ${isMe ? '<span class="badge-you">YOU</span>' : ''}</span>
        <div class="s-combo">
          <span class="s-dist mono">${(item.distance || 0).toLocaleString()} m</span>
          <span class="s-sep">&bull;</span>
          <span class="s-score mono">${(item.score || 0).toLocaleString()} pts</span>
        </div>
      `;
      listEl.appendChild(li);
    });

    const myStatEl = document.getElementById('live-my-stat');
    if (myStatEl) {
      if (myBestRank && myBestVal) {
        myStatEl.textContent = `#${myBestRank} (${myBestVal})`;
      } else {
        myStatEl.textContent = myName ? `${myName} — Ready to race` : 'Hit PLAY to get ranked!';
      }
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  // Pilot Name Prompt before play
  window.__promptPilotName = function() {
    return new Promise((resolve) => {
      const modal = document.getElementById('live-pilot-modal');
      const input = document.getElementById('live-pilot-input');
      const err = document.getElementById('live-pilot-err');
      const startBtn = document.getElementById('live-pilot-start');
      const cancelBtn = document.getElementById('live-pilot-cancel');

      if (!modal || !input) {
        resolve(true);
        return;
      }

      const prevName = getPilotName() || 'HRITIK';
      input.value = prevName;
      if (err) err.textContent = '';
      modal.classList.remove('hidden');

      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      function cleanup() {
        modal.classList.add('hidden');
        if (startBtn) startBtn.removeEventListener('click', onConfirm);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onKey);
      }

      function onConfirm() {
        const val = input.value.trim();
        if (!val) {
          if (err) err.textContent = 'Please enter a pilot callsign.';
          input.focus();
          return;
        }
        setPilotName(val);
        cleanup();
        renderLeaderboard();
        resolve(true);
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      function onKey(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }

      if (startBtn) startBtn.addEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      window.addEventListener('keydown', onKey);
    });
  };

  // Game over hook
  window.__onGameOver = function(e) {
    if (!e) return;
    const name = getPilotName() || 'Pilot';
    const dist = e.distance || 0;
    const score = e.score || 0;
    submitScore(name, dist, score);
  };

  // Bulletproof screen visibility manager
  function syncMenuVisibility() {
    const menu = document.getElementById('menu');
    const hud = document.getElementById('hud');
    const gameover = document.getElementById('gameover');
    if (!menu) return;

    const isPlaying = hud && !hud.classList.contains('hidden');
    const isGameOver = gameover && !gameover.classList.contains('hidden');
    const isMenuClassHidden = menu.classList.contains('hidden');

    if (isPlaying || isGameOver || isMenuClassHidden) {
      menu.style.setProperty('display', 'none', 'important');
      menu.style.setProperty('visibility', 'hidden', 'important');
      menu.style.setProperty('pointer-events', 'none', 'important');
      menu.style.setProperty('opacity', '0', 'important');
    } else {
      menu.style.removeProperty('display');
      menu.style.removeProperty('visibility');
      menu.style.removeProperty('pointer-events');
      menu.style.removeProperty('opacity');
    }
  }

  // Setup DOM and listeners
  function init() {
    cachedLeaderboard = loadLocalLeaderboard();
    fetchLeaderboard();

    const currentName = getPilotName();
    setPilotName(currentName);

    // Initial sync with DOM stats
    syncGameBestWithLeaderboard();

    // Wire up Pilot name click on menu
    const pilotBtn = document.getElementById('pilot-name');
    if (pilotBtn) {
      pilotBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__promptPilotName();
      };
    }

    // Wire up Store Coin Recharger button
    const claimCoinsBtn = document.getElementById('store-claim-coins-btn');
    if (claimCoinsBtn) {
      claimCoinsBtn.onclick = (e) => {
        e.preventDefault();
        if (window.__gameWallet) {
          window.__gameWallet.coins = (window.__gameWallet.coins || 0) + 500;
          window.__gameWallet.saveLocal?.();
          window.__gameWallet.emit?.();
        }
        claimCoinsBtn.innerHTML = '<span>⚡ +500 COINS ADDED!</span>';
        setTimeout(() => {
          claimCoinsBtn.innerHTML = '<span>⚡ CLAIM +500 COINS</span>';
        }, 1500);
      };
    }

    // Periodically sync stats and leaderboard
    setInterval(() => {
      syncGameBestWithLeaderboard();
      fetchLeaderboard();
    }, 10000);

    // Continuous pilot name and menu visibility enforcement
    setInterval(() => {
      const pBtn = document.getElementById('pilot-name');
      const expected = getPilotName();
      if (pBtn && expected && pBtn.textContent !== expected) {
        pBtn.textContent = expected;
      }
      syncGameBestWithLeaderboard();
    }, 500);

    syncMenuVisibility();
    const observer = new MutationObserver(syncMenuVisibility);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    setInterval(syncMenuVisibility, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
