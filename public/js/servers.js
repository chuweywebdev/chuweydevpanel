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
    let minimized = false;
    let term = null;
    let fitAddon = null;
    let ro = null;

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
      '<button class="btn btn-secondary btn-sm" id="term-min-btn" title="Minimize"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>',
      '<button class="btn btn-secondary btn-sm" id="term-close-btn">Disconnect</button>',
      '</div>',
      '</div>',
      '<div id="term-output" class="terminal-output"></div>',
      '<div class="terminal-resize-handle" id="term-resize-handle"></div>',
      '</div>'
    ];

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (ws) { try { ws.close(); } catch {} }
      if (ro) ro.disconnect();
      if (term) { try { term.dispose(); } catch {} }
      hideFloatingWidget();
      this._disconnect(server.id);
    };

    UI.showModal('SSH Terminal — ' + server.name, h.join(''), cleanup);
    UI._modalPreventClose = true;

    const termContainer = document.getElementById('term-output');
    const closeBtn = document.getElementById('term-close-btn');
    const minBtn = document.getElementById('term-min-btn');
    const resizeHandle = document.getElementById('term-resize-handle');
    const statusDot = document.getElementById('term-status');

    /* ── xterm.js setup ── */

    fitAddon = new FitAddon();
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'Consolas', 'Lucida Console', monospace",
      fontSize: 13,
      lineHeight: 1.1,
      scrollback: 2000,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#00ff00',
        cursorAccent: '#000000',
        selectionBackground: '#555555',
        selectionInactiveBackground: '#333333'
      },
      allowTransparency: false
    });

    term.loadAddon(fitAddon);
    term.open(termContainer);
    fitAddon.fit();

    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    /* ── Resize: container → fitAddon → onResize → server ── */

    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    ro.observe(termContainer);

    /* ── WebSocket connection ── */

    let reconnectAttempt = 0;
    const maxReconnectDelay = 30000;
    const initWs = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host + '/ws/terminal?sessionId=' + sessionId);

      ws.onopen = () => {
        reconnectAttempt = 0;
        term.reset();
        statusDot.className = 'status-dot connected';
        try { fitAddon.fit(); } catch {}
        term.focus();
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onerror = () => {
        if (closed) return;
        term.writeln('\r\n\x1b[31mWebSocket error\x1b[0m');
        statusDot.className = 'status-dot error';
      };

      ws.onclose = (evt) => {
        if (closed) return;
        const reason = evt.reason ? ' (' + evt.reason + ')' : '';
        term.writeln('\r\n\x1b[33mConnection closed (code ' + evt.code + ')' + reason + '\x1b[0m');
        statusDot.className = 'status-dot';
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), maxReconnectDelay);
        reconnectAttempt++;
        setTimeout(initWs, delay);
      };
    };

    initWs();

    /* ── Paste support ── */

    termContainer.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    });

    termContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (text && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: text }));
        }
      }).catch(() => {});
    });

    /* ── Close button ── */

    closeBtn.addEventListener('click', () => {
      UI._modalPreventClose = false;
      UI.hideModal();
    });

    /* ── Minimize / Restore ── */

    const floatEl = document.getElementById('terminal-floating');
    const floatName = document.getElementById('tf-name');
    const floatStatus = document.getElementById('tf-status');
    const floatClose = document.getElementById('tf-close');
    const modalEl = document.getElementById('modal');
    const modalCloseBtn = document.getElementById('modal-close');

    const showFloatingWidget = () => {
      floatName.textContent = server.name;
      floatStatus.className = 'status-dot' + (ws && ws.readyState === WebSocket.OPEN ? ' connected' : '');
      floatEl.style.display = 'flex';
    };

    const hideFloatingWidget = () => {
      floatEl.style.display = 'none';
    };

    const minimizeTerminal = () => {
      if (closed || minimized) return;
      minimized = true;
      modalEl.classList.remove('show');
      document.body.style.overflow = '';
      showFloatingWidget();
    };

    const restoreTerminal = () => {
      if (closed || !minimized) return;
      minimized = false;
      hideFloatingWidget();
      modalEl.classList.add('show');
      document.body.style.overflow = 'hidden';
      try { fitAddon.fit(); } catch {}
      term.focus();
    };

    /* Override modal-close X: minimize instead of close when connected */
    const newCloseBtn = modalCloseBtn.cloneNode(true);
    modalCloseBtn.parentNode.replaceChild(newCloseBtn, modalCloseBtn);
    newCloseBtn.addEventListener('click', (e) => {
      if (closed) { UI._modalPreventClose = false; UI.hideModal(); return; }
      minimizeTerminal();
    });

    /* Override backdrop click to minimize */
    modalEl.addEventListener('click', (e) => {
      if (e.target !== modalEl || closed) return;
      minimizeTerminal();
    });

    /* Minimize button in toolbar */
    minBtn.addEventListener('click', () => {
      minimizeTerminal();
    });

    /* Floating widget: click body to restore */
    floatEl.addEventListener('click', (e) => {
      if (e.target === floatClose || floatClose.contains(e.target)) return;
      restoreTerminal();
    });

    /* Floating widget X: disconnect */
    floatClose.addEventListener('click', () => {
      if (closed) return;
      hideFloatingWidget();
      UI._modalPreventClose = false;
      UI.hideModal();
    });

    /* ── Resize handle ── */

    let resizeStart = 0;
    let resizeHeight = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizeStart = e.clientY;
      resizeHeight = termContainer.offsetHeight;
      document.body.classList.add('resizing-terminal');

      const onMove = (ev) => {
        const delta = ev.clientY - resizeStart;
        const newH = Math.max(150, resizeHeight + delta);
        termContainer.style.height = newH + 'px';
        try { fitAddon.fit(); } catch {}
      };
      const onUp = () => {
        document.body.classList.remove('resizing-terminal');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
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
      '<div class="form-group">',
      '<label class="form-label">Connection Test</label>',
      '<div class="test-connection-row">',
      '<button type="button" class="btn btn-secondary" id="test-conn-btn">Test Connection</button>',
      '<span id="test-conn-status"></span>',
      '</div>',
      '</div>',
      '<div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" placeholder="Optional notes...">' + UI.escHtml(s ? s.notes || '' : '') + '</textarea></div>',
      '<div class="form-group"><label class="form-label">Last Reboot <span class="text-muted">(auto-detected via dashboard)</span></label><input type="text" name="lastReboot" class="form-input" placeholder="2025-01-15 08:30 or leave blank" value="' + UI.escAttr(s && s.lastReboot ? s.lastReboot : '') + '"></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary" id="save-server-btn" disabled>' + (s ? 'Update' : 'Add') + ' Server</button></div>'
    );
    h.push('</form>');
    UI.showModal(title, h.join(''));

    let connectionVerified = false;

    document.getElementById('test-conn-btn').addEventListener('click', () => {
      const form = document.getElementById('server-form');
      const ip = form.querySelector('[name="ip"]').value.trim();
      const port = form.querySelector('[name="port"]').value.trim() || '22';
      const statusEl = document.getElementById('test-conn-status');
      const btn = document.getElementById('test-conn-btn');
      const saveBtn = document.getElementById('save-server-btn');

      if (!ip) { statusEl.className = 'test-status fail'; statusEl.textContent = 'Enter an IP address first'; return; }

      statusEl.className = 'test-status testing';
      statusEl.textContent = 'Testing...';
      btn.disabled = true;
      saveBtn.disabled = true;
      connectionVerified = false;

      const username = form.querySelector('[name="username"]').value.trim();
      const password = form.querySelector('[name="password"]').value;

      if (!username) { statusEl.className = 'test-status fail'; statusEl.textContent = 'Enter a username first'; btn.disabled = false; return; }

      fetch('/api/ssh/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: ip, port: parseInt(port, 10), username, password })
      })
      .then(r => r.json())
      .then(data => {
        btn.disabled = false;
        if (data.success) {
          statusEl.className = 'test-status pass';
          statusEl.textContent = 'SSH authentication successful';
          connectionVerified = true;
          saveBtn.disabled = false;
        } else {
          statusEl.className = 'test-status fail';
          statusEl.textContent = data.error || 'Connection failed';
          connectionVerified = false;
        }
      })
      .catch(err => {
        btn.disabled = false;
        statusEl.className = 'test-status fail';
        statusEl.textContent = 'Error: ' + err.message;
        connectionVerified = false;
      });
    });

    document.getElementById('server-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!connectionVerified) {
        UI.toast('Please test the connection before saving');
        return;
      }
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
