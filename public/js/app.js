const App = {

  init() {
    Store.init();
    UI.init();
    Store.applyTheme();

    this._setupRouter();
    this._setupSidebar();
    this._setupKeyboard();
    this._setupMobileMenu();

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
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const validRoutes = ['dashboard', 'servers', 'snippets', 'settings'];
    if (!validRoutes.includes(route)) route = 'servers';
    const activeLink = document.querySelector('.nav-item[data-route="' + route + '"]');
    if (activeLink) activeLink.classList.add('active');

    const titles = { dashboard: 'Dashboard', servers: 'Servers', snippets: 'Snippets', settings: 'Settings' };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = titles[route] || 'ChuweyDevPanel';

    this.updateStats();

    const content = document.getElementById('content');
    content.parentNode.replaceChild(content.cloneNode(true), content);
    const freshContent = document.getElementById('content');
    freshContent.classList.remove('page-enter');
    void freshContent.offsetWidth;

    switch (route) {
      case 'dashboard': Dashboard.render(); break;
      case 'servers': Servers.render(); break;
      case 'snippets': Snippets.render(); break;
      case 'settings': Settings.render(); break;
      default: Servers.render();
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
    document.getElementById('tour-btn').addEventListener('click', () => TourGuide.start());
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
