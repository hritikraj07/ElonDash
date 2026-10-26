const fs = require('fs');
const path = require('path');

const TMP_FILE = path.join('/tmp', 'leaderboard.json');
const ROOT_FILE = path.join(process.cwd(), 'leaderboard.json');

function getLeaderboard() {
  // Check /tmp first (writable in serverless)
  try {
    if (fs.existsSync(TMP_FILE)) {
      const data = fs.readFileSync(TMP_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}

  // Fallback to initial file bundled in repo
  try {
    if (fs.existsSync(ROOT_FILE)) {
      const data = fs.readFileSync(ROOT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}

  return [];
}

function saveLeaderboard(board) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(board, null, 2), 'utf8');
  } catch (e) {
    // If not writable, ignore (client localStorage retains it)
  }
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
    list.push({
      name: name || 'Pilot',
      distance,
      score,
      date: 'Just now'
    });

    list.sort((a, b) => {
      if ((b.distance || 0) !== (a.distance || 0)) {
        return (b.distance || 0) - (a.distance || 0);
      }
      return (b.score || 0) - (a.score || 0);
    });

    const top = list.slice(0, 100);
    saveLeaderboard(top);
    return res.status(200).json(top);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
