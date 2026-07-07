const App = {

  init() {
    Store.init();
    UI.init();
    Store.applyTheme();

    this._setupRouter();
    this._setupSidebar();
    this._setupKeyboard();
    this._setupMobileMenu();
    this._setupAutoUpdater();

    this.navigate(this._getRoute());
  },

  _getRoute() {
    const hash = location.hash.replace('#', '') || 'servers';
    const parts = hash.split('/');
    return parts[0] || 'servers';
  },

  navigate(route) {
    location.hash = '#' + route;
  },

  _setupRouter() {
    window.addEventListener('hashchange', () => {
      const route = this._getRoute();
      this._render(route);
    });
  },

  _render(route) {
    document.querySelectorAll('.nav-item').forEach(el => { el.classList.remove('active'); el.removeAttribute('aria-current'); });
    const validRoutes = ['dashboard', 'servers', 'snippets', 'settings', 'backup', 'docker'];
    if (!validRoutes.includes(route)) route = 'servers';
    const activeLink = document.querySelector('.nav-item[data-route="' + route + '"]');
    if (activeLink) { activeLink.classList.add('active'); activeLink.setAttribute('aria-current', 'page'); }

    const titles = { dashboard: 'Dashboard', servers: 'Servers', snippets: 'Snippets', settings: 'Settings', backup: 'Cloud Backup', docker: 'Docker' };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = titles[route] || 'ChuweyDevPanel';

    this.updateStats();

    const content = document.getElementById('content');
    content.parentNode.replaceChild(content.cloneNode(true), content);
    const freshContent = document.getElementById('content');
    freshContent.classList.remove('page-enter');
    void freshContent.offsetWidth;

    try {
      switch (route) {
        case 'dashboard': Dashboard.render(); break;
        case 'servers': Servers.render(); break;
        case 'snippets': Snippets.render(); break;
        case 'settings': Settings.render(); break;
        case 'backup': Backup.render(); break;
        case 'docker': Docker.render(); break;
        default: Servers.render();
      }
    } catch (err) {
      freshContent.innerHTML = '<div class="empty-state"><p>Failed to load: ' + UI.escHtml(err.message) + '</p><button class="btn btn-primary" onclick="App.navigate(\'servers\')">Go to Servers</button></div>';
      console.error('Render error:', err);
    }

    requestAnimationFrame(() => freshContent.classList.add('page-enter'));
  },

  _setupSidebar() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this._hideMobileMenu();
        this.navigate(el.dataset.route);
      });
    });
  },

  _setupKeyboard() {
    const tourBtn = document.getElementById('tour-btn');
    if (tourBtn) tourBtn.addEventListener('click', () => TourGuide.start());
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.addEventListener('keydown', (e) => {
        const items = Array.from(sidebar.querySelectorAll('.nav-item'));
        const idx = items.indexOf(document.activeElement);
        if (idx === -1) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[Math.min(idx + 1, items.length - 1)].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[Math.max(idx - 1, 0)].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          items[idx].click();
        }
      });
    }
  },

  _setupMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!toggle || !sidebar) return;

    const show = () => {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';
    };
    const hide = () => {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
      document.body.style.overflow = '';
    };

    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) { hide(); } else { show(); }
    });

    if (backdrop) {
      backdrop.addEventListener('click', hide);
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
        hide();
      }
    });
  },

  _hideMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
      document.body.style.overflow = '';
    }
  },

  _setupAutoUpdater() {
    if (!window.electronAPI) return;

    const banner = document.getElementById('update-banner');
    const message = document.getElementById('update-message');
    const actions = document.getElementById('update-banner-actions');
    const downloadBtn = document.getElementById('update-download-btn');
    const installBtn = document.getElementById('update-install-btn');
    const dismissBtn = document.getElementById('update-dismiss-btn');
    if (!banner || !message || !actions || !downloadBtn || !installBtn || !dismissBtn) return;

    let updateVersion = '';

    window.electronAPI.on('checking-for-update', () => {
      message.textContent = 'Checking for updates...';
      banner.style.display = 'flex';
      actions.style.display = 'none';
    });

    window.electronAPI.on('update-available', (info) => {
      updateVersion = info.version;
      message.textContent = 'Update v' + updateVersion + ' is available';
      banner.style.display = 'flex';
      actions.style.display = 'flex';
      downloadBtn.style.display = 'inline-flex';
      installBtn.style.display = 'none';
    });

    window.electronAPI.on('update-not-available', () => {
      banner.style.display = 'none';
    });

    window.electronAPI.on('update-error', () => {
      banner.style.display = 'none';
    });

    window.electronAPI.on('update-download-progress', (progress) => {
      const pct = Math.round(progress.percent);
      message.textContent = 'Downloading update... ' + pct + '%';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
    });

    window.electronAPI.on('update-downloaded', () => {
      message.textContent = 'v' + updateVersion + ' downloaded. Install now?';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'inline-flex';
      actions.style.display = 'flex';
    });

    downloadBtn.addEventListener('click', () => {
      window.electronAPI.invoke('download-update');
    });

    installBtn.addEventListener('click', () => {
      window.electronAPI.invoke('quit-and-install');
    });

    dismissBtn.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  },

  updateStats() {
    const servers = Store.getAll('servers').length;
    const snippets = Store.getAll('snippets').length;

    const sv = document.getElementById('stat-servers');
    const sn = document.getElementById('stat-snippets');
    if (sv) sv.innerHTML = '<strong>' + servers + '</strong> ' + (servers === 1 ? 'server' : 'servers');
    if (sn) sn.innerHTML = '<strong>' + snippets + '</strong> ' + (snippets === 1 ? 'snippet' : 'snippets');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
