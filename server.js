const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const LEADERBOARD_FILE = path.join(BASE_DIR, 'leaderboard.json');

const INITIAL_LEADERBOARD = [];

function getLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading leaderboard file:', e);
  }
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(INITIAL_LEADERBOARD, null, 2), 'utf8');
  return INITIAL_LEADERBOARD;
}

function saveLeaderboard(board) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(board, null, 2), 'utf8');
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
            const newEntry = {
              name: String(entry.name).trim().slice(0, 16) || 'Pilot',
              distance: Math.round(Number(entry.distance) || 0),
              score: Math.round(Number(entry.score) || 0),
              date: 'Just now'
            };
            board.push(newEntry);
            // Sort by distance descending
            board.sort((a, b) => (b.distance || 0) - (a.distance || 0));
            // Keep top 20
            const trimmed = board.slice(0, 20);
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
