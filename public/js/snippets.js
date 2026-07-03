const Snippets = {
  _tagFilter: '',

  render() {
    this._expandedId = null;
    const all = Store.getAll('snippets');
    let filtered = all;
    if (this._tagFilter) filtered = filtered.filter(s => (s.tags || []).some(t => t.toLowerCase() === this._tagFilter.toLowerCase()));

    const tags = Store.getAllTags();

    const h = ['<div class="module-toolbar">',
      '<div></div>',
      '<button class="btn btn-primary" id="add-snip-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Snippet</button>',
    '</div>'];

    if (tags.length) {
      h.push('<div class="filter-bar" role="group" aria-label="Filter by tag">');
      h.push('<span class="filter-chip' + (!this._tagFilter ? ' active' : '') + '" data-snip-filter="" tabindex="0" role="button" aria-pressed="' + (!this._tagFilter ? 'true' : 'false') + '">All</span>');
      for (const tag of tags) {
        h.push('<span class="filter-chip' + (this._tagFilter === tag ? ' active' : '') + '" data-snip-filter="' + UI.escAttr(tag) + '" tabindex="0" role="button" aria-pressed="' + (this._tagFilter === tag ? 'true' : 'false') + '">' + UI.escHtml(tag) + '</span>');
      }
      h.push('</div>');
    }

    if (!filtered.length) {
      h.push('<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>');
      h.push('<p>No snippets yet. Add your first snippet!</p></div>');
    } else {
      h.push('<div class="list-container">');
      for (const s of filtered) h.push(this._card(s));
      h.push('</div>');
    }

    document.getElementById('content').innerHTML = h.join('');

    document.getElementById('add-snip-btn').addEventListener('click', () => this.form());
    document.getElementById('content').addEventListener('keydown', (e) => {
      const chip = e.target.classList.contains('filter-chip') ? e.target : null;
      if (!chip) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._tagFilter = chip.dataset.snipFilter || '';
        this.render();
      }
    });
    document.getElementById('content').addEventListener('click', (e) => {
      const card = e.target.closest('.snip-card');
      if (!card) return;
      const id = card.dataset.id;
      if (e.target.closest('.copy-snip')) {
        const snip = Store.getById('snippets', id);
        UI.copy(snip.code, 'Snippet copied!');
      } else if (e.target.closest('.edit-snip')) {
        this.form(id);
      } else if (e.target.closest('.del-snip')) {
        this._del(id);
      } else if (e.target.closest('.snippet-expand-btn')) {
        this._toggleExpand(id);
      }
      if (e.target.classList.contains('filter-chip') || e.target.closest('.filter-chip')) {
        const chip = e.target.classList.contains('filter-chip') ? e.target : e.target.closest('.filter-chip');
        this._tagFilter = chip.dataset.snipFilter || '';
        this.render();
      }
    });
  },

  _card(s) {
    const tags = (s.tags && s.tags.length) ? '<div class="snippet-tags">' + s.tags.map(t => '<span class="snippet-tag">' + UI.escHtml(t) + '</span>').join('') + '</div>' : '';
    const isExpanded = this._expandedId === s.id;
    const codeLines = (s.code || '').split('\n').length;
    const needsExpand = codeLines > 6;
    return '<div class="card snip-card" data-id="' + s.id + '">' +
      '<div class="card-header"><div class="snippet-header"><span class="card-title">' + UI.escHtml(s.title) + '</span></div>' +
      '<div class="card-actions">' +
      '<button class="btn-icon copy-snip" title="Copy snippet">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      '</button>' +
      '<button class="btn-icon edit-snip" title="Edit">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      '</button>' +
      '<button class="btn-icon del-snip" title="Delete">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button></div></div>' +
      '<div class="card-body">' + tags +
      '<div class="snippet-code' + (isExpanded ? ' expanded' : '') + '"><pre>' + UI.highlight(s.code || '') + '</pre></div>' +
      (needsExpand ? '<button class="snippet-expand-btn">' + (isExpanded ? 'Collapse' : 'Show more (' + codeLines + ' lines)') + '</button>' : '') +
      '</div></div>';
  },

  _expandedId: null,

  _toggleExpand(id) {
    this._expandedId = this._expandedId === id ? null : id;
    this.render();
  },

  form(id) {
    const s = id ? Store.getById('snippets', id) : null;
    const tagsVal = s && s.tags ? s.tags.join(', ') : '';
    const h = ['<form id="snip-form">'];
    if (s) h.push('<input type="hidden" name="id" value="' + s.id + '">');
    h.push(
      '<div class="form-group"><label class="form-label">Title</label><input type="text" name="title" class="form-input" required placeholder="Express Server Setup" value="' + UI.escAttr(s ? s.title : '') + '"></div>',
      '<div class="form-group"><label class="form-label">Code</label><textarea name="code" class="form-input form-textarea code-textarea" required placeholder="Paste your code here..." spellcheck="false">' + UI.escHtml(s ? s.code || '' : '') + '</textarea></div>',
      '<div class="form-group"><label class="form-label">Tags <span class="info-label">(comma separated)</span></label><input type="text" name="tags" class="form-input" placeholder="node, express, backend" value="' + UI.escAttr(tagsVal) + '"></div>',
      '<div class="form-actions"><button type="button" class="btn btn-secondary" onclick="UI.hideModal()">Cancel</button>',
      '<button type="submit" class="btn btn-primary">' + (s ? 'Update' : 'Add') + ' Snippet</button></div>'
    );
    h.push('</form>');
    UI.showModal(s ? 'Edit Snippet' : 'Add Snippet', h.join(''));

    document.getElementById('snip-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rawTags = fd.get('tags') || '';
      const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
      const data = { title: fd.get('title'), code: fd.get('code'), tags: tags };
      if (fd.get('id')) {
        Store.update('snippets', fd.get('id'), data);
        UI.toast('Snippet updated');
      } else {
        Store.add('snippets', data);
        UI.toast('Snippet added');
      }
      UI.hideModal();
      this.render();
    });
  },

  _del(id) {
    const s = Store.getById('snippets', id);
    UI.showConfirm('Delete snippet "' + (s ? s.title : '') + '"?', () => {
      Store.delete('snippets', id);
      UI.toast('Snippet deleted');
      this.render();
    });
  }
};
