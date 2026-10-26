const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const LEADERBOARD_FILE = path.join(BASE_DIR, 'leaderboard.json');

const INITIAL_LEADERBOARD = [];

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
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicate(parsed);
    }
  } catch (e) {
    console.error('Error reading leaderboard file:', e);
  }
  return [];
}

function saveLeaderboard(board) {
  try {
    const deduped = deduplicate(board);
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(deduped, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing leaderboard file:', e);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API endpoints
  if (pathname === '/api/geo') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      countryCode: 'US',
      regionCode: 'CA',
      region: 'California',
      locationToken: 'local-session-token'
    }));
    return;
  }

  if (pathname === '/api/server-status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      checkedAt: new Date().toISOString()
    }));
    return;
  }

  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      const board = getLeaderboard();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(board));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const entry = JSON.parse(body);
          if (entry && entry.name) {
            const board = getLeaderboard();
            const rawName = String(entry.name).trim().slice(0, 24) || 'Pilot';
            const dist = Math.round(Number(entry.distance) || 0);
            const scr = Math.round(Number(entry.score) || 0);

            const norm = rawName.toLowerCase();
            const existing = board.find(e => (e.name || '').trim().toLowerCase() === norm);
            if (existing) {
              existing.distance = Math.max(existing.distance || 0, dist);
              existing.score = Math.max(existing.score || 0, scr);
              existing.name = rawName;
              existing.date = 'Just now';
            } else {
              board.push({
                name: rawName,
                distance: dist,
                score: scr,
                date: 'Just now'
              });
            }

            const trimmed = deduplicate(board);
            saveLeaderboard(trimmed);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(trimmed));
            return;
          }
        } catch (e) {
          console.error('Error parsing leaderboard POST body:', e);
        }
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'invalid payload' }));
      });
      return;
    }
  }

  // Static file serving
  let relPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(BASE_DIR, relPath);

  // Security check to avoid path traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      } else {
        filePath = path.join(BASE_DIR, 'index.html');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`ElonDash server running at http://localhost:${PORT}`);
});
