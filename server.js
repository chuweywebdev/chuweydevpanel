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
const https = require('https');
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
const MAX_SESSIONS = 50;
const SESSION_TTL = 5 * 60 * 1000;
const sessionCleanup = setInterval(() => {
  const now = Date.now();
  const expired = [];
  for (const [id, s] of sessions) {
    if (!s.shellStream && s.execCount === 0 && now - s.lastUsed > SESSION_TTL) {
      expired.push(id);
    }
  }
  for (const id of expired) {
    const s = sessions.get(id);
    if (s) { try { s.conn.end(); } catch {} }
    sessions.delete(id);
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
    if (sessions.size >= MAX_SESSIONS) {
      conn.end();
      resolved = true;
      res.status(503).json({ error: 'Server at max capacity — try again later' });
      return;
    }
    sessions.set(sessionId, { conn, host, username, shellStream: null, execCount: 0, createdAt: Date.now(), lastUsed: Date.now(), wsRefs: new Set() });
    resolved = true;
    res.json({ sessionId, connected: true });
  });

  conn.on('error', (err) => {
    if (!resolved) { resolved = true; res.status(502).json({ error: 'Connection failed: ' + err.message }); }
  });

  conn.on('close', () => {
    const s = sessions.get(sessionId);
    if (s) {
      if (s.shellStream) { try { s.shellStream.close(); } catch {} }
      if (s.wsRefs) {
        for (const ws of s.wsRefs) {
          try { if (ws.readyState === 1) ws.close(4001, 'SSH connection closed'); } catch {}
        }
        s.wsRefs.clear();
      }
      sessions.delete(sessionId);
    }
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

/* ─── SSH Exec — run one command on a connected session ───────────────── */

app.post('/api/ssh/exec', (req, res) => {
  const { sessionId, command } = req.body;
  if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId required' });
  if (!command || typeof command !== 'string' || command.length > 2000)
    return res.status(400).json({ ok: false, error: 'Invalid command' });

  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
  session.lastUsed = Date.now();

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, 30000);

  session.conn.exec(command, (err, stream) => {
    if (err) { clearTimeout(timer); return res.json({ ok: false, error: err.message }); }

    let stdout = '';
    let stderr = '';
    stream.on('data', (d) => { if (!timedOut) stdout += d.toString(); });
    stream.stderr.on('data', (d) => { if (!timedOut) stderr += d.toString(); });
    stream.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return res.json({ ok: false, error: 'Command timed out' });
      res.json({ ok: code === 0, stdout, stderr, exitCode: code });
    });
  });
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
   WebSocket — Docker Exec Terminal (separate endpoint)
   ═══════════════════════════════════════════════════════════════════════ */

const wssExec = new WebSocketServer({ noServer: true });

function execWsHeartbeat() { this._isAlive = true; }
const execHbTimer = setInterval(() => {
  wssExec.clients.forEach((ws) => {
    if (ws._isAlive === false) {
      console.error('Exec WS heartbeat timeout — terminating');
      return ws.terminate();
    }
    ws._isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);
execHbTimer.unref();

wssExec.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).searchParams;
  const sessionId = params.get('sessionId');
  const containerId = params.get('containerId');
  const shellCmd = params.get('shell') || 'sh';

  if (!sessionId) { ws.close(4000, 'sessionId required'); return; }
  if (!containerId) { ws.close(4000, 'containerId required'); return; }

  const session = sessions.get(sessionId);
  if (!session) { ws.close(4001, 'Session not found or expired'); return; }
  session.lastUsed = Date.now();
  session.execCount = (session.execCount || 0) + 1;
  ws._sessionId = sessionId;
  ws._isAlive = true;
  ws.on('pong', execWsHeartbeat);
  if (session.wsRefs) session.wsRefs.add(ws);

  let closed = false;
  let execStream = null;
  let execTimeout = null;

  const cleanup = (skipWsClose) => {
    if (closed) return;
    closed = true;
    if (execTimeout) clearTimeout(execTimeout);
    if (session) {
      if (session.wsRefs) session.wsRefs.delete(ws);
      session.execCount = Math.max(0, (session.execCount || 1) - 1);
    }
    if (execStream) { try { execStream.close(); } catch {}; execStream = null; }
    if (!skipWsClose && ws.readyState === 1) {
      try { ws.close(); } catch {}
    }
  };

  ws.on('close', () => cleanup(true));
  ws.on('error', (err) => {
    console.error('Exec WS error [session ' + sessionId.slice(0,8) + ']:', err ? (err.message || err.code || String(err)) : 'unknown event');
    cleanup(true);
  });

  const command = 'docker exec -it ' + containerId.replace(/[^a-zA-Z0-9_.-]/g, '') + ' ' + shellCmd.replace(/[^a-zA-Z0-9_\/-]/g, '');

  execTimeout = setTimeout(() => {
    console.error('Exec timed out [session ' + sessionId.slice(0,8) + ']');
    try { ws.send(JSON.stringify({ type: 'error', message: 'Exec timed out' })); } catch {}
    try { ws.close(4002, 'Exec timed out'); } catch {}
    cleanup(true);
  }, 15000);

  try {
    session.conn.exec(command, {
      pty: { term: 'xterm-256color', cols: 100, rows: 30 }
    }, (err, stream) => {
      if (execTimeout) clearTimeout(execTimeout);

      if (err) {
        console.error('Exec failed [session ' + sessionId.slice(0,8) + ']:', err.message);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Exec failed: ' + err.message })); } catch {}
        try { ws.close(4002, 'Exec failed: ' + err.message); } catch {}
        cleanup(true);
        return;
      }

      execStream = stream;
      stream.setEncoding('utf-8');

      stream.on('data', (data) => {
        if (ws.readyState === 1) {
          try { ws.send(data); } catch {}
          session.lastUsed = Date.now();
        }
      });

      stream.stderr.on('data', (data) => {
        if (ws.readyState === 1) {
          try { ws.send(data); } catch {}
          session.lastUsed = Date.now();
        }
      });

      stream.on('error', (err) => {
        console.error('Exec stream error [session ' + sessionId.slice(0,8) + ']:', err.message);
        cleanup();
      });

      stream.on('close', () => cleanup());

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'input' && msg.data != null) {
            stream.write(msg.data);
            session.lastUsed = Date.now();
          } else if (msg.type === 'resize' && msg.cols && msg.rows) {
            stream.setWindow(msg.rows, msg.cols, msg.height || 480, msg.width || 800);
          }
        } catch {}
      });

      try { ws.send(JSON.stringify({ type: 'ready' })); } catch {}
    });
  } catch (execErr) {
    if (execTimeout) clearTimeout(execTimeout);
    console.error('Exec call threw synchronously [session ' + sessionId.slice(0,8) + ']:', execErr.message);
    try { ws.send(JSON.stringify({ type: 'error', message: 'Exec error: ' + execErr.message })); } catch {}
    try { ws.close(4002, 'Exec error: ' + execErr.message); } catch {}
    cleanup(true);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   WebSocket — Real PTY Shell Terminal
   ═══════════════════════════════════════════════════════════════════════ */

const wss = new WebSocketServer({ noServer: true });

function terminalWsHeartbeat() { this._isAlive = true; }
const terminalHbTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws._isAlive === false) {
      console.error('Terminal WS heartbeat timeout — terminating');
      return ws.terminate();
    }
    ws._isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);
terminalHbTimer.unref();

wss.on('connection', (ws, req) => {
  let sessionId;
  try {
    sessionId = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).searchParams.get('sessionId');
  } catch {
    ws.close(4000, 'Invalid request');
    return;
  }

  if (!sessionId) { ws.close(4000, 'sessionId required'); return; }

  const session = sessions.get(sessionId);
  if (!session) { ws.close(4001, 'Session not found or expired'); return; }
  session.lastUsed = Date.now();
  ws._sessionId = sessionId;
  ws._isAlive = true;
  ws.on('pong', terminalWsHeartbeat);
  if (session.wsRefs) session.wsRefs.add(ws);

  let closed = false;
  let shellTimeout = null;

  const cleanup = (skipWsClose) => {
    if (closed) return;
    closed = true;
    if (shellTimeout) clearTimeout(shellTimeout);
    if (session && session.wsRefs) session.wsRefs.delete(ws);
    if (session && session.shellStream) {
      try { session.shellStream.close(); } catch {}
      session.shellStream = null;
    }
    if (!skipWsClose && ws.readyState === 1) {
      try { ws.close(); } catch {}
    }
  };

  ws.on('close', () => cleanup(true));
  ws.on('error', (err) => {
    console.error('Terminal WS error [session ' + sessionId.slice(0,8) + ']:', err ? (err.message || err.code || String(err)) : 'unknown event');
    cleanup(true);
  });

  shellTimeout = setTimeout(() => {
    console.error('Shell creation timed out [session ' + sessionId.slice(0,8) + ']');
    try { ws.send(JSON.stringify({ type: 'error', message: 'SSH shell did not respond — connection may be blocked by firewall or NAT timeout' })); } catch {}
    try { ws.close(4002, 'Shell timed out'); } catch {}
    cleanup(true);
  }, 15000);

  try {
    session.conn.shell({
      term: 'xterm-256color',
      cols: 100,
      rows: 30,
      env: { TERM: 'xterm-256color' }
    }, (err, stream) => {
      if (shellTimeout) clearTimeout(shellTimeout);

      if (err) {
        console.error('Shell creation failed [session ' + sessionId.slice(0,8) + ']:', err.message);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Shell creation failed: ' + err.message })); } catch {}
        try { ws.close(4002, 'Shell creation failed: ' + err.message); } catch {}
        cleanup(true);
        return;
      }

      session.shellStream = stream;
      stream.setEncoding('utf-8');

      stream.on('data', (data) => {
        if (ws.readyState === 1) {
          try { ws.send(data); } catch {}
          session.lastUsed = Date.now();
        }
      });

      stream.stderr.on('data', (data) => {
        if (ws.readyState === 1) {
          try { ws.send(data); } catch {}
          session.lastUsed = Date.now();
        }
      });

      stream.on('error', (err) => {
        console.error('Shell stream error [session ' + sessionId.slice(0,8) + ']:', err.message);
        session.shellStream = null;
        cleanup();
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
            session.lastUsed = Date.now();
          } else if (msg.type === 'resize' && msg.cols && msg.rows) {
            stream.setWindow(msg.rows, msg.cols, msg.height || 480, msg.width || 800);
          }
        } catch {}
      });

      try {
        ws.send(JSON.stringify({ type: 'ready' }));
      } catch {}
    });
  } catch (shellErr) {
    if (shellTimeout) clearTimeout(shellTimeout);
    console.error('Shell call threw synchronously [session ' + sessionId.slice(0,8) + ']:', shellErr.message);
    try { ws.send(JSON.stringify({ type: 'error', message: 'Shell error: ' + shellErr.message })); } catch {}
    try { ws.close(4002, 'Shell error: ' + shellErr.message); } catch {}
    cleanup(true);
  }
});

wss.on('error', (err) => {
  console.error('Terminal WebSocket server error:', err.message);
});

/* ─── WebSocket Upgrade Router ──────────────────────────────────────────
   Only 1 WS server can auto-handle upgrades from a shared HTTP server
   because `handleUpgrade` calls `socket.end()` on path mismatch, which
   kills the socket before the 2nd server can use it.  We route manually
   instead.                                                    ────────── */

server.on('upgrade', (req, socket, head) => {
  const idx = req.url.indexOf('?');
  const pathname = idx !== -1 ? req.url.slice(0, idx) : req.url;

  const emit = (ws) => {
    target.emit('connection', ws, req);
  };
  let target;

  if (pathname === '/ws/exec') {
    target = wssExec;
  } else if (pathname === '/ws/terminal') {
    target = wss;
  } else {
    socket.destroy();
    return;
  }

  target.handleUpgrade(req, socket, head, emit);
});

/* ─── Backup / Telegram ───────────────────────────────────────────────── */

app.post('/api/backup/test', (req, res) => {
  const { token, chatId } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'Token required' });
  const payload = JSON.stringify({ chat_id: chatId || undefined, text: '✅ ChuweyDevPanel backup test — your bot is working!', parse_mode: 'Markdown' });
  const opts = { hostname: 'api.telegram.org', path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
  const reqTg = https.request(opts, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('error', e => { if (!res.headersSent) res.json({ ok: false, error: 'Response error: ' + e.message }); });
    resp.on('end', () => {
      try {
        const j = JSON.parse(d);
        if (j.ok) return res.json({ ok: true });
        res.json({ ok: false, error: j.description || 'Telegram API error' });
      } catch { res.json({ ok: false, error: 'Invalid Telegram response' }); }
    });
  });
  reqTg.on('error', e => { if (!res.headersSent) res.json({ ok: false, error: e.message }); });
  reqTg.write(payload);
  reqTg.end();
});

app.post('/api/backup/detect-chat', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'Token required' });
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
  const opts = { hostname: 'api.telegram.org', path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
  const reqTg = https.request(opts, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('error', e => { try { fs.unlinkSync(tmpFile); } catch {} if (!res.headersSent) res.json({ ok: false, error: 'Response error: ' + e.message }); });
    resp.on('end', () => {
      try {
        const j = JSON.parse(d);
        if (!j.ok) return res.json({ ok: false, error: j.description || 'Telegram error' });
      } catch { return res.json({ ok: false, error: 'Invalid Telegram response' }); }
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
        resp2.on('error', e => { try { fs.unlinkSync(tmpFile); } catch {} if (!res.headersSent) res.json({ ok: false, error: 'Response error: ' + e.message }); });
        resp2.on('end', () => {
          try { fs.unlinkSync(tmpFile); } catch {}
          try { const j2 = JSON.parse(d2); if (!res.headersSent) res.json({ ok: j2.ok === true, error: j2.description || undefined }); } catch { if (!res.headersSent) res.json({ ok: false, error: 'Invalid document response' }); }
        });
      });
      reqDoc.on('error', e => { try { fs.unlinkSync(tmpFile); } catch {} if (!res.headersSent) res.json({ ok: false, error: e.message }); });
      reqDoc.write(body);
      reqDoc.end();
    });
  });
  reqTg.on('error', e => { if (!res.headersSent) res.json({ ok: false, error: e.message }); });
  reqTg.write(payload);
  reqTg.end();
});

/* ─── Graceful Shutdown ───────────────────────────────────────────────── */

const shutdown = (signal) => {
  console.log('Shutdown signal ' + signal + ' received — draining sessions...');
  const entries = [...sessions];
  for (const [id, s] of entries) {
    if (s.shellStream) { try { s.shellStream.close(); } catch {} }
    try { s.conn.end(); } catch {}
    sessions.delete(id);
  }
  wss.close(() => {
    wssExec.close(() => {
      server.close(() => {
        console.log('Server shut down cleanly.');
        process.exit(0);
      });
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
