const Backup = {
  render() {
    const token = Store.getSetting('backup_telegram_token', '');
    const chatId = Store.getSetting('backup_telegram_chat_id', '');
    const enabled = Store.getSetting('backup_enabled', false);

    const h = [`<div class="settings-container">
      <section class="settings-section">
        <div class="settings-section-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:6px"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
          Cloud Backup
        </div>
        <div class="settings-section-body">
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;line-height:1.6">
            Automatically back up your servers, snippets, and settings to Telegram.
            Your data is stored securely in your Telegram chat — only you can access it.
          </p>

          <div class="backup-provider-card">
            <div class="backup-provider-header">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 13 14 18 7"/><circle cx="6" cy="6" r="1"/><path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20z"/></svg>
              <span>Telegram Bot Backup</span>
              <span class="backup-badge backup-badge-active">Active</span>
            </div>
            <div class="backup-provider-body">
              <div class="form-group">
                <label class="form-label">Bot Token (from BotFather)</label>
                <input type="password" class="form-input" id="backup-token" value="${UI.escAttr(token)}" placeholder="1234567890:ABCdefGHIjklmNOPqrSTUvwxYZ">
              </div>
              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label">Chat ID</label>
                  <input type="text" class="form-input" id="backup-chat-id" value="${UI.escAttr(chatId)}" placeholder="Auto-detected if empty">
                </div>
                <div class="form-group" style="min-width:100px">
                  <label class="form-label">&nbsp;</label>
                  <button class="btn btn-ghost" id="backup-detect-chat" title="Auto-detect chat ID">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    Detect
                  </button>
                </div>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">Automatic Daily Backup</div>
                  <div class="settings-desc">Back up all data automatically every 24 hours.</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="backup-enabled" ${enabled ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="form-actions" style="border:none;padding:0;margin-top:12px">
                <button class="btn btn-primary" id="backup-test">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
                  Send Test
                </button>
                <button class="btn btn-secondary" id="backup-save">Save Settings</button>
                <button class="btn btn-secondary" id="backup-export">Back Up Now</button>
              </div>
            </div>
          </div>

          <details class="backup-guide">
            <summary class="backup-guide-summary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              How to set up your Telegram bot
            </summary>
            <div class="backup-guide-content">
              <ol>
                <li><strong>Open Telegram</strong> and search for <code>@BotFather</code> — the official bot creation tool.</li>
                <li>Send the command <code>/newbot</code> to BotFather.</li>
                <li>Follow the prompts: choose a <strong>name</strong> (e.g. "My DevPanel Backup") and a <strong>username</strong> ending in <code>_bot</code> (e.g. <code>my_devpanel_backup_bot</code>).</li>
                <li>BotFather will reply with an <strong>HTTP API token</strong> — copy it and paste it in the <strong>Bot Token</strong> field above.</li>
                <li><strong>Start a chat</strong> with your new bot (tap the bot's username and click <strong>Start</strong>), then send any message like <code>/start</code>.</li>
                <li>Click <strong>Detect</strong> to auto-find your Chat ID, or paste it manually from <a href="https://t.me/userinfobot" target="_blank" rel="noopener">@userinfobot</a>.</li>
                <li>Click <strong>Save Settings</strong> then <strong>Send Test</strong> to verify everything works.</li>
                <li>Toggle <strong>Automatic Daily Backup</strong> on for unattended daily snapshots.</li>
              </ol>
            </div>
          </details>

          <div class="backup-provider-card" style="opacity:0.6;margin-top:16px">
            <div class="backup-provider-header">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>Google Drive Backup</span>
              <span class="backup-badge">Coming Soon</span>
            </div>
            <div class="backup-provider-body">
              <p style="color:var(--text-muted);font-size:0.85rem;margin:0">
                Google Drive integration is under development. You'll be able to back up your
                data directly to your Google Drive with automatic scheduled syncs.
              </p>
            </div>
          </div>

        </div>
      </section>
    </div>`];

    document.getElementById('content').innerHTML = h.join('');
    this._bind();
  },

  _bind() {
    document.getElementById('backup-save').addEventListener('click', () => this._save());
    document.getElementById('backup-test').addEventListener('click', () => this._test());
    document.getElementById('backup-export').addEventListener('click', () => this._exportNow());
    document.getElementById('backup-detect-chat').addEventListener('click', () => this._detectChat());
    document.getElementById('backup-enabled').addEventListener('change', () => this._save());
  },

  _save() {
    const token = document.getElementById('backup-token').value.trim();
    const chatId = document.getElementById('backup-chat-id').value.trim();
    const enabled = document.getElementById('backup-enabled').checked;
    Store.setSetting('backup_telegram_token', token);
    Store.setSetting('backup_telegram_chat_id', chatId);
    Store.setSetting('backup_enabled', enabled);
    UI.toast('Backup settings saved');
  },

  _test() {
    this._save();
    const token = Store.getSetting('backup_telegram_token', '');
    if (!token) {
      UI.toast('Please enter a Bot Token first', 'error');
      return;
    }
    fetch('/api/backup/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        chatId: Store.getSetting('backup_telegram_chat_id', '')
      })
    })
    .then(r => r.json())
    .then(d => {
      if (d.ok) UI.toast('Test message sent! Check your Telegram bot.');
      else UI.toast('Failed: ' + (d.error || 'Unknown error'), 'error');
    })
    .catch(() => UI.toast('Network error — server may be offline', 'error'));
  },

  _exportNow() {
    this._save();
    const token = Store.getSetting('backup_telegram_token', '');
    const chatId = Store.getSetting('backup_telegram_chat_id', '');
    if (!token) {
      UI.toast('Please enter a Bot Token first', 'error');
      return;
    }
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      telegram: {
        botToken: token,
        chatId: chatId || ''
      },
      servers: Store.data.servers || [],
      snippets: Store.data.snippets || [],
      settings: Store.data.settings || {}
    };
    fetch('/api/backup/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        chatId,
        data: backupData
      })
    })
    .then(r => r.json())
    .then(d => {
      if (d.ok) UI.toast('Backup sent to Telegram!');
      else UI.toast('Failed: ' + (d.error || 'Unknown error'), 'error');
    })
    .catch(() => UI.toast('Network error — server may be offline', 'error'));
  },

  _detectChat() {
    const token = document.getElementById('backup-token').value.trim();
    if (!token) {
      UI.toast('Enter your Bot Token first', 'error');
      return;
    }
    fetch('/api/backup/detect-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    .then(r => r.json())
    .then(d => {
      if (d.ok && d.chatId) {
        document.getElementById('backup-chat-id').value = d.chatId;
        UI.toast('Chat ID detected: ' + d.chatId);
      } else {
        UI.toast('No chat found. Send a message to your bot first.', 'warning');
      }
    })
    .catch(() => UI.toast('Network error — server may be offline', 'error'));
  }
};
