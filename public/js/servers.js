const Servers = {
  _sessions: null,
  _activeTerminalId: null,

  render() {
    const all = Store.getAll('servers');

    const h = ['<div class="module-toolbar">',
      '<div></div>',
      '<button class="btn btn-primary" id="add-server-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Server</button>',
    '</div>'];

    if (!all.length) {
      h.push('<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>');
      h.push('<p>No servers yet. Add your first server!</p></div>');
    } else {
      h.push('<div class="list-container">');
      for (const s of all) h.push(this._card(s));
      h.push('</div>');
    }

    document.getElementById('content').innerHTML = h.join('');

    document.getElementById('add-server-btn').addEventListener('click', () => this.form());
    document.getElementById('content').addEventListener('click', (e) => {
      const card = e.target.closest('.server-card');
      if (!card) return;
      const id = card.dataset.id;
      if (e.target.closest('.copy-ssh')) {
        const ssh = this._sshCmd(Store.getById('servers', id));
        UI.copy(ssh, 'SSH command copied!');
      } else if (e.target.closest('.edit-srv')) {
        this.form(id);
      } else if (e.target.closest('.del-srv')) {
        this._del(id);
      } else if (e.target.closest('.connect-srv')) {
        this._connect(id);
      } else if (e.target.closest('.disconnect-srv')) {
        this._disconnect(id);
      }
    });
  },

  _card(s) {
    const id = s.id;
    const ssh = this._sshCmd(s);
    const notes = s.notes ? '<div class="server-notes">' + UI.escHtml(s.notes) + '</div>' : '';
    const portStr = s.port && s.port !== '22' ? ':' + UI.escHtml(s.port) : '';
    const session = this._sessions && this._sessions[id];
    const connected = !!(session && session.connected);
    return '<div class="card server-card' + (connected ? ' connected' : '') + '" data-id="' + s.id + '">' +
      '<div class="card-header"><span class="card-title">' + UI.escHtml(s.name) + '</span>' +
      '<div class="card-actions">' +
      (connected
        ? '<button class="btn-icon disconnect-srv" title="Disconnect"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></button>'
        : '<button class="btn-icon connect-srv" title="Connect"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></button>') +
      '<button class="btn-icon copy-ssh" title="Copy SSH command">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      '</button>' +
      '<button class="btn-icon edit-srv" title="Edit">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      '</button>' +
      '<button class="btn-icon del-srv" title="Delete">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button></div></div>' +
      (connected ? '<div class="card-badge badge-connected">Connected</div>' : '') +
      '<div class="card-body">' +
      '<div class="info-grid">' +
      '<div class="info-item"><span class="info-label">IP Address</span><span class="info-value mono">' + UI.escHtml(s.ip) + portStr + '</span></div>' +
      '<div class="info-item"><span class="info-label">Username</span><span class="info-value">' + UI.escHtml(s.username) + '</span></div>' +
      (s.lastReboot ? '<div class="info-item"><span class="info-label">Last Boot</span><span class="info-value">' + UI.escHtml(new Date(s.lastReboot).toLocaleString()) + '</span></div>' : '') +
      '</div>' + notes +
      '<div class="ssh-command"><code>' + UI.escHtml(ssh) + '</code><button class="btn-sm copy-ssh">Copy SSH</button></div>' +
      '</div></div>';
  },

  _sshCmd(s) {
    const esc = (v) => (v || '').replace(/[^a-zA-Z0-9_.-]/g, '');
    const user = esc(s.username);
    const host = (s.ip || '').replace(/[^a-zA-Z0-9_.:-]/g, '');
    let cmd = 'ssh ' + user + '@' + host;
    if (s.port && s.port !== '22') cmd += ' -p ' + (s.port || '').replace(/[^0-9]/g, '');
    return cmd;
  },

  _connect(id) {
    const s = Store.getById('servers', id);
    if (!s) return;

    const doConnect = (password, privateKey) => {
      const body = { host: s.ip, port: s.port || '22', username: s.username };
      if (password) body.password = password;
      if (privateKey) body.privateKey = privateKey;

      fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(r => r.json())
        .then(result => {
          if (result.error) {
            UI.toast(result.error, 'error');
            return;
          }
          if (!this._sessions) this._sessions = {};
          this._sessions[id] = { sessionId: result.sessionId, connected: true };
          this._openTerminal(result.sessionId, s);
          this.render();
          UI.toast('Connected to ' + s.name, 'success');
        })
        .catch(err => {
          UI.toast('Connection failed: ' + err.message, 'error');
        });
    };

    if (s.password || s.privateKey) {
      doConnect(s.password, s.privateKey);
      return;
    }

    const h = [
      '<form id="connect-form">',
      '<input type="hidden" name="id" value="' + s.id + '">',
      '<div class="form-group"><label class="form-label">Server</label><div class="form-text" style="font-weight:600">' + UI.escHtml(s.name) + ' (' + UI.escHtml(s.username) + '@' + UI.escHtml(s.ip) + ')</div></div>',
      '<div class="form-group"><label class="form-label">Password</label><input type="password" name="password" class="form-input" placeholder="SSH password" autocomplete="off"></div>',
      '<div class="form-group"><label class="form-label">Private Key <span class="text-muted">(optional, paste content)</span></label><textarea name="privateKey" class="form-input form-textarea" style="min-height:80px;font-family:var(--font-mono);font-size:0.8rem" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."></textarea></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary" id="connect-submit">Connect</button></div>',
      '</form>'
    ];

    UI.showModal('Connect to Server', h.join(''));

    document.getElementById('connect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      const btn = document.getElementById('connect-submit');
      btn.textContent = 'Connecting...';
      btn.disabled = true;

      const body = { host: s.ip, port: s.port || '22', username: s.username };
      if (data.password) body.password = data.password;
      if (data.privateKey) body.privateKey = data.privateKey;

      fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(r => r.json())
        .then(result => {
          if (result.error) {
            UI.toast(result.error, 'error');
            btn.textContent = 'Connect';
            btn.disabled = false;
            return;
          }
          UI.hideModal();
          if (!this._sessions) this._sessions = {};
          this._sessions[id] = { sessionId: result.sessionId, connected: true };
          this._openTerminal(result.sessionId, s);
          this.render();
          UI.toast('Connected to ' + s.name, 'success');
        })
        .catch(err => {
          UI.toast('Connection failed: ' + err.message, 'error');
          btn.textContent = 'Connect';
          btn.disabled = false;
        });
    });
  },

  _disconnect(id) {
    const session = this._sessions && this._sessions[id];
    if (!session) return;

    fetch('/api/ssh/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId })
    }).catch(() => {});

    delete this._sessions[id];
    if (this._activeTerminalId === id) this._activeTerminalId = null;
    this.render();
    UI.toast('Disconnected');
  },

  _openTerminal(sessionId, server) {
    this._activeTerminalId = server.id;

    let ws = null;
    let closed = false;
    let autoScroll = true;

    const h = [
      '<div class="terminal-modal">',
      '<div class="terminal-header">',
      '<div class="terminal-title">',
      '<span class="status-dot" id="term-status"></span>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
      UI.escHtml(server.name),
      '<span class="terminal-badge">' + UI.escHtml(server.username) + '@' + UI.escHtml(server.ip) + '</span>',
      '</div>',
      '<div class="terminal-toolbar">',
      '<button class="terminal-btn" id="term-auto-btn" title="Toggle auto-scroll">▼ <span>Auto</span></button>',
      '<button class="btn btn-secondary btn-sm" id="term-close-btn">Disconnect</button>',
      '</div>',
      '</div>',
      '<div id="term-output" class="terminal-output"></div>',
      '<div class="terminal-input-row">',
      '<span class="terminal-prompt">$</span>',
      '<input type="text" id="term-input" class="terminal-input" placeholder="Enter command..." spellcheck="false" autofocus disabled>',
      '<button class="btn btn-primary btn-sm" id="term-run-btn" disabled>Run</button>',
      '</div>',
      '</div>'
    ];

    UI.showModal('SSH Terminal — ' + server.name, h.join(''), () => {
      closed = true;
      if (ws) { try { ws.close(); } catch {} }
      if (this._sessions && this._sessions[server.id]) {
        this._disconnect(server.id);
      }
    });

    const output = document.getElementById('term-output');
    const input = document.getElementById('term-input');
    const runBtn = document.getElementById('term-run-btn');
    const closeBtn = document.getElementById('term-close-btn');
    const autoBtn = document.getElementById('term-auto-btn');
    const statusDot = document.getElementById('term-status');

    /* ── ANSI → HTML parser ── */

    const C = {30:'#666',31:'#f14c4c',32:'#23d18b',33:'#f5f543',34:'#3b8eea',35:'#d670d6',36:'#29b8db',37:'#e5e5e5',
               90:'#666',91:'#f14c4c',92:'#23d18b',93:'#f5f543',94:'#3b8eea',95:'#d670d6',96:'#29b8db',97:'#fff',
               40:'#000',41:'#cd3131',42:'#0dbc79',43:'#e5e510',44:'#2472c8',45:'#bc3fbc',46:'#11a8cd',47:'#e5e5e5',
              100:'#000',101:'#cd3131',102:'#0dbc79',103:'#e5e510',104:'#2472c8',105:'#bc3fbc',106:'#11a8cd',107:'#e5e5e5'};

    const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const S = { bold:false, dim:false, italic:false, underline:false, fg:null, bg:null,
      reset() { this.bold=false; this.dim=false; this.italic=false; this.underline=false; this.fg=null; this.bg=null; },
      inline() {
        const a=[];
        if (this.fg) a.push('color:'+this.fg);
        if (this.bg) a.push('background:'+this.bg);
        if (this.bold) a.push('font-weight:700');
        if (this.italic) a.push('font-style:italic');
        if (this.underline) a.push('text-decoration:underline');
        if (this.dim) a.push('opacity:0.7');
        return a.length ? ' style="'+a.join(';')+'"' : '';
      }
    };

    const ansiToHtml = (str) => {
      let out = '', i = 0;
      while (i < str.length) {
        if (str[i] === '\x1B' && i+1 < str.length) {
          if (str[i+1] === '[') {
            let j = i+2;
            while (j < str.length && !/[A-Za-z]/.test(str[j])) j++;
            if (j < str.length) {
              const cmd = str[j], params = str.slice(i+2, j);
              i = j+1;
              if (cmd === 'm') {
                const prev = S.inline();
                if (!params || params === '0') S.reset();
                else for (const c of params.split(';')) {
                  const n = parseInt(c,10);
                  if (c === '' || c === '0') S.reset();
                  else if (n === 1) S.bold = true;
                  else if (n === 2) S.dim = true;
                  else if (n === 3) S.italic = true;
                  else if (n === 4) S.underline = true;
                  else if (n === 22) { S.bold = false; S.dim = false; }
                  else if (n === 23) S.italic = false;
                  else if (n === 24) S.underline = false;
                  else if (n === 39) S.fg = null;
                  else if (n === 49) S.bg = null;
                  else if (C[n]) { if (n >= 40 && n <= 47 || n >= 100 && n <= 107) S.bg = C[n]; else S.fg = C[n]; }
                }
                const cur = S.inline();
                if (prev) out += '</span>';
                if (cur) out += '<span'+cur+'>';
              }
              // other escape sequences (cursor moves) silently dropped
              continue;
            }
          } else if (str[i+1] === ']') {
            let j = i+2;
            while (j < str.length && str[j] !== '\x07' && !(str[j] === '\x1B' && j+1 < str.length && str[j+1] === '\\')) j++;
            i = j < str.length ? j+1 : str.length;
            continue;
          } else { i += 2; continue; }
        }
        out += esc(str[i]);
        i++;
      }
      return out;
    };

    /* ── Output buffer & render ── */

    let outLen = 0;
    const MAX_OUT = 150 * 1024;

    const append = (data) => {
      if (data.includes('\x1B[2J') || data.includes('\x1B[H\x1B[2J')) {
        output.innerHTML = '';
        outLen = 0;
        S.reset();
      }
      const html = ansiToHtml(data);
      if (!html) return;
      output.insertAdjacentHTML('beforeend', html);
      outLen += html.length;
      if (outLen > MAX_OUT) {
        const idx = output.innerHTML.lastIndexOf('\n', output.innerHTML.length - MAX_OUT/2);
        output.innerHTML = output.innerHTML.slice(Math.max(0, idx > 0 ? idx : output.innerHTML.length - MAX_OUT/2));
        outLen = output.innerHTML.length;
      }
      if (autoScroll) output.scrollTop = output.scrollHeight;
    };

    /* ── WebSocket connection ── */

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws/terminal?sessionId=' + sessionId);

    ws.onopen = () => {
      output.innerHTML = '';
      outLen = 0;
      S.reset();
      input.disabled = false;
      runBtn.disabled = false;
      statusDot.className = 'status-dot connected';
      input.focus();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') return;
      } catch {}
      append(e.data);
    };

    ws.onerror = () => {
      if (closed) return;
      append('WebSocket error — check that the ChuweyDevPanel server is running.\n');
      input.disabled = true;
      runBtn.disabled = true;
      statusDot.className = 'status-dot error';
    };

    ws.onclose = (evt) => {
      if (closed) return;
      const reason = evt.reason ? ' (' + evt.reason + ')' : '';
      append('Connection closed (code ' + evt.code + ')' + reason + '.\n');
      input.disabled = true;
      runBtn.disabled = true;
      statusDot.className = 'status-dot';
    };

    /* ── Send input ── */

    const sendInput = (text) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    };

    const cmdHistory = [];
    let cmdIdx = -1;

    const runCmd = () => {
      const cmd = input.value;
      if (!cmd) return;
      sendInput(cmd + '\n');
      if (!cmdHistory.length || cmdHistory[cmdHistory.length - 1] !== cmd) {
        cmdHistory.push(cmd);
      }
      cmdIdx = cmdHistory.length;
      input.value = '';
    };

    runBtn.addEventListener('click', runCmd);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        runCmd();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmdHistory.length && cmdIdx > 0) {
          cmdIdx--;
          input.value = cmdHistory[cmdIdx];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cmdIdx < cmdHistory.length - 1) {
          cmdIdx++;
          input.value = cmdHistory[cmdIdx];
        } else {
          cmdIdx = cmdHistory.length;
          input.value = '';
        }
      } else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); sendInput('\x03'); }
      else if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); sendInput('\x04'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); sendInput('\x0c'); }
      else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); sendInput('\x1a'); }
      else if (e.key === 'u' && e.ctrlKey) { e.preventDefault(); input.value = ''; }
    });

    /* ── Auto-scroll toggle ── */

    autoBtn.addEventListener('click', () => {
      autoScroll = !autoScroll;
      autoBtn.classList.toggle('active', autoScroll);
      if (autoScroll) output.scrollTop = output.scrollHeight;
    });
    autoBtn.classList.add('active');

    closeBtn.addEventListener('click', () => {
      closed = true;
      if (ws) { try { ws.close(); } catch {} }
      UI.hideModal();
    });
  },

  form(id) {
    const s = id ? Store.getById('servers', id) : null;
    const title = s ? 'Edit Server' : 'Add Server';
    const h = ['<form id="server-form">'];
    if (s) h.push('<input type="hidden" name="id" value="' + s.id + '">');
    h.push(
      '<div class="form-group"><label class="form-label">Server Name</label><input type="text" name="name" class="form-input" required placeholder="Production DB" value="' + UI.escAttr(s ? s.name : '') + '"></div>',
      '<div class="form-row"><div class="form-group flex-2"><label class="form-label">IP Address</label><input type="text" name="ip" class="form-input" required placeholder="192.168.1.100" value="' + UI.escAttr(s ? s.ip : '') + '"></div>',
      '<div class="form-group flex-1"><label class="form-label">Port</label><input type="number" name="port" class="form-input" value="' + (s && s.port ? s.port : '22') + '" min="1" max="65535"></div></div>',
      '<div class="form-group"><label class="form-label">Username</label><input type="text" name="username" class="form-input" required placeholder="root" value="' + UI.escAttr(s ? s.username : '') + '"></div>',
      '<div class="form-group"><label class="form-label">Password <span class="text-muted">(optional, stored locally)</span></label><input type="password" name="password" class="form-input" placeholder="SSH password" value="' + UI.escAttr(s && s.password ? s.password : '') + '" autocomplete="off"></div>',
      '<div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" placeholder="Optional notes...">' + UI.escHtml(s ? s.notes || '' : '') + '</textarea></div>',
      '<div class="form-group"><label class="form-label">Last Reboot <span class="text-muted">(auto-detected via dashboard)</span></label><input type="text" name="lastReboot" class="form-input" placeholder="2025-01-15 08:30 or leave blank" value="' + UI.escAttr(s && s.lastReboot ? s.lastReboot : '') + '"></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary">' + (s ? 'Update' : 'Add') + ' Server</button></div>'
    );
    h.push('</form>');
    UI.showModal(title, h.join(''));

    document.getElementById('server-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      if (data.password === '') delete data.password;
      if (data.id) {
        Store.update('servers', data.id, data);
        UI.toast('Server updated');
      } else {
        Store.add('servers', data);
        UI.toast('Server added');
      }
      UI.hideModal();
      this.render();
    });
  },

  _del(id) {
    if (this._sessions && this._sessions[id]) {
      this._disconnect(id);
    }
    UI.showConfirm('Delete server "' + (Store.getById('servers', id) || {}).name + '"? This cannot be undone.', () => {
      Store.delete('servers', id);
      UI.toast('Server deleted');
      this.render();
    });
  }
};
