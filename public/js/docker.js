const Docker = {
  _sessions: {},
  _runningCmds: {},
  _connecting: {},
  _fetching: {},
  _pagination: {},
  _activeTabs: {},
  _PAGE_SIZE: 20,

  _shellEscape(str) {
    if (!str) return '';
    return "'" + String(str).replace(/'/g, "'\\''") + "'";
  },

  render() {
    const servers = Store.getAll('servers');
    if (!servers.length) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><p>No servers configured yet.</p><button class="btn btn-primary" onclick="App.navigate(\'servers\')">Add Servers</button></div>';
      return;
    }

    const h = ['<div class="docker-page"><div class="page-header"><h2>Docker Management</h2><p class="text-muted">Connect to a server to manage containers, images, volumes, and networks.</p></div><div class="card-list">'];
    for (const s of servers) {
      const session = this._sessions[s.id];
      const connected = session && session.connected;
      const hasData = connected && session.data;
      h.push(
        '<div class="card" data-server-id="' + s.id + '">',
        '<div class="card-header">',
        '<div class="card-title-row">',
        '<span class="card-title">' + UI.escHtml(s.name) + '</span>',
        '<div class="card-actions">',
        connected
          ? '<button class="btn btn-secondary btn-sm docker-disc-btn" data-id="' + s.id + '">Disconnect</button>'
          : '<button class="btn btn-primary btn-sm docker-conn-btn" data-id="' + s.id + '">Connect</button>',
        '</div></div></div>',
        '<div class="card-body">',
        '<div class="info-grid">',
        '<div class="info-item"><span class="info-label">IP Address</span><span class="info-value mono">' + UI.escHtml(s.ip) + '</span></div>',
        '<div class="info-item"><span class="info-label">Username</span><span class="info-value">' + UI.escHtml(s.username) + '</span></div>',
        '</div>',
        hasData ? this._buildDashboard(s.id, session) : '',
        '</div></div>'
      );
    }
    h.push('</div></div>');
    document.getElementById('content').innerHTML = h.join('');
    this._wireEvents();
  },

  _wireEvents() {
    if (this._wireAbort) this._wireAbort.abort();
    this._wireAbort = new AbortController();
    const signal = this._wireAbort.signal;

    document.querySelectorAll('.docker-conn-btn').forEach(btn => {
      btn.addEventListener('click', () => this._connect(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-disc-btn').forEach(btn => {
      btn.addEventListener('click', () => this._disconnect(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const tab = btn.dataset.dtab;
        this._activeTabs[id] = tab;
        const container = btn.closest('.card');
        container.querySelectorAll('.docker-tab-btn').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        container.querySelectorAll('.docker-tab-panel').forEach(p => p.style.display = 'none');
        const panel = container.querySelector('.docker-tab-panel[data-dtab="' + tab + '"]');
        if (panel) panel.style.display = '';
      }, { signal });
    });
    document.querySelectorAll('.docker-refresh-btn').forEach(btn => {
      btn.addEventListener('click', () => this._fetchDocker(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-search-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const id = inp.dataset.id;
        const q = inp.value.trim().toLowerCase();
        const card = inp.closest('.card');
        if (!card) return;
        card.querySelectorAll('.docker-table tbody tr').forEach(tr => {
          const text = tr.textContent.toLowerCase();
          tr.style.display = !q || text.includes(q) ? '' : 'none';
        });
      }, { signal });
    });

    document.querySelectorAll('.docker-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const id = btn.dataset.id;
        const tab = btn.dataset.dtab;
        const page = parseInt(btn.dataset.page, 10);
        if (page >= 0) {
          this._setPage(id, tab, page);
          this._rerenderCard(id);
        }
      }, { signal });
    });

    document.querySelectorAll('[data-docker-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        const action = btn.dataset.dockerAction;
        const target = btn.dataset.dockerTarget;
        const name = btn.dataset.dockerName || '';
        if (action === 'stop') this._stopContainer(id, target, name);
        else if (action === 'start') this._startContainer(id, target, name);
        else if (action === 'restart') this._restartContainer(id, target, name);
        else if (action === 'delete-container') this._deleteContainer(id, target, name);
        else if (action === 'logs') this._viewLogs(id, target, name);
        else if (action === 'stats') this._viewStats(id, target, name);
        else if (action === 'exec') this._openContainerShell(id, target, name);
        else if (action === 'inspect') this._viewInspect(id, target, name);
        else if (action === 'delete-image') this._deleteImage(id, target, name);
        else if (action === 'run') this._showRunContainer(id, target);
        else if (action === 'delete-volume') this._deleteVolume(id, target);
      }, { signal });
    });

    document.querySelectorAll('.docker-pull-btn').forEach(btn => {
      btn.addEventListener('click', () => this._showPullImage(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-prune-volumes-btn').forEach(btn => {
      btn.addEventListener('click', () => this._pruneVolumes(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-prune-networks-btn').forEach(btn => {
      btn.addEventListener('click', () => this._pruneNetworks(btn.dataset.id), { signal });
    });
    document.querySelectorAll('.docker-prune-images-btn').forEach(btn => {
      btn.addEventListener('click', () => this._pruneImages(btn.dataset.id), { signal });
    });
  },

  _getSessionId(id) {
    const session = this._sessions[id];
    return session ? session.sessionId : null;
  },

  _execAction(id, cmd, label) {
    const sessionId = this._getSessionId(id);
    if (!sessionId) { UI.toast('Not connected', 'error'); return Promise.resolve({ ok: false, error: 'Not connected' }); }
    const key = id + ':' + cmd;
    if (this._runningCmds[key]) return Promise.resolve({ ok: false, error: 'Command already running' });
    this._runningCmds[key] = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    return fetch('/api/ssh/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, command: cmd }),
      signal: controller.signal
    })
      .then(r => r.json().catch(() => ({ ok: false, error: 'Invalid response' })))
      .catch(err => {
        if (err.name === 'AbortError') return { ok: false, error: 'Command timed out' };
        return { ok: false, error: err.message || 'Request failed' };
      })
      .finally(() => { clearTimeout(timer); delete this._runningCmds[key]; });
  },

  _refreshCard(id) {
    const session = this._sessions[id];
    if (session && session.connected) this._fetchDocker(id);
  },

  _rerenderCard(id) {
    const session = this._sessions[id];
    if (!session || !session.connected) return;
    const card = document.querySelector('.card[data-server-id="' + id + '"]');
    if (!card) return;
    const dashboard = card.querySelector('.docker-dashboard');
    if (!dashboard) return;
    dashboard.outerHTML = this._buildDashboard(id, session);
    this._wireEvents();
  },

  /* ─── Connect / Disconnect ─────────────────────────────────────── */

  _connect(id) {
    if (this._connecting[id]) return;
    this._connecting[id] = true;

    const s = Store.getById('servers', id);
    if (!s) { delete this._connecting[id]; return; }

    if (s.password || s.privateKey) {
      this._doConnect(id, s.password, s.privateKey);
      return;
    }

    const h = [
      '<form id="docker-connect-form">',
      '<div class="form-group"><label class="form-label">Server</label><div class="form-text" style="font-weight:600">' + UI.escHtml(s.name) + ' (' + UI.escHtml(s.username) + '@' + UI.escHtml(s.ip) + ')</div></div>',
      '<div class="form-group"><label class="form-label">Password</label><input type="password" name="password" class="form-input" placeholder="SSH password" autocomplete="off"></div>',
      '<div class="form-group"><label class="form-label">Private Key <span class="text-muted">(optional)</span></label><textarea name="privateKey" class="form-input form-textarea" style="min-height:80px;font-family:var(--font-mono);font-size:0.8rem" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."></textarea></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary" id="docker-conn-submit">Connect</button></div>',
      '</form>'
    ];

    UI.showModal('Connect to Server — Docker', h.join(''));

    document.getElementById('docker-connect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      const btn = document.getElementById('docker-conn-submit');
      btn.textContent = 'Connecting...';
      btn.disabled = true;

      fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: s.ip, port: s.port || '22', username: s.username, password: data.password || undefined, privateKey: data.privateKey || undefined })
      })
        .then(r => r.json())
        .then(result => {
          if (result.error) {
            UI.toast(result.error, 'error');
            btn.textContent = 'Connect';
            btn.disabled = false;
            delete this._connecting[id];
            return;
          }
          UI.hideModal();
          this._sessions[id] = { sessionId: result.sessionId, connected: true, data: null, state: 'loading' };
          delete this._connecting[id];
          this._fetchDocker(id);
          UI.toast('Connected to ' + s.name, 'success');
        })
        .catch(err => {
          UI.toast('Connection failed: ' + err.message, 'error');
          btn.textContent = 'Connect';
          btn.disabled = false;
          delete this._connecting[id];
        });
    });
  },

  _doConnect(id, password, privateKey) {
    const s = Store.getById('servers', id);
    if (!s) { delete this._connecting[id]; return; }

    fetch('/api/ssh/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: s.ip, port: s.port || '22', username: s.username, password: password || undefined, privateKey: privateKey || undefined })
    })
      .then(r => r.json())
      .then(result => {
        if (result.error) { UI.toast(result.error, 'error'); delete this._connecting[id]; return; }
        this._sessions[id] = { sessionId: result.sessionId, connected: true, data: null, state: 'loading' };
        delete this._connecting[id];
        this._fetchDocker(id);
        UI.toast('Connected to ' + s.name, 'success');
      })
      .catch(err => { UI.toast('Connection failed: ' + err.message, 'error'); delete this._connecting[id]; });
  },

  _disconnect(id) {
    const session = this._sessions[id];
    if (!session) return;

    delete this._connecting[id];
    delete this._fetching[id];

    fetch('/api/ssh/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId })
    }).catch(() => {});

    delete this._sessions[id];
    this.render();
    UI.toast('Disconnected');
  },

  /* ─── Fetch Docker data ────────────────────────────────────────── */

  _fetchDocker(id) {
    if (this._fetching[id]) return;
    this._fetching[id] = true;

    const session = this._sessions[id];
    if (!session) { delete this._fetching[id]; return; }

    const container = document.querySelector('.card[data-server-id="' + id + '"]');
    const dashboard = container ? container.querySelector('.docker-dashboard') : null;
    if (dashboard) dashboard.innerHTML = '<div class="skeleton-container"><div class="skeleton skeleton-docker-toolbar"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div></div>';

    const cmds = {
      containers: 'docker ps -a --no-trunc --format \'{{json .}}\'',
      images: 'docker images --no-trunc --format \'{{json .}}\'',
      volumes: 'docker volume ls --format \'{{json .}}\'',
      networks: 'docker network ls --format \'{{json .}}\'',
      info: 'docker info --format \'{{json .}}\''
    };

    session.data = {};
    let pending = Object.keys(cmds).length;
    let dockerOk = false;
    let anyNotFound = false;

    const done = () => {
      if (--pending > 0) return;
      delete this._fetching[id];
      if (dockerOk) session.state = 'loaded';
      else if (anyNotFound) session.state = 'no-docker';
      else session.state = 'error';
      this.render();
    };

    for (const [key, cmd] of Object.entries(cmds)) {
      fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, command: cmd })
      })
        .then(r => r.json())
        .then(data => {
          if (!data.ok && data.error === 'Session not found') {
            delete this._sessions[id];
            while (pending > 0) { pending = 0; }
            delete this._fetching[id];
            this.render();
            UI.toast('Session expired — reconnect to continue', 'error');
            return;
          }
          const out = (data.stdout || '').trim();
          const err = (data.stderr || '').trim();
          if (data.ok) {
            dockerOk = true;
            session.data[key] = out;
          } else {
            session.data[key] = '';
            if (err.includes('not found') || err.includes('Cannot connect') || err.includes('permission denied') || err.includes('docker daemon')) {
              anyNotFound = true;
            }
          }
          done();
        })
        .catch(() => { session.data[key] = ''; done(); });
    }
  },

  /* ─── Build Dashboard ──────────────────────────────────────────── */

  _buildDashboard(id, session) {
    const state = session.state;
    const data = session.data || {};

    if (state === 'loading' || !state) {
      return '<div class="docker-dashboard"><div class="docker-toolbar"><span class="docker-tabs">Loading...</span><button class="btn btn-secondary btn-sm docker-refresh-btn" data-id="' + id + '">Refresh</button></div><div class="docker-content"><div class="skeleton-container" style="padding:0;margin-top:8px"><div class="skeleton skeleton-docker-toolbar"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div></div></div></div>';
    }
    if (state === 'no-docker') {
      return '<div class="docker-dashboard"><div class="docker-empty">Docker is not available on this server</div></div>';
    }
    if (state === 'error' || !this._hasAnyData(data)) {
      return '<div class="docker-dashboard"><div class="docker-empty">Failed to fetch Docker data</div><div style="text-align:center;margin-top:8px"><button class="btn btn-secondary btn-sm docker-refresh-btn" data-id="' + id + '">Retry</button></div></div>';
    }

    const tabs = ['containers', 'images', 'volumes', 'networks', 'info'];
    const activeTab = this._activeTabs[id] || 'containers';

    let h = '<div class="docker-dashboard">';
    h += '<div class="docker-toolbar"><span class="docker-tabs">';
    tabs.forEach(t => {
      h += '<button class="docker-tab' + (t === activeTab ? ' active' : '') + ' docker-tab-btn" data-id="' + id + '" data-dtab="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
    });
    h += '</span><span class="docker-toolbar-right"><input type="text" class="docker-search-input" data-id="' + id + '" placeholder="Filter..." title="Filter by name, image, ID, status"><button class="btn btn-secondary btn-sm docker-refresh-btn" data-id="' + id + '">Refresh</button></span></div>';
    h += '<div class="docker-content">';
    tabs.forEach(t => {
      h += '<div class="docker-tab-panel" data-dtab="' + t + '" style="' + (t !== activeTab ? 'display:none' : '') + '">';
      h += this['_render' + t.charAt(0).toUpperCase() + t.slice(1)](id, data);
      h += '</div>';
    });
    h += '</div></div>';

    return h;
  },

  _hasAnyData(data) {
    for (const k of Object.keys(data)) {
      if (data[k]) return true;
    }
    return false;
  },

  _parseJsonLines(text) {
    if (!text) return [];
    return text.split('\n').filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  },

  _noDocker() {
    return '<div class="docker-empty">Docker not available on this server</div>';
  },

  _getPage(serverId, tab) {
    if (!this._pagination[serverId]) this._pagination[serverId] = {};
    if (this._pagination[serverId][tab] === undefined) this._pagination[serverId][tab] = 0;
    return this._pagination[serverId][tab];
  },

  _setPage(serverId, tab, page) {
    if (!this._pagination[serverId]) this._pagination[serverId] = {};
    this._pagination[serverId][tab] = page;
  },

  _paginateItems(items, serverId, tab) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / this._PAGE_SIZE));
    let page = this._getPage(serverId, tab);
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    this._setPage(serverId, tab, page);
    const start = page * this._PAGE_SIZE;
    const end = Math.min(start + this._PAGE_SIZE, total);
    return { items: items.slice(start, end), page, totalPages, total, start: start + 1, end };
  },

  _renderPagination(serverId, tab, pg) {
    if (pg.totalPages <= 1) return '';
    return '<div class="docker-pagination">' +
      '<span class="docker-pagination-info">' + pg.start + '\u2013' + pg.end + ' of ' + pg.total + '</span>' +
      '<div class="docker-pagination-controls">' +
      '<button class="docker-page-btn" data-id="' + serverId + '" data-dtab="' + tab + '" data-page="' + (pg.page - 1) + '"' + (pg.page <= 0 ? ' disabled' : '') + '>\u2039 Prev</button>' +
      '<span class="docker-page-indicator">Page ' + (pg.page + 1) + ' of ' + pg.totalPages + '</span>' +
      '<button class="docker-page-btn" data-id="' + serverId + '" data-dtab="' + tab + '" data-page="' + (pg.page + 1) + '"' + (pg.page >= pg.totalPages - 1 ? ' disabled' : '') + '>Next \u203a</button>' +
      '</div></div>';
  },

  _formatBytes(n) {
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + u[i];
  },

  _statusBadge(state) {
    const s = (state || '').toLowerCase();
    const cls = s === 'running' ? 'running' : s === 'exited' ? 'exited' : s === 'paused' ? 'paused' : s === 'created' ? 'created' : s === 'restarting' ? 'restarting' : '';
    return '<span class="docker-status ' + cls + '">' + UI.escHtml(state || 'unknown') + '</span>';
  },

  _formatPorts(ports) {
    if (!ports || ports === '-') return '<span class="text-muted">-</span>';
    const parts = ports.split(', ');
    return parts.map(p => {
      const m = p.match(/(\d+\.\d+\.\d+\.\d+|:::|0\.0\.0\.0|\d+):(\d+)->(\d+)\/(\w+)/);
      if (m) {
        const ip = (m[1] === '0.0.0.0' || m[1] === ':::') ? '' : m[1] + ':';
        return '<span class="docker-port">' + UI.escHtml(ip + m[2] + '→' + m[3] + '/' + m[4]) + '</span>';
      }
      const m2 = p.match(/(\d+)\/(\w+)/);
      if (m2) return '<span class="docker-port">' + UI.escHtml(p) + '</span>';
      return '<span class="docker-port">' + UI.escHtml(p) + '</span>';
    }).join('');
  },

  /* ═══════════════════════════════════════════════════════════════════
     Container Actions
     ═══════════════════════════════════════════════════════════════════ */

  _stopContainer(id, containerId, name) {
    UI.showConfirm('Stop container "' + name + '"?', () => {
      const label = 'Stopping ' + name;
      UI.toast(label + '...', 'info', 5000);
      this._execAction(id, 'docker stop ' + containerId, label).then(r => {
        if (r && r.ok) { UI.toast('Container "' + name + '" stopped', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to stop container: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _startContainer(id, containerId, name) {
    const label = 'Starting ' + name;
    UI.toast(label + '...', 'info', 5000);
    this._execAction(id, 'docker start ' + containerId, label).then(r => {
      if (r && r.ok) { UI.toast('Container "' + name + '" started', 'success'); this._refreshCard(id); }
      else UI.toast('Failed to start container: ' + (r ? r.stderr : 'error'), 'error');
    });
  },

  _restartContainer(id, containerId, name) {
    UI.showConfirm('Restart container "' + name + '"?', () => {
      const label = 'Restarting ' + name;
      UI.toast(label + '...', 'info', 5000);
      this._execAction(id, 'docker restart ' + containerId, label).then(r => {
        if (r && r.ok) { UI.toast('Container "' + name + '" restarted', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to restart container: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _deleteContainer(id, containerId, name) {
    UI.showConfirm('Permanently delete container "' + name + '"?', () => {
      const label = 'Deleting ' + name;
      UI.toast(label + '...', 'info', 5000);
      this._execAction(id, 'docker rm -f ' + containerId, label).then(r => {
        if (r && r.ok) { UI.toast('Container "' + name + '" deleted', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to delete container: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _viewLogs(id, containerId, name) {
    const sessionId = this._getSessionId(id);
    if (!sessionId) { UI.toast('Not connected', 'error'); return; }

    UI.showModal('Container Logs — ' + UI.escHtml(name),
      '<div class="docker-logs" id="docker-log-content"><div class="docker-loading">Fetching logs...</div></div>' +
      '<div class="form-actions" style="margin-top:12px">' +
      '<button class="btn btn-secondary" onclick="UI.hideModal()">Close</button>' +
      '<button class="btn btn-primary" id="docker-log-refresh">Refresh</button></div>'
    );

    const loadLogs = () => {
      const el = document.getElementById('docker-log-content');
      if (el) el.innerHTML = '<div class="docker-loading">Fetching logs...</div>';
      this._execAction(id, 'docker logs --tail 200 ' + containerId, 'Fetching logs').then(r => {
        const el2 = document.getElementById('docker-log-content');
        if (!el2) return;
        if (r && r.ok) {
          const out = (r.stdout || '').trim();
          const err = (r.stderr || '').trim();
          let logHtml = '';
          if (out) logHtml += out.split('\n').map(l => '<span class="log-line">' + UI.escHtml(l) + '</span>').join('');
          if (err) logHtml += '<div style="color:var(--warning);margin-top:8px">stderr:</div>' + err.split('\n').map(l => '<span class="log-line" style="color:var(--warning)">' + UI.escHtml(l) + '</span>').join('');
          el2.innerHTML = logHtml || '<span class="text-muted">No logs</span>';
          el2.scrollTop = el2.scrollHeight;
        } else {
          el2.innerHTML = '<span style="color:var(--danger)">Failed to fetch logs: ' + UI.escHtml(r ? r.stderr : 'error') + '</span>';
        }
      });
    };

    loadLogs();
    const refreshBtn = document.getElementById('docker-log-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadLogs);
  },

  /* ═══════════════════════════════════════════════════════════════════
     Image Actions
     ═══════════════════════════════════════════════════════════════════ */

  _showPullImage(id) {
    const h = [
      '<form id="docker-pull-form" class="docker-pull-form">',
      '<div class="form-group"><label class="form-label">Image Name</label>',
      '<input type="text" name="image" class="form-input" placeholder="e.g. nginx:latest" required autocomplete="off" autofocus>',
      '<div class="form-hint">Enter image name with optional tag (default: latest)</div></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary" id="docker-pull-submit">Pull Image</button></div>',
      '</form>'
    ];
    UI.showModal('Pull Docker Image', h.join(''));

    document.getElementById('docker-pull-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const image = fd.get('image').trim();
      if (!image) return;
      const btn = document.getElementById('docker-pull-submit');
      btn.textContent = 'Pulling...';
      btn.disabled = true;

      this._execAction(id, 'docker pull ' + this._shellEscape(image), 'Pulling ' + image).then(r => {
        btn.textContent = 'Pull Image';
        btn.disabled = false;
        if (r && r.ok) {
          UI.hideModal();
          UI.toast('Image "' + image + '" pulled successfully', 'success');
          this._refreshCard(id);
        } else {
          UI.toast('Failed to pull image: ' + (r ? r.stderr.replace(/\n/g, ' ') : 'error'), 'error');
        }
      });
    });
  },

  _deleteImage(id, imageId, repo) {
    UI.showConfirm('Delete image "' + repo + '"?', () => {
      const label = 'Deleting ' + repo;
      UI.toast(label + '...', 'info', 5000);
      this._execAction(id, 'docker rmi -f ' + imageId, label).then(r => {
        if (r && r.ok) { UI.toast('Image "' + repo + '" deleted', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to delete image: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _pruneImages(id) {
    UI.showConfirm('Remove all unused images? This cannot be undone.', () => {
      this._execAction(id, 'docker image prune -af', 'Pruning images').then(r => {
        if (r && r.ok) {
          const out = (r.stdout || '').trim();
          UI.toast('Images pruned' + (out ? ' — ' + out.split('\n').pop() : ''), 'success');
          this._refreshCard(id);
        } else UI.toast('Failed to prune images: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _showRunContainer(id, imageName) {
    const h = [
      '<form id="docker-run-form" class="docker-pull-form">',
      '<div class="form-group"><label class="form-label">Image</label>',
      '<input type="text" name="image" class="form-input" value="' + UI.escAttr(imageName || '') + '" required autocomplete="off">',
      '<div class="form-hint">Docker image to create the container from</div></div>',
      '<div class="form-group"><label class="form-label">Container Name <span class="text-muted">(optional)</span></label>',
      '<input type="text" name="name" class="form-input" placeholder="my-container" autocomplete="off"></div>',
      '<div class="form-group"><label class="form-label">Port Mapping <span class="text-muted">(optional)</span></label>',
      '<input type="text" name="ports" class="form-input" placeholder="e.g. 8080:80" autocomplete="off">',
      '<div class="form-hint">Format: hostPort:containerPort</div></div>',
      '<div class="form-group"><label class="form-label">Extra Options <span class="text-muted">(optional)</span></label>',
      '<input type="text" name="opts" class="form-input" placeholder="e.g. -d --restart=always" autocomplete="off">',
      '<div class="form-hint">Use -d to run in background</div></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary" id="docker-run-submit">Create &amp; Run</button></div>',
      '</form>'
    ];
    UI.showModal('Create & Run Container', h.join(''));

    document.getElementById('docker-run-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const image = fd.get('image').trim();
      const name = fd.get('name').trim();
      const ports = fd.get('ports').trim();
      const opts = fd.get('opts').trim();
      if (!image) return;

      let cmd = 'docker run';
      if (name) cmd += ' --name ' + this._shellEscape(name);
      if (ports) cmd += ' -p ' + this._shellEscape(ports);
      if (opts) cmd += ' ' + opts.split(/\s+/).filter(Boolean).map(s => this._shellEscape(s)).join(' ');
      if (!opts.includes('-d') && !opts.includes('--detach') && !opts.includes('-it') && !opts.includes('--interactive')) cmd += ' -d';
      cmd += ' ' + this._shellEscape(image);

      const btn = document.getElementById('docker-run-submit');
      btn.textContent = 'Creating...';
      btn.disabled = true;

      this._execAction(id, cmd, 'Creating container').then(r => {
        btn.textContent = 'Create & Run';
        btn.disabled = false;
        if (r && r.ok) {
          UI.hideModal();
          const out = (r.stdout || '').trim();
          UI.toast('Container created' + (out ? ': ' + out.substring(0, 60) : ''), 'success');
          this._refreshCard(id);
        } else {
          UI.toast('Failed: ' + (r ? r.stderr.replace(/\n/g, ' ') : 'error'), 'error');
        }
      });
    });
  },

  /* ═══════════════════════════════════════════════════════════════════
     Volume Actions
     ═══════════════════════════════════════════════════════════════════ */

  _deleteVolume(id, name) {
    UI.showConfirm('Delete volume "' + name + '"? This cannot be undone.', () => {
      this._execAction(id, 'docker volume rm ' + this._shellEscape(name), 'Deleting volume').then(r => {
        if (r && r.ok) { UI.toast('Volume "' + name + '" deleted', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to delete volume: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  _pruneVolumes(id) {
    UI.showConfirm('Remove all unused volumes? This cannot be undone.', () => {
      this._execAction(id, 'docker volume prune -af', 'Pruning volumes').then(r => {
        if (r && r.ok) {
          const out = (r.stdout || '').trim();
          const space = out.match(/Total reclaimed space: (.+)/);
          UI.toast('Volumes pruned' + (space ? ' (' + space[1] + ')' : ''), 'success');
          this._refreshCard(id);
        } else UI.toast('Failed to prune volumes: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  /* ═══════════════════════════════════════════════════════════════════
     Network Actions
     ═══════════════════════════════════════════════════════════════════ */

  _pruneNetworks(id) {
    UI.showConfirm('Remove all unused networks?', () => {
      this._execAction(id, 'docker network prune -f', 'Pruning networks').then(r => {
        if (r && r.ok) { UI.toast('Networks pruned', 'success'); this._refreshCard(id); }
        else UI.toast('Failed to prune networks: ' + (r ? r.stderr : 'error'), 'error');
      });
    });
  },

  /* ═══════════════════════════════════════════════════════════════════
     Render Methods
     ═══════════════════════════════════════════════════════════════════ */

  _renderContainers(id, data) {
    if (!data.containers) return '<div class="docker-empty">Failed to fetch containers</div>';
    const all = this._parseJsonLines(data.containers);
    if (!all.length) return '<div class="docker-section"><h3>Containers</h3><div class="docker-empty">No containers</div></div>';

    const pg = this._paginateItems(all, id, 'containers');
    const running = pg.items.filter(c => c.State === 'running');
    const others = pg.items.filter(c => c.State !== 'running');

    let h = '<div class="docker-section"><h3>Containers <span class="docker-count">' + all.length + '</span></h3>';
    if (running.length) {
      h += '<div style="font-size:11px;color:var(--text-muted);margin:6px 0 4px">Running</div>';
      h += this._renderContainerTable(running, id);
    }
    if (others.length) {
      h += '<div style="font-size:11px;color:var(--text-muted);margin:10px 0 4px">Stopped</div>';
      h += this._renderContainerTable(others, id);
    }
    if (!running.length && !others.length) h += '<div class="docker-empty">No containers on this page</div>';
    h += '</div>';
    h += this._renderPagination(id, 'containers', pg);
    return h;
  },

  _renderContainerTable(containers, id) {
    const h = ['<table class="docker-table"><thead><tr>',
      '<th>ID</th><th>Image</th><th>Created</th><th>Status</th><th>Ports</th><th>Name</th><th>Actions</th>',
      '</tr></thead><tbody>'];

    containers.forEach(c => {
      const cid = (c.ID || '').substring(0, 12);
      const state = c.State || '';
      const isRunning = state === 'running';
      const dispName = (c.Names || '').replace(/^\//, '') || '-';
      h.push('<tr>');
      h.push('<td style="font-size:10px">' + UI.escHtml(cid) + '</td>');
      h.push('<td style="max-width:200px">' + UI.escHtml(c.Image || '-') + '</td>');
      h.push('<td>' + UI.escHtml(this._fmtTime(c.CreatedAt || '-')) + '</td>');
      h.push('<td>' + this._statusBadge(state) + '</td>');
      h.push('<td style="max-width:180px">' + this._formatPorts(c.Ports) + '</td>');
      h.push('<td style="max-width:180px">' + UI.escHtml(dispName) + '</td>');
      h.push('<td><span class="docker-actions">');
      if (isRunning) {
        h.push('<button class="docker-action stop" data-docker-action="stop" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Stop</button>');
        h.push('<button class="docker-action restart" data-docker-action="restart" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Restart</button>');
        h.push('<button class="docker-action" data-docker-action="exec" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Exec</button>');
        h.push('<button class="docker-action" data-docker-action="stats" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Stats</button>');
      } else {
        h.push('<button class="docker-action start" data-docker-action="start" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Start</button>');
      }
      h.push('<button class="docker-action" data-docker-action="inspect" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Inspect</button>');
      h.push('<button class="docker-action logs" data-docker-action="logs" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Logs</button>');
      h.push('<button class="docker-action danger" data-docker-action="delete-container" data-id="' + id + '" data-docker-target="' + cid + '" data-docker-name="' + UI.escAttr(dispName) + '">Delete</button>');
      h.push('</span></td>');
      h.push('</tr>');
    });
    h.push('</tbody></table>');
    return h.join('');
  },

  _renderImages(id, data) {
    if (!data.images) return '<div class="docker-empty">Failed to fetch images</div>';
    const all = this._parseJsonLines(data.images);
    if (!all.length) return '<div class="docker-section"><h3>Images</h3><div class="docker-empty">No images</div></div>';
    const pg = this._paginateItems(all, id, 'images');
    const h = ['<div class="docker-section">',
      '<div class="docker-section-header"><h3>Images <span class="docker-count">' + all.length + '</span></h3>',
      '<span class="docker-tab-actions"><button class="btn btn-primary btn-sm docker-pull-btn" data-id="' + id + '">Pull Image</button><button class="btn btn-secondary btn-sm docker-prune-images-btn" data-id="' + id + '">Prune</button></span></div>',
      '<table class="docker-table"><thead><tr><th>Repository</th><th>Tag</th><th>Image ID</th><th>Created</th><th>Size</th><th>Actions</th></tr></thead><tbody>'];
    pg.items.forEach(i => {
      const iid = (i.ID || '').replace('sha256:', '').substring(0, 12);
      const repo = i.Repository || '<none>';
      h.push('<tr>');
      h.push('<td>' + UI.escHtml(repo) + '</td>');
      h.push('<td>' + UI.escHtml(i.Tag || '<none>') + '</td>');
      h.push('<td style="font-size:10px">' + UI.escHtml(iid) + '</td>');
      h.push('<td>' + UI.escHtml(this._fmtTime(i.CreatedAt || '-')) + '</td>');
      h.push('<td>' + UI.escHtml(i.Size || '-') + '</td>');
      h.push('<td><span class="docker-actions">');
      h.push('<button class="docker-action" data-docker-action="run" data-id="' + id + '" data-docker-target="' + UI.escAttr(repo + ':' + (i.Tag || 'latest')) + '">Run</button>');
      h.push('<button class="docker-action danger" data-docker-action="delete-image" data-id="' + id + '" data-docker-target="' + iid + '" data-docker-name="' + UI.escAttr(repo + ':' + (i.Tag || 'latest')) + '">Delete</button>');
      h.push('</span></td>');
      h.push('</tr>');
    });
    h.push('</tbody></table>');
    h.push(this._renderPagination(id, 'images', pg));
    h.push('</div>');
    return h.join('');
  },

  _renderVolumes(id, data) {
    if (!data.volumes) return '<div class="docker-empty">Failed to fetch volumes</div>';
    const all = this._parseJsonLines(data.volumes);
    if (!all.length) return '<div class="docker-section"><h3>Volumes</h3><div class="docker-empty">No volumes</div></div>';
    const pg = this._paginateItems(all, id, 'volumes');
    const h = ['<div class="docker-section">',
      '<div class="docker-section-header"><h3>Volumes <span class="docker-count">' + all.length + '</span></h3>',
      '<span class="docker-tab-actions"><button class="btn btn-secondary btn-sm docker-prune-volumes-btn" data-id="' + id + '">Prune</button></span></div>',
      '<table class="docker-table"><thead><tr><th>Name</th><th>Driver</th><th>Mount</th><th>Created</th><th>Actions</th></tr></thead><tbody>'];
    pg.items.forEach(v => {
      h.push('<tr>');
      h.push('<td>' + UI.escHtml(v.Name || '-') + '</td>');
      h.push('<td>' + UI.escHtml(v.Driver || '-') + '</td>');
      h.push('<td><code>' + UI.escHtml(v.Mountpoint || '-') + '</code></td>');
      h.push('<td>' + UI.escHtml(this._fmtTime(v.CreatedAt || '-')) + '</td>');
      h.push('<td><span class="docker-actions"><button class="docker-action danger" data-docker-action="delete-volume" data-id="' + id + '" data-docker-target="' + UI.escAttr(v.Name) + '">Delete</button></span></td>');
      h.push('</tr>');
    });
    h.push('</tbody></table>');
    h.push(this._renderPagination(id, 'volumes', pg));
    h.push('</div>');
    return h.join('');
  },

  _renderNetworks(id, data) {
    if (!data.networks) return '<div class="docker-empty">Failed to fetch networks</div>';
    const all = this._parseJsonLines(data.networks);
    if (!all.length) return '<div class="docker-section"><h3>Networks</h3><div class="docker-empty">No networks</div></div>';
    const pg = this._paginateItems(all, id, 'networks');
    const h = ['<div class="docker-section">',
      '<div class="docker-section-header"><h3>Networks <span class="docker-count">' + all.length + '</span></h3>',
      '<span class="docker-tab-actions"><button class="btn btn-secondary btn-sm docker-prune-networks-btn" data-id="' + id + '">Prune Unused</button></span></div>',
      '<table class="docker-table"><thead><tr><th>ID</th><th>Name</th><th>Driver</th><th>Scope</th></tr></thead><tbody>'];
    pg.items.forEach(n => {
      h.push('<tr>');
      h.push('<td style="font-size:10px">' + UI.escHtml((n.ID || '').substring(0, 12)) + '</td>');
      h.push('<td>' + UI.escHtml(n.Name || '-') + '</td>');
      h.push('<td>' + UI.escHtml(n.Driver || '-') + '</td>');
      h.push('<td>' + UI.escHtml(n.Scope || '-') + '</td>');
      h.push('</tr>');
    });
    h.push('</tbody></table>');
    h.push(this._renderPagination(id, 'networks', pg));
    h.push('</div>');
    return h.join('');
  },

  _renderInfo(id, data) {
    const all = this._parseJsonLines(data.info);
    if (!all || !all[0]) return this._noDocker();
    const pg = this._paginateItems(all, id, 'info');
    let h = '<div class="docker-section"><h3>System Info</h3>';
    pg.items.forEach(info => {
      h += '<table class="docker-info-table">';
      const rows = [
        ['Docker Version', info.ServerVersion],
        ['OS / Arch', (info.OperatingSystem || '') + ' / ' + (info.Architecture || '')],
        ['Kernel', info.KernelVersion],
        ['CPUs', info.NCPU],
        ['Total Memory', info.MemTotal ? this._formatBytes(info.MemTotal) : '-'],
        ['Storage Driver', info.Driver],
        ['Root Dir', info.DockerRootDir],
        ['Total Containers', info.Containers],
        ['Running', info.ContainersRunning],
        ['Paused', info.ContainersPaused],
        ['Stopped', info.ContainersStopped],
        ['Total Images', info.Images],
        ['Server ID', info.ID]
      ];
      rows.forEach(r => {
        h += '<tr><td class="info-label">' + UI.escHtml(r[0]) + '</td><td class="info-value">' + UI.escHtml(String(r[1] ?? '-')) + '</td></tr>';
      });
      h += '</table>';
    });
    h += '</div>';
    return h;
  },

  /* ─── Container Stats ──────────────────────────────────────────── */

  _viewStats(id, containerId, name) {
    const label = 'Fetching stats for ' + name;
    UI.toast(label + '...', 'info', 3000);
    this._execAction(id, 'docker stats ' + containerId + ' --no-stream --format \'{{json .}}\'', label).then(r => {
      if (!r || !r.ok) {
        UI.toast('Failed to fetch stats: ' + (r ? r.stderr : 'error'), 'error');
        return;
      }
      const lines = this._parseJsonLines(r.stdout || '');
      if (!lines.length) {
        UI.toast('No stats data returned', 'error');
        return;
      }
      const s = lines[0];
      const rows = [
        ['CPU %', s.CPUPerc || '-'],
        ['Memory Usage', (s.MemUsage || '-') + ' / ' + (s.MemLimit || '-')],
        ['Memory %', s.MemPerc || '-'],
        ['Net I/O', s.NetIO || '-'],
        ['Block I/O', s.BlockIO || '-'],
        ['PIDs', s.PIDs || '-']
      ];
      let h = '<table class="docker-info-table">';
      rows.forEach(r2 => {
        h += '<tr><td class="info-label">' + UI.escHtml(r2[0]) + '</td><td class="info-value">' + UI.escHtml(r2[1]) + '</td></tr>';
      });
      h += '</table>';
      UI.showModal('Container Stats — ' + UI.escHtml(name),
        h + '<div class="form-actions" style="margin-top:12px"><button class="btn btn-secondary" onclick="UI.hideModal()">Close</button></div>'
      );
    });
  },

  /* ─── Container Exec (Interactive Shell) ─────────────────────── */

  _openContainerShell(id, containerId, name) {
    const sessionId = this._getSessionId(id);
    if (!sessionId) { UI.toast('Not connected', 'error'); return; }

    let ws = null;
    let closed = false;
    let term = null;
    let fitAddon = null;
    let ro = null;

    const h = [
      '<div class="terminal-modal">',
      '<div class="terminal-header">',
      '<div class="terminal-title">',
      '<span class="status-dot" id="exec-term-status"></span>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
      UI.escHtml(name),
      '<span class="terminal-badge">exec</span>',
      '</div>',
      '<div class="terminal-toolbar">',
      '<button class="btn btn-secondary btn-sm" id="exec-term-close-btn">Disconnect</button>',
      '</div>',
      '</div>',
      '<div id="exec-term-output" class="terminal-output"></div>',
      '</div>'
    ];

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (ws) { try { ws.close(); } catch {} }
      if (ro) ro.disconnect();
      if (term) { try { term.dispose(); } catch {} }
    };

    UI.showModal('Container Shell — ' + UI.escHtml(name), h.join(''), cleanup);
    UI._modalPreventClose = true;

    const termContainer = document.getElementById('exec-term-output');
    const closeBtn = document.getElementById('exec-term-close-btn');
    const statusDot = document.getElementById('exec-term-status');

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

    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    ro.observe(termContainer);

    let reconnectAttempt = 0;
    const maxReconnectDelay = 30000;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connectUrl = proto + '//' + location.host + '/ws/exec?sessionId=' + sessionId + '&containerId=' + containerId + '&shell=sh';

    const initWs = () => {
      let wsErrored = false;
      ws = new WebSocket(connectUrl);

      ws.onopen = () => {
        reconnectAttempt = 0;
        term.reset();
        statusDot.className = 'status-dot connected';
        try { fitAddon.fit(); } catch {}
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
        term.focus();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ready') return;
          if (msg.type === 'error') {
            term.writeln('\r\n\x1b[31mError: ' + UI.escHtml(msg.message) + '\x1b[0m');
            return;
          }
        } catch {}
        term.write(e.data);
      };

      ws.onerror = () => {
        wsErrored = true;
      };

      ws.onclose = (evt) => {
        console.log('Docker WS closed: code=' + evt.code + ' reason="' + evt.reason + '" wasClean=' + evt.wasClean + ' errored=' + wsErrored);
        if (closed) return;
        const reason = evt.reason ? ' (' + evt.reason + ')' : '';
        if (wsErrored && reason) {
          term.writeln('\r\n\x1b[31m' + UI.escHtml(evt.reason) + '\x1b[0m');
        } else if (wsErrored) {
          term.writeln('\r\n\x1b[31mConnection failed\x1b[0m');
        }
        term.writeln('\r\n\x1b[33mExecution ended (code ' + evt.code + ')' + reason + '\x1b[0m');
        statusDot.className = 'status-dot';
        if (evt.code === 4001 || evt.code === 4002) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), maxReconnectDelay);
        reconnectAttempt++;
        setTimeout(initWs, delay);
      };
    };

    initWs();

    termContainer.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    });

    closeBtn.addEventListener('click', () => {
      UI._modalPreventClose = false;
      UI.hideModal();
    });
  },

  /* ─── Container Inspect ──────────────────────────────────────── */

  _viewInspect(id, containerId, name) {
    const label = 'Inspecting ' + name;
    UI.toast(label + '...', 'info', 3000);
    this._execAction(id, 'docker inspect ' + containerId, label).then(r => {
      if (!r || !r.ok) {
        UI.toast('Failed to inspect container: ' + (r ? r.stderr : 'error'), 'error');
        return;
      }
      try {
        const data = JSON.parse(r.stdout || '{}');
        const pretty = JSON.stringify(data, null, 2);
        const esc = UI.escHtml(pretty);
        UI.showModal('Container Inspect — ' + UI.escHtml(name),
          '<pre class="docker-inspect-json">' + esc + '</pre>' +
          '<div class="form-actions" style="margin-top:12px">' +
          '<button class="btn btn-secondary" id="docker-inspect-copy">Copy JSON</button>' +
          '<button class="btn btn-secondary" onclick="UI.hideModal()">Close</button></div>'
        );
        const copyBtn = document.getElementById('docker-inspect-copy');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(pretty).then(() => {
              UI.toast('Copied to clipboard', 'success');
            }).catch(() => {});
          });
        }
      } catch (e) {
        UI.toast('Failed to parse inspect data', 'error');
      }
    });
  },

  _fmtTime(t) {
    if (!t || t === '-') return '-';
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return t;
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return Math.round(diff) + 's ago';
      if (diff < 3600) return Math.round(diff / 60) + 'm ago';
      if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
      if (diff < 604800) return Math.round(diff / 86400) + 'd ago';
      return d.toLocaleDateString();
    } catch { return t; }
  }
};
