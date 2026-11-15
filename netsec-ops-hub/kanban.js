/* =====================================================================
   NetSec Ops Hub — kanban.js
   Trello-style board with drag & drop, modal editor and localStorage persistence.
   Public API: NetSec.Kanban.{ init, addTask, openCount, all }
   ===================================================================== */
(() => {
  'use strict';

  const NS = (window.NetSec = window.NetSec || {});

  const STORAGE_KEY = 'netsec-ops-hub:kanban:v1';
  const COLUMNS = [
    { id: 'backlog', title: 'Backlog', accent: '#8b5cf6' },
    { id: 'progress', title: 'In Progress', accent: '#06b6d4' },
    { id: 'testing', title: 'Testing', accent: '#f59e0b' },
    { id: 'done', title: 'Done', accent: '#10b981' }
  ];
  const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  const TAGS = ['Manual', 'Security', 'Network', 'Incident', 'Sprint'];
  const TAG_COLORS = { Manual: '#94a3b8', Security: '#8b5cf6', Network: '#06b6d4', Incident: '#f43f5e', Sprint: '#10b981' };

  let tasks = [];
  let query = '';
  let touchedId = null;   // card to animate after the next render
  let dragId = null;
  let placeholder = null;
  let editingId = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => NS.util.esc(s);
  const uid = () => `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const colIndex = (id) => COLUMNS.findIndex((c) => c.id === id);

  /* ------------------------------ Persistence ------------------------------ */
  function isValid(t) {
    return t && typeof t.id === 'string' && typeof t.title === 'string' &&
      colIndex(t.column) >= 0 && PRIORITIES.includes(t.priority);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValid) : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      NS.toast('Browser storage is unavailable — changes will not persist.', { type: 'warn' });
    }
  }

  function seed() {
    const now = Date.now();
    const mk = (i, title, description, priority, tag, column) => ({
      id: uid(), title, description, priority, tag, column, createdAt: now - i * 3600 * 1000 * 5
    });
    return [
      mk(1, 'Rotate SSH keys on bastion hosts', 'Replace keys older than 90 days and disable password auth.', 'High', 'Security', 'backlog'),
      mk(2, 'Design VLAN plan for the lab network', 'Management, servers, students and guest segments with inter-VLAN ACLs.', 'Medium', 'Network', 'backlog'),
      mk(3, 'Investigate failed-login spike', 'Review auth.log for repeated failures from a single source and block with fail2ban.', 'Critical', 'Incident', 'progress'),
      mk(4, 'Harden Nginx TLS configuration', 'Disable TLS 1.0/1.1, enable HSTS and verify with an SSL scanner.', 'Medium', 'Security', 'progress'),
      mk(5, 'Verify DMZ firewall rules', 'Confirm only 80/443 are reachable from the internet.', 'High', 'Network', 'testing'),
      mk(6, 'Set up NetSec Ops Hub', 'Drag me around, or use the arrows on each card. Click a description to expand it.', 'Low', 'Sprint', 'done')
    ];
  }

  function commit() {
    save();
    render();
    document.dispatchEvent(new CustomEvent('kanban:changed', { detail: { count: openCount() } }));
  }

  /* ------------------------------ Public API ------------------------------ */
  function addTask({ title, description = '', priority = 'Medium', tag = 'Manual', column = 'backlog' }) {
    const task = {
      id: uid(),
      title: String(title || 'Untitled task').trim().slice(0, 120),
      description: String(description || '').trim().slice(0, 2000),
      priority: PRIORITIES.includes(priority) ? priority : 'Medium',
      tag: String(tag || 'Manual').slice(0, 24),
      column: colIndex(column) >= 0 ? column : 'backlog',
      createdAt: Date.now()
    };
    tasks.unshift(task);
    touchedId = task.id;
    commit();
    return task;
  }

  function openCount() { return tasks.filter((t) => t.column !== 'done').length; }

  /* ------------------------------ Mutations ------------------------------ */
  function moveTask(id, columnId, beforeId = null) {
    const from = tasks.findIndex((t) => t.id === id);
    if (from < 0 || colIndex(columnId) < 0) return;
    const [task] = tasks.splice(from, 1);
    task.column = columnId;

    let at = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1;
    if (at < 0) {
      let last = -1;
      tasks.forEach((t, i) => { if (t.column === columnId) last = i; });
      at = last + 1;
    }
    tasks.splice(at, 0, task);
    touchedId = id;
    commit();
  }

  function shift(id, delta) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const next = COLUMNS[colIndex(t.column) + delta];
    if (next) moveTask(id, next.id);
  }

  function removeTask(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`Delete "${t.title}"?`)) return;
    tasks = tasks.filter((x) => x.id !== id);
    commit();
  }

  /* ------------------------------ Rendering ------------------------------ */
  const matches = (t) => {
    if (!query) return true;
    const hay = `${t.title} ${t.description} ${t.tag} ${t.priority}`.toLowerCase();
    return hay.includes(query);
  };

  function cardEl(t, ci) {
    const el = document.createElement('article');
    el.className = `task prio-${t.priority.toLowerCase()}`;
    el.draggable = true;
    el.dataset.id = t.id;
    const date = new Date(t.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const color = TAG_COLORS[t.tag] || TAG_COLORS.Manual;

    el.innerHTML = `
      <div class="task-top">
        <span class="badge prio-badge">${esc(t.priority)}</span>
        <span class="tag" style="--tag:${color}">${esc(t.tag)}</span>
      </div>
      <h4 class="task-title">${esc(t.title)}</h4>
      ${t.description ? `<p class="task-desc" title="Click to expand">${esc(t.description)}</p>` : ''}
      <div class="task-foot">
        <span class="task-date mono">${esc(date)}</span>
        <div class="task-actions">
          <button class="icon-btn sm" type="button" data-action="left" title="Move left" aria-label="Move left" ${ci === 0 ? 'disabled' : ''}>${NS.icon('chevL', 15)}</button>
          <button class="icon-btn sm" type="button" data-action="right" title="Move right" aria-label="Move right" ${ci === COLUMNS.length - 1 ? 'disabled' : ''}>${NS.icon('chevR', 15)}</button>
          <button class="icon-btn sm" type="button" data-action="edit" title="Edit" aria-label="Edit task">${NS.icon('edit', 14)}</button>
          <button class="icon-btn sm" type="button" data-action="delete" title="Delete" aria-label="Delete task">${NS.icon('trash', 14)}</button>
        </div>
      </div>`;

    if (touchedId === t.id) el.classList.add('pop');
    return el;
  }

  function render() {
    const board = $('#board');
    if (!board) return;
    const scrollLeft = board.scrollLeft;
    board.innerHTML = '';

    COLUMNS.forEach((col, ci) => {
      const items = tasks.filter((t) => t.column === col.id && matches(t));
      const total = tasks.filter((t) => t.column === col.id).length;

      const section = document.createElement('section');
      section.className = 'column';
      section.style.setProperty('--col-accent', col.accent);
      section.innerHTML = `
        <header class="col-head">
          <span class="col-dot"></span>
          <h3>${esc(col.title)}</h3>
          <span class="col-count">${query ? `${items.length}/${total}` : total}</span>
          <button class="icon-btn" type="button" data-add="${col.id}" title="Add task to ${esc(col.title)}" aria-label="Add task to ${esc(col.title)}">${NS.icon('plus', 16)}</button>
        </header>
        <div class="col-list" data-col="${col.id}"></div>`;

      const list = $('.col-list', section);
      items.forEach((t) => list.appendChild(cardEl(t, ci)));
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'col-empty';
        empty.textContent = query ? 'No matches' : 'Drop tasks here';
        list.appendChild(empty);
      }
      wireDropZone(list);
      board.appendChild(section);
    });

    board.scrollLeft = scrollLeft;
    touchedId = null;
    renderStats();
  }

  function renderStats() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.column === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#kb-total').textContent = total;
    $('#kb-progress-bar').style.width = `${pct}%`;
    $('#kb-progress-text').textContent = `${done} of ${total} done · ${pct}%`;
  }

  /* ------------------------------ Drag & drop ------------------------------ */
  function placePlaceholder(list, y) {
    const cards = [...list.querySelectorAll('.task:not(.dragging)')];
    let before = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = c; break; }
    }
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'drop-placeholder';
    }
    const inPlace = placeholder.parentNode === list && placeholder.nextElementSibling === before;
    if (inPlace) return;
    if (before) list.insertBefore(placeholder, before); else list.appendChild(placeholder);
  }

  function cleanupDrag() {
    if (placeholder) { placeholder.remove(); placeholder = null; }
    document.querySelectorAll('.col-list.drag-over').forEach((l) => l.classList.remove('drag-over'));
    document.querySelectorAll('.task.dragging').forEach((c) => c.classList.remove('dragging'));
    dragId = null;
  }

  function wireDropZone(list) {
    list.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
      placePlaceholder(list, e.clientY);
    });
    list.addEventListener('dragleave', (e) => {
      if (!dragId || list.contains(e.relatedTarget)) return;
      list.classList.remove('drag-over');
      if (placeholder && placeholder.parentNode === list) placeholder.remove();
    });
    list.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const id = dragId;
      let next = placeholder && placeholder.parentNode === list ? placeholder.nextElementSibling : null;
      while (next && (!next.classList.contains('task') || next.dataset.id === id)) next = next.nextElementSibling;
      const beforeId = next ? next.dataset.id : null;
      cleanupDrag();
      moveTask(id, list.dataset.col, beforeId);
    });
  }

  /* ------------------------------ Modal ------------------------------ */
  function fillSelect(sel, values, labelFn = (v) => v) {
    sel.innerHTML = values.map((v) => `<option value="${esc(v)}">${esc(labelFn(v))}</option>`).join('');
  }

  function openModal(task = null, column = 'backlog') {
    const dlg = $('#task-modal');
    editingId = task ? task.id : null;
    $('#modal-title').textContent = task ? 'Edit task' : 'New task';
    $('#task-title').value = task ? task.title : '';
    $('#task-desc').value = task ? task.description : '';
    $('#task-priority').value = task ? task.priority : 'Medium';
    $('#task-column').value = task ? task.column : column;

    const tagSel = $('#task-tag');
    const tag = task ? task.tag : 'Manual';
    fillSelect(tagSel, TAGS.includes(tag) ? TAGS : [...TAGS, tag]);
    tagSel.value = tag;

    $('#task-error').hidden = true;
    $('#task-title').classList.remove('invalid');
    if (!dlg.open) dlg.showModal();
    setTimeout(() => $('#task-title').focus(), 30);
  }

  function closeModal() {
    const dlg = $('#task-modal');
    if (dlg.open) dlg.close();
    editingId = null;
  }

  function onSubmit(e) {
    e.preventDefault();
    const title = $('#task-title').value.trim();
    if (!title) {
      $('#task-error').hidden = false;
      $('#task-title').classList.add('invalid');
      $('#task-title').focus();
      return;
    }
    const data = {
      title,
      description: $('#task-desc').value.trim(),
      priority: $('#task-priority').value,
      column: $('#task-column').value,
      tag: $('#task-tag').value
    };

    if (editingId) {
      const t = tasks.find((x) => x.id === editingId);
      if (t) {
        const colChanged = t.column !== data.column;
        Object.assign(t, data);
        if (colChanged) {
          closeModal();
          moveTask(t.id, data.column);
          return;
        }
        touchedId = t.id;
        closeModal();
        commit();
        return;
      }
    }
    closeModal();
    addTask(data);
  }

  /* ------------------------------ Init ------------------------------ */
  function init() {
    const stored = load();
    tasks = stored === null ? seed() : stored;
    if (stored === null) save();

    fillSelect($('#task-priority'), PRIORITIES);
    fillSelect($('#task-column'), COLUMNS.map((c) => c.id), (id) => COLUMNS[colIndex(id)].title);
    fillSelect($('#task-tag'), TAGS);

    const board = $('#board');

    // Card + column actions (event delegation)
    board.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add]');
      if (addBtn) { openModal(null, addBtn.dataset.add); return; }

      const desc = e.target.closest('.task-desc');
      if (desc) { desc.classList.toggle('expanded'); return; }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const card = btn.closest('.task');
      if (!card) return;
      const id = card.dataset.id;
      switch (btn.dataset.action) {
        case 'left': shift(id, -1); break;
        case 'right': shift(id, +1); break;
        case 'edit': openModal(tasks.find((t) => t.id === id)); break;
        case 'delete': removeTask(id); break;
      }
    });

    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest && e.target.closest('.task');
      if (!card) return;
      dragId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch { /* some browsers restrict this */ }
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    board.addEventListener('dragend', cleanupDrag);

    // Toolbar
    $('#kb-new').addEventListener('click', () => openModal(null, 'backlog'));
    $('#kb-search').addEventListener('input', NS.util.debounce((e) => {
      query = e.target.value.trim().toLowerCase();
      render();
    }, 120));
    $('#kb-clear-done').addEventListener('click', () => {
      const n = tasks.filter((t) => t.column === 'done').length;
      if (!n) { NS.toast('No completed tasks to clear.', { type: 'info', duration: 2200 }); return; }
      if (!window.confirm(`Remove ${n} completed task${n === 1 ? '' : 's'}?`)) return;
      tasks = tasks.filter((t) => t.column !== 'done');
      commit();
    });

    // Modal
    $('#task-form').addEventListener('submit', onSubmit);
    $('#task-title').addEventListener('input', () => {
      $('#task-error').hidden = true;
      $('#task-title').classList.remove('invalid');
    });
    $('#modal-close').addEventListener('click', closeModal);
    $('#task-cancel').addEventListener('click', closeModal);
    $('#task-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    $('#task-modal').addEventListener('close', () => { editingId = null; });

    // Keep multiple tabs in sync
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      tasks = load() || [];
      render();
      document.dispatchEvent(new CustomEvent('kanban:changed', { detail: { count: openCount() } }));
    });

    render();
    document.dispatchEvent(new CustomEvent('kanban:changed', { detail: { count: openCount() } }));
  }

  NS.Kanban = { init, addTask, openCount, all: () => tasks.slice() };
})();
