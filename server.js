const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const publicPath = process.env.PUBLIC_PATH || path.join(__dirname, 'public');
app.use(express.static(publicPath));

const server = http.createServer(app);
const sessions = new Map();

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
    sessions.set(sessionId, { conn, host, username, shellStream: null });
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

    stream.on('data', (data) => {
      if (ws.readyState === 1) ws.send(data.toString());
    });

    stream.stderr.on('data', (data) => {
      if (ws.readyState === 1) ws.send(data.toString());
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
