const UI = {
  init() {
    this.toastContainer = document.getElementById('toast-container');
    this.modal = document.getElementById('modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.confirmOverlay = document.getElementById('confirm-overlay');
    this.confirmBody = document.getElementById('confirm-body');

    const modalClose = document.getElementById('modal-close');
    if (modalClose) modalClose.addEventListener('click', () => this.hideModal());
    if (this.modal) this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hideModal();
    });
    if (this.confirmOverlay) this.confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this.confirmOverlay) this.hideConfirm();
    });
  },

  toast(msg, type, duration) {
    type = type || 'success';
    duration = duration || 2500;
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icons = { success: '\u2713', error: '\u2715', warning: '\u26A0', info: '\u2139' };
    el.innerHTML = '<span class="toast-icon">' + (icons[type] || '\u2139') + '</span><span>' + this.escHtml(msg) + '</span>';
    this.toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  _modalPreventClose: false,

  setModalPreventClose(v) {
    this._modalPreventClose = v;
  },

  showModal(title, body, onHide) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = body;
    this.modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    this._onModalHide = onHide || null;
    this._modalPreventClose = false;
  },

  hideModal() {
    if (this._modalPreventClose) return;
    this.modal.classList.remove('show');
    document.body.style.overflow = '';
    if (this._onModalHide) {
      const cb = this._onModalHide;
      this._onModalHide = null;
      cb();
    }
  },

  showConfirm(msg, onYes) {
    if (!this.confirmBody) { console.error('UI: confirm body missing'); return; }
    this.confirmBody.textContent = msg;
    this.confirmOverlay.classList.add('show');
    const yes = this.confirmOverlay.querySelector('.confirm-yes');
    const no = this.confirmOverlay.querySelector('.confirm-no');
    if (!yes || !no) { console.error('UI: confirm buttons missing'); return; }
    const cleanup = () => {
      this.confirmOverlay.classList.remove('show');
      yes.removeEventListener('click', handler);
      no.removeEventListener('click', cleanup);
    };
    const handler = () => { cleanup(); onYes(); };
    yes.addEventListener('click', handler);
    no.addEventListener('click', cleanup);
  },

  hideConfirm() {
    this.confirmOverlay.classList.remove('show');
  },

  copy(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.toast(label || 'Copied!')).catch(() => this._fallbackCopy(text, label));
    } else {
      this._fallbackCopy(text, label);
    }
  },

  _fallbackCopy(text, label) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.toast(label || 'Copied!');
    } catch {
      this.toast('Failed to copy', 'error');
    }
    document.body.removeChild(ta);
  },

  showLoading(el, text) {
    text = text || 'Loading...';
    el.innerHTML = '<div class="empty-state"><div class="dsc-spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><p>' + this.escHtml(text) + '</p></div>';
  },

  skeleton(type, count) {
    count = count || 1;
    if (type === 'stat') return '<div class="skeleton skeleton-stat"></div>';
    if (type === 'card') return '<div class="skeleton skeleton-card"></div>';
    if (type === 'table-row') return '<div class="skeleton skeleton-table-row"><div class="skeleton-line w-40"></div><div class="skeleton-line w-75"></div><div class="skeleton-line w-50"></div><div class="skeleton-line w-25"></div></div>';
    if (type === 'docker-body') return '<div class="skeleton skeleton-docker-toolbar"></div><div class="skeleton skeleton-dashboard">' + new Array(count).fill('<div class="skeleton skeleton-table-row"></div>').join('') + '</div>';
    if (type === 'server-card-body') return '<div class="skeleton skeleton-line w-75"></div><div class="skeleton skeleton-line w-50"></div>';
    let out = '';
    for (let i = 0; i < count; i++) out += '<div class="skeleton skeleton-line"></div>';
    return out;
  },

  showSkeleton(el, type, count) {
    count = count || 1;
    el.innerHTML = '<div class="skeleton-container">' + this.skeleton(type, count) + '</div>';
  },

  escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  },

  debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  },

  highlight(code) {
    if (!code) return '';
    const strings = [];
    let idx = 0;
    const processed = code
      .replace(/("(?:[^"\\]|\\.)*")/g, m => { const p = idx++; strings.push(m); return `\x00STR${p}\x00`; })
      .replace(/('(?:[^'\\]|\\.)*')/g, m => { const p = idx++; strings.push(m); return `\x00STR${p}\x00`; })
      .replace(/(`(?:[^`\\]|\\.)*`)/g, m => { const p = idx++; strings.push(m); return `\x00STR${p}\x00`; });
    return this.escHtml(processed)
      .replace(/(\/\/.*)/g, '<span class="syntax-comment">$1</span>')
      .replace(/\x00STR(\d+)\x00/g, (_, i) => '<span class="syntax-string">' + this.escHtml(strings[+i]) + '</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|export|from|default|async|await|class|new|this|super|extends|try|catch|finally|throw|typeof|instanceof|yield|delete|in|of)\b/g, '<span class="syntax-keyword">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="syntax-number">$1</span>');
  }
};
