// ── ELONDASH LIVE LEADERBOARD & PILOT CONTROLLER ──
(function() {
  const DEFAULT_LEADERBOARD = [];
  let cachedLeaderboard = [];

  function loadLocalLeaderboard() {
    try {
      const stored = localStorage.getItem('elondash_live_leaderboard');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch(e) {}
    return [];
  }

  function saveLocalLeaderboard(data) {
    try {
      localStorage.setItem('elondash_live_leaderboard', JSON.stringify(data));
    } catch(e) {}
  }

  function getPilotName() {
    return (localStorage.getItem('elondash_pilot_name') || '').trim();
  }

  function setPilotName(name) {
    name = (name || '').trim();
    if (!name) name = 'Pilot';
    localStorage.setItem('elondash_pilot_name', name);
    const pilotBtn = document.getElementById('pilot-name');
    if (pilotBtn) pilotBtn.textContent = name;
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          cachedLeaderboard = data;
          saveLocalLeaderboard(data);
          renderLeaderboard();
          return;
        }
      }
    } catch(e) {}
    cachedLeaderboard = loadLocalLeaderboard();
    renderLeaderboard();
  }

  async function submitScore(name, distance, score) {
    name = name || getPilotName() || 'Pilot';
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, distance, score })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          cachedLeaderboard = data;
          saveLocalLeaderboard(data);
          renderLeaderboard();
          return;
        }
      }
    } catch(e) {}

    // Fallback local update
    const board = loadLocalLeaderboard();
    board.push({ name, distance, score, date: 'Just now' });
    board.sort((a, b) => (b.distance || 0) - (a.distance || 0));
    cachedLeaderboard = board.slice(0, 20);
    saveLocalLeaderboard(cachedLeaderboard);
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const listEl = document.getElementById('live-lb-list');
    if (!listEl) return;
    const myName = getPilotName();
    
    // Sort primarily by distance, secondary by score
    const sorted = [...cachedLeaderboard].sort((a, b) => {
      if ((b.distance || 0) !== (a.distance || 0)) {
        return (b.distance || 0) - (a.distance || 0);
      }
      return (b.score || 0) - (a.score || 0);
    });

    listEl.innerHTML = '';

    // Empty state if nothing added yet
    if (sorted.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'live-empty-state';
      emptyLi.innerHTML = `
        <div class="live-empty-icon">🏁</div>
        <div class="live-empty-title">NO RUNS RECORDED YET</div>
        <div class="live-empty-desc">Hit PLAY to launch and set the first record on the leaderboard!</div>
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
      if (myBestRank) {
        myStatEl.textContent = `#${myBestRank} (${myBestVal})`;
      } else {
        myStatEl.textContent = myName ? `${myName} — No record yet` : 'Hit PLAY to get ranked!';
      }
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
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

      const prevName = getPilotName() || '';
      input.value = prevName;
      if (err) err.textContent = '';
      modal.classList.remove('hidden');

      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      function cleanup() {
        modal.classList.add('hidden');
        startBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
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

      startBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
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

  // Bulletproof screen visibility manager:
  // When HUD is active (playing) or GameOver is shown or Menu has 'hidden', force-hide #menu.
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
    // Clear legacy mock seed data from previous test
    try {
      localStorage.removeItem('roadster_live_leaderboard');
    } catch(e) {}

    cachedLeaderboard = loadLocalLeaderboard();
    fetchLeaderboard();

    const initialName = getPilotName() || 'Pilot';
    setPilotName(initialName);

    // Pilot name button on menu can be clicked to change name
    const pilotBtn = document.getElementById('pilot-name');
    if (pilotBtn) {
      pilotBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__promptPilotName();
      };
    }

    // Periodically sync leaderboard
    setInterval(fetchLeaderboard, 15000);

    // Active menu visibility enforcement
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
