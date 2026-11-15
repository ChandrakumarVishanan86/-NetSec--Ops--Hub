/* =====================================================================
   NetSec Ops Hub — app.js
   Shared utilities (icons, toasts, clipboard), hash router, bootstrapping.
   Load order (see index.html): kanban.js → security.js → network.js → app.js
   ===================================================================== */
(() => {
  'use strict';

  const NS = (window.NetSec = window.NetSec || {});

  /* ------------------------------ Icons ------------------------------ */
  const ICONS = {
    chevL: '<path d="M15 18l-6-6 6-6"/>',
    chevR: '<path d="M9 18l6-6-6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'
  };

  NS.icon = (name, size = 16) =>
    `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ------------------------------ Utilities ------------------------------ */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const debounce = (fn, ms = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ------------------------------ Toasts ------------------------------ */
  function toast(message, { type = 'info', action = null, duration = 4000 } = {}) {
    const box = document.getElementById('toasts');
    if (!box) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    const iconName = type === 'success' ? 'check' : type === 'warn' ? 'alert' : 'info';
    el.innerHTML = `<span class="toast-icon">${NS.icon(iconName, 14)}</span><span class="toast-msg">${esc(message)}</span>`;

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('leaving')) return;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    };

    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.onClick(); dismiss(); });
      el.appendChild(btn);
    }

    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild.remove();

    timer = setTimeout(dismiss, duration);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1800); });
  }

  NS.toast = toast;
  NS.util = {
    esc,
    debounce,
    copy: async (text, label = 'Value') => {
      const ok = await copyText(text);
      toast(ok ? `${label} copied to clipboard` : 'Copy failed — select the text and copy manually', { type: ok ? 'success' : 'warn', duration: 2200 });
      return ok;
    }
  };

  /* ------------------------------ Send to Kanban ------------------------------ */
  NS.sendToKanban = (payload) => {
    const task = NS.Kanban.addTask(payload);
    toast('Task added to Backlog', {
      type: 'success',
      action: { label: 'View board', onClick: () => NS.navigate('kanban') }
    });
    return task;
  };

  /* ------------------------------ Router ------------------------------ */
  const VIEWS = {
    security: { title: 'Security & Crypto Lab', sub: 'Password entropy, hashing and classic ciphers.' },
    network: { title: 'Network & IP Diagnostics', sub: 'Subnet math and a searchable port reference.' },
    kanban: { title: 'Sprint & Incident Board', sub: 'Plan sprints, track incidents, drag cards between stages.' }
  };
  const DEFAULT_VIEW = 'security';

  let current = null;
  let switchToken = 0;

  const $ = (sel, root = document) => root.querySelector(sel);
  const viewFromHash = () => {
    const id = location.hash.replace(/^#\/?/, '');
    return VIEWS[id] ? id : DEFAULT_VIEW;
  };

  NS.navigate = (id) => {
    const target = `#/${id}`;
    if (location.hash !== target) location.hash = target;
    else show(id);
  };

  function show(id) {
    if (id === current) return;
    const next = $(`#view-${id}`);
    if (!next) return;
    const prev = current ? $(`#view-${current}`) : null;
    const token = ++switchToken;
    current = id;

    document.querySelectorAll('.nav-item').forEach((a) => {
      const active = a.dataset.view === id;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#page-title').textContent = VIEWS[id].title;
    $('#page-sub').textContent = VIEWS[id].sub;
    document.title = `${VIEWS[id].title} · NetSec Ops Hub`;

    const enter = () => {
      if (token !== switchToken) return;
      document.querySelectorAll('.view').forEach((v) => {
        if (v !== next) { v.hidden = true; v.classList.remove('leaving'); }
      });
      next.classList.remove('leaving');
      next.hidden = false;
      $('#main').scrollTo({ top: 0, behavior: 'auto' });
    };

    if (prev && prev !== next) {
      prev.classList.add('leaving');
      setTimeout(enter, 160);
    } else {
      enter();
    }
    closeSidebar();
  }

  /* ------------------------------ Sidebar (mobile) ------------------------------ */
  const sidebar = () => $('#sidebar');
  const scrim = () => $('#scrim');
  function openSidebar() { sidebar().classList.add('open'); scrim().classList.add('show'); }
  function closeSidebar() { sidebar().classList.remove('open'); scrim().classList.remove('show'); }

  /* ------------------------------ Kanban badge ------------------------------ */
  let lastCount = null;
  function updateBadge() {
    const badge = $('#kb-badge');
    if (!badge || !NS.Kanban) return;
    const n = NS.Kanban.openCount();
    badge.textContent = n;
    if (lastCount !== null && n !== lastCount) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
    lastCount = n;
  }

  /* ------------------------------ Clock ------------------------------ */
  function tick() {
    const el = $('#clock');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ------------------------------ Boot ------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    NS.Kanban.init();
    NS.Security.init();
    NS.Network.init();

    $('#menu-btn').addEventListener('click', openSidebar);
    scrim().addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

    document.addEventListener('kanban:changed', updateBadge);
    updateBadge();

    tick();
    setInterval(tick, 20000);

    window.addEventListener('hashchange', () => show(viewFromHash()));
    show(viewFromHash());
  });
})();
