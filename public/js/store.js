const Store = {
  KEY: 'devpanel_data',
  data: null,

  init() {
    const saved = localStorage.getItem(this.KEY);
    if (saved) {
      try {
        this.data = JSON.parse(saved);
        if (!this.data.settings) this.data.settings = { theme: 'dark' };
        if (!Array.isArray(this.data.servers)) this.data.servers = [];
        if (!Array.isArray(this.data.snippets)) this.data.snippets = [];
      } catch {
        this.reset();
      }
    } else {
      this.reset();
    }
    this.applyTheme();
  },

  reset() {
    this.data = {
      servers: [],
      snippets: [],
      settings: { theme: 'dark' }
    };
    this.save();
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Failed to save:', e);
    }
  },

  genId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  },

  getAll(type) {
    return this.data[type] || [];
  },

  getById(type, id) {
    const items = this.data[type];
    if (!Array.isArray(items)) return null;
    return items.find(i => i.id === id);
  },

  add(type, item) {
    const now = new Date().toISOString();
    const entry = { ...item, id: this.genId(), createdAt: now, updatedAt: now };
    this.data[type].push(entry);
    this.save();
    return entry;
  },

  update(type, id, updates) {
    const idx = this.data[type].findIndex(i => i.id === id);
    if (idx === -1) return null;
    this.data[type][idx] = { ...this.data[type][idx], ...updates, updatedAt: new Date().toISOString() };
    this.save();
    return this.data[type][idx];
  },

  delete(type, id) {
    this.data[type] = this.data[type].filter(i => i.id !== id);
    this.save();
  },

  getSetting(key, fallback) {
    return this.data.settings[key] !== undefined ? this.data.settings[key] : fallback;
  },

  setSetting(key, val) {
    this.data.settings[key] = val;
    this.save();
    if (key === 'theme') this.applyTheme();
  },

  toggleTheme() {
    const cur = this.getSetting('theme', 'dark');
    this.setSetting('theme', cur === 'dark' ? 'light' : 'dark');
  },

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.getSetting('theme', 'dark'));
  },

  exportData() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devpanel-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  validateImport(obj) {
    return obj && typeof obj === 'object' &&
      Array.isArray(obj.servers) &&
      Array.isArray(obj.snippets);
  },

  importData(obj, mode) {
    if (!this.validateImport(obj)) {
      UI.toast('Invalid import file format', 'error');
      return;
    }
    if (mode === 'merge') {
      const merge = (type) => {
        const ids = new Set(this.data[type].map(i => i.id));
        for (const item of (obj[type] || [])) {
          if (!ids.has(item.id)) {
            this.data[type].push(item);
            ids.add(item.id);
          }
        }
      };
      merge('servers');
      merge('snippets');
    } else {
      this.data.servers = obj.servers || [];
      this.data.snippets = obj.snippets || [];
    }
    this.save();
    this.applyTheme();
  },

  getAllTags() {
    const tags = new Set();
    for (const s of this.data.snippets) {
      if (s.tags && Array.isArray(s.tags)) {
        s.tags.forEach(t => tags.add(t));
      }
    }
    return [...tags].sort();
  },

  getStats() {
    return {
      servers: this.data.servers.length,
      snippets: this.data.snippets.length
    };
  }
};
