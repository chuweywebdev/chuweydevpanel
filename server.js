/* ─── Global error handlers — log before exit so main.js knows why ─── */
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  if (typeof process.send === 'function') {
    try { process.send({ type: 'error', message: err.message, stack: err.stack }); } catch {}
  }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason instanceof Error ? reason.message + ' ' + reason.stack : String(reason));
  if (typeof process.send === 'function') {
    try { process.send({ type: 'error', message: String(reason) }); } catch {}
  }
  process.exit(1);
});

const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
const publicPath = process.env.PUBLIC_PATH || path.join(__dirname, 'public');
app.use(express.static(publicPath));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down.' }
});
app.use('/api/', apiLimiter);

const server = http.createServer(app);
const sessions = new Map();
const SESSION_TTL = 5 * 60 * 1000;
const sessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (!s.shellStream && now - s.createdAt > SESSION_TTL) {
      try { s.conn.end(); } catch {}
      sessions.delete(id);
    }
  }
}, 60 * 1000);
sessionCleanup.unref();

/* ─── SSH Connect ─────────────────────────────────────────────────────── */

app.post('/api/ssh/connect', (req, res) => {
  const { host, port, username, password, privateKey } = req.body;
  if (!host || !username) return res.status(400).json({ error: 'host and username required' });
  if (typeof host !== 'string' || host.length > 255) return res.status(400).json({ error: 'Invalid host' });
  if (typeof username !== 'string' || username.length > 255) return res.status(400).json({ error: 'Invalid username' });
  const portNum = parseInt(port, 10);
  if (port && (isNaN(portNum) || portNum < 1 || portNum > 65535)) return res.status(400).json({ error: 'Invalid port' });

  const conn = new Client();
  const sessionId = crypto.randomUUID();
  let resolved = false;

  conn.on('ready', () => {
    sessions.set(sessionId, { conn, host, username, shellStream: null, createdAt: Date.now() });
    resolved = true;
    res.json({ sessionId, connected: true });
  });

  conn.on('error', (err) => {
    if (!resolved) { resolved = true; res.status(502).json({ error: 'Connection failed: ' + err.message }); }
  });

  conn.on('close', () => {
    const s = sessions.get(sessionId);
    if (s && s.shellStream) { try { s.shellStream.close(); } catch {} }
    sessions.delete(sessionId);
  });

  const config = { host, port: parseInt(port, 10) || 22, username, readyTimeout: 10000 };
  if (password) config.password = password;
  if (privateKey) config.privateKey = privateKey;

  conn.connect(config);

  setTimeout(() => {
    if (!resolved) { resolved = true; conn.end(); res.status(504).json({ error: 'Connection timed out after 10s' }); }
  }, 10000);
});

/* ─── SSH Test Connection ─────────────────────────────────────────────── */

app.post('/api/ssh/test-connection', (req, res) => {
  const { host, port, username, password } = req.body;
  if (!host || typeof host !== 'string') return res.status(400).json({ success: false, error: 'Host required' });
  if (!username || typeof username !== 'string') return res.status(400).json({ success: false, error: 'Username required' });
  const portNum = parseInt(port, 10) || 22;
  if (portNum < 1 || portNum > 65535) return res.status(400).json({ success: false, error: 'Invalid port' });

  const conn = new Client();
  let resolved = false;

  const done = (result) => {
    if (resolved) return;
    resolved = true;
    try { conn.end(); } catch {}
    res.json(result);
  };

  conn.on('ready', () => {
    done({ success: true });
  });

  conn.on('error', (err) => {
    const msg = err.message || String(err);
    if (msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('auth')) {
      done({ success: false, error: 'Authentication failed — check username and password' });
    } else {
      done({ success: false, error: msg });
    }
  });

  conn.on('close', () => {
    done({ success: false, error: 'Connection closed unexpectedly' });
  });

  const config = { host, port: portNum, username, readyTimeout: 8000 };
  if (password) config.password = password;
  conn.connect(config);

  setTimeout(() => {
    done({ success: false, error: 'Connection timed out after 8s' });
  }, 8000);
});

/* ─── SSH Disconnect ──────────────────────────────────────────────────── */

app.post('/api/ssh/disconnect', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const session = sessions.get(sessionId);
  if (session) {
    if (session.shellStream) { try { session.shellStream.close(); } catch {} }
    session.conn.end();
  }
  res.json({ disconnected: true });
});

/* ─── List Active Sessions ────────────────────────────────────────────── */

app.get('/api/ssh/sessions', (req, res) => {
  const list = [];
  for (const [id, s] of sessions) {
    list.push({ sessionId: id, host: s.host, username: s.username });
  }
  res.json(list);
});

/* ═══════════════════════════════════════════════════════════════════════
   WebSocket — Real PTY Shell Terminal
   ═══════════════════════════════════════════════════════════════════════ */

const wss = new WebSocketServer({ server, path: '/ws/terminal' });

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).searchParams;
  const sessionId = params.get('sessionId');

  if (!sessionId) { ws.close(4000, 'sessionId required'); return; }

  const session = sessions.get(sessionId);
  if (!session) { ws.close(4001, 'Session not found or expired'); return; }

  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (session.shellStream) {
      try { session.shellStream.close(); } catch {}
      session.shellStream = null;
    }
    try { ws.close(); } catch {}
  };

  session.conn.shell({
    term: 'xterm-256color',
    cols: 100,
    rows: 30
  }, (err, stream) => {
    if (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Shell creation failed: ' + err.message }));
      ws.close(4002, 'Shell creation failed: ' + err.message);
      return;
    }

    session.shellStream = stream;
    stream.setEncoding('utf-8');

    stream.on('data', (data) => {
      if (ws.readyState === 1) ws.send(data);
    });

    stream.stderr.on('data', (data) => {
      if (ws.readyState === 1) ws.send(data);
    });

    stream.on('close', () => {
      session.shellStream = null;
      cleanup();
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'input' && msg.data != null) {
          stream.write(msg.data);
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          stream.setWindow(msg.rows, msg.cols, msg.height || 480, msg.width || 800);
        }
      } catch {}
    });

    ws.on('close', () => cleanup());
    ws.on('error', () => cleanup());

    ws.send(JSON.stringify({ type: 'ready' }));
  });
});

/* ─── Backup / Telegram ───────────────────────────────────────────────── */

app.post('/api/backup/test', (req, res) => {
  const { token, chatId } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'Token required' });
  const https = require('https');
  const payload = JSON.stringify({ chat_id: chatId || undefined, text: '✅ ChuweyDevPanel backup test — your bot is working!', parse_mode: 'Markdown' });
  const opts = { hostname: 'api.telegram.org', path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
  const reqTg = https.request(opts, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('end', () => {
      const j = JSON.parse(d);
      if (j.ok) return res.json({ ok: true });
      res.json({ ok: false, error: j.description || 'Telegram API error' });
    });
  });
  reqTg.on('error', e => res.json({ ok: false, error: e.message }));
  reqTg.write(payload);
  reqTg.end();
});

app.post('/api/backup/detect-chat', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'Token required' });
  const https = require('https');
  https.get('https://api.telegram.org/bot' + token + '/getUpdates', (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('end', () => {
      try {
        const j = JSON.parse(d);
        if (j.ok && j.result && j.result.length > 0) {
          const msg = j.result[0].message || j.result[0].channel_post;
          if (msg && msg.chat && msg.chat.id) return res.json({ ok: true, chatId: String(msg.chat.id) });
        }
        res.json({ ok: false, error: 'No messages found' });
      } catch { res.json({ ok: false, error: 'Parse error' }); }
    });
  }).on('error', e => res.json({ ok: false, error: e.message }));
});

app.post('/api/backup/export', (req, res) => {
  const { token, chatId, data } = req.body;
  if (!token || !data) return res.status(400).json({ ok: false, error: 'Token and data required' });
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const hasTelegram = data.telegram && data.telegram.botToken ? 'Yes' : 'No';
  const payload = JSON.stringify({ chat_id: chatId || undefined, text: '📦 *DevPanel Backup ' + dateStr + '*\nServers: ' + (data.servers||[]).length + '\nSnippets: ' + (data.snippets||[]).length + '\nTelegram Config: ' + hasTelegram });
  const https = require('https');
  const opts = { hostname: 'api.telegram.org', path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
  const reqTg = https.request(opts, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('end', () => {
      const j = JSON.parse(d);
      if (!j.ok) return res.json({ ok: false, error: j.description || 'Telegram error' });
      const jsonStr = JSON.stringify(data, null, 2);
      const tmpFile = path.join(os.tmpdir(), 'devpanel-backup-' + dateStr + '.json');
      fs.writeFileSync(tmpFile, jsonStr, 'utf8');
      const boundary = '----' + Date.now().toString(16);
      let body = '';
      body += '--' + boundary + '\r\n';
      body += 'Content-Disposition: form-data; name="document"; filename="' + 'devpanel-backup-' + dateStr + '.json"\r\n';
      body += 'Content-Type: application/json\r\n\r\n';
      body += jsonStr + '\r\n';
      body += '--' + boundary + '--\r\n';
      const docOpts = { hostname: 'api.telegram.org', path: '/bot' + token + '/sendDocument?chat_id=' + encodeURIComponent(chatId || ''), method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } };
      const reqDoc = https.request(docOpts, (resp2) => {
        let d2 = '';
        resp2.on('data', c => d2 += c);
        resp2.on('end', () => {
          try { fs.unlinkSync(tmpFile); } catch {}
          const j2 = JSON.parse(d2);
          res.json({ ok: j2.ok === true, error: j2.description || undefined });
        });
      });
      reqDoc.on('error', e => { try { fs.unlinkSync(tmpFile); } catch {} res.json({ ok: false, error: e.message }); });
      reqDoc.write(body);
      reqDoc.end();
    });
  });
  reqTg.on('error', e => res.json({ ok: false, error: e.message }));
  reqTg.write(payload);
  reqTg.end();
});

/* ─── Graceful Shutdown ───────────────────────────────────────────────── */

const shutdown = (signal) => {
  console.log('Shutdown signal ' + signal + ' received — draining sessions...');
  for (const [id, s] of sessions) {
    if (s.shellStream) { try { s.shellStream.close(); } catch {} }
    try { s.conn.end(); } catch {}
    sessions.delete(id);
  }
  wss.close(() => {
    server.close(() => {
      console.log('Server shut down cleanly.');
      process.exit(0);
    });
  });
  setTimeout(() => { console.error('Shutdown timed out — force exiting.'); process.exit(1); }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* ─── Start Server ────────────────────────────────────────────────────── */

const PORT = parseInt(process.env.PORT, 10) || 1000;

server.on('error', (err) => {
  console.error('Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Close the other program or change the port.');
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('ChuweyDevPanel server running on http://localhost:' + PORT);
  if (typeof process.send === 'function') {
    process.send({ type: 'ready', port: PORT });
  }
});
