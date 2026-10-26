const fs = require('fs');
const path = require('path');

const TMP_FILE = path.join('/tmp', 'leaderboard.json');
const ROOT_FILE = path.join(process.cwd(), 'leaderboard.json');

function deduplicate(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();

  for (const item of list) {
    if (!item) continue;
    const rawName = String(item.name || 'Pilot').trim().slice(0, 24);
    const norm = rawName.toLowerCase();
    const dist = Math.round(Number(item.distance) || 0);
    const scr = Math.round(Number(item.score) || 0);
    const date = item.date || 'Just now';

    if (!map.has(norm)) {
      map.set(norm, { name: rawName, distance: dist, score: scr, date });
    } else {
      const existing = map.get(norm);
      existing.distance = Math.max(existing.distance, dist);
      existing.score = Math.max(existing.score, scr);
      if (dist > existing.distance || scr > existing.score) {
        existing.name = rawName;
        existing.date = date;
      }
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (b.distance !== a.distance) return b.distance - a.distance;
    return b.score - a.score;
  });
  return result.slice(0, 100);
}

function getLeaderboard() {
  // Check /tmp first (writable in serverless)
  try {
    if (fs.existsSync(TMP_FILE)) {
      const data = fs.readFileSync(TMP_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicate(parsed);
    }
  } catch (e) {}

  // Fallback to initial file bundled in repo
  try {
    if (fs.existsSync(ROOT_FILE)) {
      const data = fs.readFileSync(ROOT_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicate(parsed);
    }
  } catch (e) {}

  return [];
}

function saveLeaderboard(board) {
  const deduped = deduplicate(board);
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(deduped, null, 2), 'utf8');
  } catch (e) {}
  try {
    fs.writeFileSync(ROOT_FILE, JSON.stringify(deduped, null, 2), 'utf8');
  } catch (e) {}
}

module.exports = function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const list = getLeaderboard();
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    const name = (body.name || 'Pilot').trim().slice(0, 24);
    const distance = Math.round(Number(body.distance) || 0);
    const score = Math.round(Number(body.score) || 0);

    const list = getLeaderboard();
    const norm = name.toLowerCase();
    const existing = list.find(e => (e.name || '').trim().toLowerCase() === norm);

    if (existing) {
      existing.distance = Math.max(existing.distance || 0, distance);
      existing.score = Math.max(existing.score || 0, score);
      existing.name = name;
      existing.date = 'Just now';
    } else {
      list.push({
        name: name || 'Pilot',
        distance,
        score,
        date: 'Just now'
      });
    }

    const top = deduplicate(list);
    saveLeaderboard(top);
    return res.status(200).json(top);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
