const Settings = {
  render() {
    const theme = Store.getSetting('theme', 'light');
    const h = ['<div class="settings-container">',

      '<section class="settings-section">',
      '<div class="settings-section-header">Appearance</div>',
      '<div class="settings-section-body">',
      '<div class="settings-row">',
      '<div><div class="settings-label">Theme</div><div class="settings-desc">Switch between dark and light mode.</div></div>',
      '<label class="toggle-switch"><input type="checkbox" id="theme-toggle"' + (theme === 'dark' ? ' checked' : '') + '><span class="toggle-slider"></span></label>',
      '</div>',
      '</div>',
      '</section>',

      '<section class="settings-section">',
      '<div class="settings-section-header">Data Management</div>',
      '<div class="settings-section-body">',
      '<div class="settings-row">',
      '<div><div class="settings-label">Export Data</div><div class="settings-desc">Download all your servers, commands, and snippets as a JSON file.</div></div>',
      '<button class="btn btn-primary" id="export-btn">Export</button>',
      '</div>',

      '<div class="settings-row">',
      '<div><div class="settings-label">Import Data</div><div class="settings-desc">Restore data from a previously exported JSON file.</div></div>',
      '<button class="btn btn-secondary" id="import-btn">Import</button>',
      '</div>',

      '<div id="settings-import-area" class="settings-import-area">',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      '<p>Drop a JSON file here or click to browse</p>',
      '</div>',
      '<input type="file" id="import-file" accept=".json" style="display:none">',

      '<div class="settings-row" style="margin-top:4px">',
      '<div><div class="settings-label" style="color:var(--danger)">Clear All Data</div><div class="settings-desc">Permanently delete all servers, commands, and snippets. This cannot be undone.</div></div>',
      '<button class="btn btn-danger" id="clear-btn">Clear All</button>',
      '</div>',
      '</div>',
      '</div>'];

    document.getElementById('content').innerHTML = h.join('');

    document.getElementById('theme-toggle').addEventListener('change', (e) => {
      Store.setSetting('theme', e.target.checked ? 'light' : 'dark');
      Store.applyTheme();
    });

    document.getElementById('export-btn').addEventListener('click', () => Store.exportData());

    const importArea = document.getElementById('settings-import-area');
    const importFile = document.getElementById('import-file');

    importArea.addEventListener('click', () => importFile.click());

    importArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      importArea.classList.add('dragover');
    });

    importArea.addEventListener('dragleave', () => {
      importArea.classList.remove('dragover');
    });

    importArea.addEventListener('drop', (e) => {
      e.preventDefault();
      importArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this._handleImport(file);
    });

    document.getElementById('import-btn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this._handleImport(file);
      e.target.value = '';
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      UI.showConfirm('Are you sure you want to delete ALL data? This cannot be undone.', () => {
        Store.reset();
        UI.toast('All data cleared');
        App.updateStats();
        App.navigate('servers');
      });
    });

  },

  _handleImport(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Store.validateImport(parsed)) {
          UI.toast('Invalid import: missing required fields (servers, snippets)', 'error');
          return;
        }
        Store.importData(parsed);
        UI.toast('Data imported successfully', 'success');
        App.updateStats();
      } catch (err) {
        UI.toast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }
};
