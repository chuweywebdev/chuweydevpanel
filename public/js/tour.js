const TourGuide = {
  _steps: [],
  _current: 0,

  _defaults: [
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
      title: 'Welcome to ChuweyDevPanel',
      text: 'ChuweyDevPanel is your all-in-one SSH manager. Browse servers, run commands, save snippets, and monitor connections — all from your browser.'
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
      title: 'Sidebar Navigation',
      text: 'Use the sidebar to switch between sections: Dashboard for an overview, Servers to manage connections, and Snippets for saved commands.'
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>`,
      title: 'Servers',
      text: 'Add SSH servers with credentials or private keys. Connect with one click, open terminals, and run commands directly through your browser.'
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
      title: 'Snippets',
      text: 'Save frequently used commands as snippets. Organize them with tags, filter by category, and copy them to your clipboard with one click.'
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
      title: 'Dashboard',
      text: 'Get a quick overview of all your servers. Monitor connection status, check last reboot times, and see real-time usage at a glance.'
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>`,
      title: 'Settings',
      text: 'Customize your experience: toggle dark mode, configure terminal appearance, and manage your preferences.'
    }
  ],

  start(steps) {
    this._steps = steps || this._defaults;
    this._current = 0;
    this._render();
    this._bind();
    const overlay = document.getElementById('tour-overlay');
    if (overlay) overlay.classList.add('show');
  },

  _render() {
    const step = this._steps[this._current];
    const total = this._steps.length;
    const body = document.getElementById('tour-body');
    const counter = document.getElementById('tour-counter');
    const prevBtn = document.getElementById('tour-prev');
    const nextBtn = document.getElementById('tour-next');

    if (!body) return;

    body.innerHTML = `<div class="tour-body">
      <div class="tour-step-icon">${step.icon}</div>
      <h2>${UI.escHtml(step.title)}</h2>
      <p>${UI.escHtml(step.text)}</p>
    </div>`;

    if (counter) counter.textContent = `${this._current + 1} of ${total}`;
    if (prevBtn) prevBtn.disabled = this._current === 0;

    if (nextBtn) {
      if (this._current >= total - 1) {
        nextBtn.textContent = 'Done';
      } else {
        nextBtn.textContent = 'Next';
      }
    }
  },

  _bind() {
    const nextBtn = document.getElementById('tour-next');
    const prevBtn = document.getElementById('tour-prev');
    const closeBtn = document.getElementById('tour-close');

    if (nextBtn) {
      const newNext = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newNext, nextBtn);
      newNext.addEventListener('click', () => this._next());
    }

    if (prevBtn) {
      const newPrev = prevBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrev, prevBtn);
      newPrev.addEventListener('click', () => this._prev());
    }

    if (closeBtn) {
      const newClose = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newClose, closeBtn);
      newClose.addEventListener('click', () => this._close());
    }
  },

  _next() {
    if (this._current >= this._steps.length - 1) {
      this._close();
      return;
    }
    this._current++;
    this._render();
    this._bind();
  },

  _prev() {
    if (this._current <= 0) return;
    this._current--;
    this._render();
    this._bind();
  },

  _close() {
    const overlay = document.getElementById('tour-overlay');
    if (overlay) overlay.classList.remove('show');
  }
};
