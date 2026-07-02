const Dashboard = {
  checkingIds: new Set(),

  render() {
    const servers = Store.getAll('servers');
    const snippets = Store.getAll('snippets');

    const html = `
      <div class="dashboard">
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value">${servers.length}</div>
            <div class="stat-label">Servers</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${snippets.length}</div>
            <div class="stat-label">Snippets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${servers.filter(s => s.lastReboot).length}</div>
            <div class="stat-label">With Reboot Data</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${servers.filter(s => s.ip).length}</div>
            <div class="stat-label">Reachable</div>
          </div>
        </div>
        <div class="section-header">
          <h2>Server Reboot Status</h2>
          <button class="btn btn-primary" onclick="Dashboard.checkAll()" ${servers.length === 0 ? 'disabled' : ''}>
            Check All
          </button>
        </div>
        <div id="dashboard-server-list">
          ${servers.length === 0 ? '<p class="empty-state">No servers yet. <a href="#servers">Add one</a>.</p>' : servers.map(s => this._serverCard(s)).join('')}
        </div>
      </div>`;
    document.getElementById('content').innerHTML = html;
  },

  _serverCard(server) {
    const checking = this.checkingIds.has(server.id);
    const lastBoot = server.lastReboot ? new Date(server.lastReboot).toLocaleString() : null;
    const agent = server.ip || server.hostname || '—';
    const log = server.rebootLog || [];
    return `
      <div class="dashboard-server-card" data-id="${server.id}">
        <div class="dsc-info">
          <div class="dsc-name">${this._escape(server.name)}</div>
          <div class="dsc-agent">${this._escape(agent)}</div>
        </div>
        <div class="dsc-status">
          ${checking ? '<span class="dsc-spinner"></span><span>Checking…</span>' : lastBoot ? `<span class="dsc-boot">Last boot: <strong>${lastBoot}</strong></span>` : '<span class="dsc-unknown">No data</span>'}
        </div>
        <div class="dsc-actions">
          <button class="btn btn-sm btn-secondary dsc-check" onclick="Dashboard.checkReboot('${server.id}')" ${checking ? 'disabled' : ''}>
            ${checking ? '…' : 'Check Now'}
          </button>
          ${log.length > 0 ? `<button class="btn btn-sm btn-ghost dsc-log" onclick="Dashboard.showLog('${server.id}')" title="Reboot check history (${log.length})">Log (${log.length})</button>` : ''}
        </div>
      </div>`;
  },

  showLog(id) {
    const server = Store.getAll('servers').find(s => s.id === id);
    if (!server || !server.rebootLog || server.rebootLog.length === 0) return;

    const log = server.rebootLog.toReversed();
    const last = log[0];
    const lastTime = last.bootTime ? this._escape(last.bootTime) : last.error ? 'Failed' : '—';

    const rows = log.map((e, i) => {
      const checkedAt = new Date(e.date).toLocaleString();
      const boot = e.bootTime ? this._escape(e.bootTime) : e.error ? 'Failed' : '—';
      const isLatest = i === 0;
      const rowCls = isLatest ? ' class="rl-row rl-latest"' : ' class="rl-row"';
      const statusCls = e.error ? 'rl-cell rl-status-fail' : e.bootTime ? 'rl-cell rl-status-ok' : 'rl-cell rl-status-unknown';
      const marker = isLatest ? '<span class="rl-marker">Latest</span>' : '';
      return `<tr${rowCls}><td class="rl-cell">${checkedAt}</td><td class="${statusCls}">${boot} ${marker}</td></tr>`;
    }).join('');

    const h = [
      '<div class="rl-modal">',
      '<div class="rl-summary">',
      '<span class="rl-summary-label">Server</span>',
      '<span class="rl-summary-value">' + this._escape(server.name) + '</span>',
      '<span class="rl-summary-label">Count</span>',
      '<span class="rl-summary-value">' + log.length + ' check' + (log.length !== 1 ? 's' : '') + '</span>',
      '<span class="rl-summary-label">Last Reboot</span>',
      '<span class="rl-summary-value">' + lastTime + '</span>',
      '</div>',
      '<div class="rl-table-wrap">',
      '<table class="rl-table">',
      '<thead><tr><th class="rl-th">Checked At</th><th class="rl-th">Boot Time</th></tr></thead>',
      '<tbody>', rows, '</tbody>',
      '</table>',
      '</div>',
      '</div>'
    ];
    UI.showModal('Reboot Check History', h.join(''));
  },

  async checkReboot(id, noAutoShow) {
    const server = Store.getAll('servers').find(s => s.id === id);
    if (!server) return;
    this.checkingIds.add(id);
    this._refreshList();
    try {
      const bootTime = await this._exec(server, 'who -b');
      const trimmed = bootTime.trim();
      const isDate = trimmed && !/^who\b/i.test(trimmed) && trimmed.length > 5;
      const logEntry = { date: new Date().toISOString(), bootTime: isDate ? trimmed : null };
      const log = [...(server.rebootLog || []), logEntry];
      Store.update('servers', id, { lastReboot: logEntry.date, rebootLog: log });
      const msg = isDate ? 'Last boot: ' + trimmed.replace(/\s+/g, ' ') : 'No reboot data returned';
      UI.toast(server.name + ': ' + msg, isDate ? 'success' : 'info');
    } catch {
      const logEntry = { date: new Date().toISOString(), bootTime: null, error: true };
      const log = [...(server.rebootLog || []), logEntry];
      Store.update('servers', id, { lastReboot: null, rebootLog: log });
      UI.toast('Failed to check reboot for ' + server.name, 'error');
    } finally {
      this.checkingIds.delete(id);
      this._refreshList();
    }
    if (!noAutoShow) this.showLog(id);
  },

  async checkAll() {
    const servers = Store.getAll('servers').filter(s => s.ip || s.hostname);
    for (const server of servers) {
      await this.checkReboot(server.id, true);
    }
    UI.toast('Reboot check complete for all servers');
  },

  _exec(server, command) {
    return new Promise((resolve, reject) => {
      fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: server.ip || server.hostname, port: server.port || '22', username: server.username,
          password: server.password || undefined, privateKey: server.privateKey || undefined })
      })
        .then(r => r.json())
        .then(result => {
          if (result.error) throw new Error(result.error);
          const sessionId = result.sessionId;
          if (!sessionId) throw new Error('No session ID returned');

          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal?sessionId=${sessionId}`);
          let output = '';
          let settled = false;

          const done = (err, val) => {
            if (settled) return;
            settled = true;
            ws.close();
            fetch('/api/ssh/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }).catch(() => {});
            if (err) reject(err);
            else resolve(val);
          };

          ws.onopen = () => { ws.send(command + '\n'); };
          ws.onmessage = (e) => { output += e.data; };
          ws.onerror = () => done(new Error('WebSocket error'));
          ws.onclose = () => done(null, output);

          setTimeout(() => { ws.send('exit\n'); done(null, output); }, 4000);
        })
        .catch(e => reject(e));
    });
  },

  _refreshList() {
    const container = document.getElementById('dashboard-server-list');
    if (!container) return;
    const servers = Store.getAll('servers');
    container.innerHTML = servers.map(s => this._serverCard(s)).join('');
  },

  _escape(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }
};
