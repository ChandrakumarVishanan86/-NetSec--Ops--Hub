/* =====================================================================
   NetSec Ops Hub — network.js
   IPv4 subnet calculator and searchable port reference.
   Public API: NetSec.Network.init()
   ===================================================================== */
(() => {
  'use strict';

  const NS = (window.NetSec = window.NetSec || {});
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => NS.util.esc(s);

  /* ===================================================================
     Subnet maths
     =================================================================== */
  const toInt = (o) => (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
  const toDotted = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

  function parseIPv4(str) {
    const m = String(str).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const octets = m.slice(1).map(Number);
    if (octets.some((x) => x > 255)) return null;
    return toInt(octets);
  }

  function classOf(n) {
    const a = n >>> 24;
    if (a < 128) return 'Class A';
    if (a < 192) return 'Class B';
    if (a < 224) return 'Class C';
    if (a < 240) return 'Class D (Multicast)';
    return 'Class E (Reserved)';
  }

  function scopeOf(n) {
    const a = n >>> 24, b = (n >>> 16) & 255;
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'Private (RFC 1918)';
    if (a === 127) return 'Loopback';
    if (a === 169 && b === 254) return 'Link-local (APIPA)';
    if (a === 100 && b >= 64 && b <= 127) return 'Shared / CGNAT';
    if (a >= 224 && a <= 239) return 'Multicast';
    if (a >= 240) return 'Reserved';
    if (a === 0) return 'This network';
    return 'Public';
  }

  function compute(ip, cidr) {
    const mask = cidr === 0 ? 0 : ((0xFFFFFFFF << (32 - cidr)) >>> 0);
    const wildcard = (~mask) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | wildcard) >>> 0;
    const total = Math.pow(2, 32 - cidr);

    let first, last, usable;
    if (cidr <= 30) { first = network + 1; last = broadcast - 1; usable = total - 2; }
    else if (cidr === 31) { first = network; last = broadcast; usable = 2; }   // RFC 3021 point-to-point
    else { first = ip; last = ip; usable = 1; }                                 // /32 host route

    return { ip, cidr, mask, wildcard, network, broadcast, first, last, total, usable };
  }

  const bitsHtml = (n, cidr) => {
    let html = '';
    for (let i = 0; i < 32; i++) {
      if (i > 0 && i % 8 === 0) html += '<span class="oct-sep">.</span>';
      html += `<span class="${i < cidr ? 'bit-net' : 'bit-host'}">${(n >>> (31 - i)) & 1}</span>`;
    }
    return html;
  };

  /* ===================================================================
     Subnet calculator UI
     =================================================================== */
  const STAT_DEFS = [
    { key: 'cidr', label: 'Network (CIDR)', accent: 'cyan' },
    { key: 'network', label: 'Network ID', accent: 'violet' },
    { key: 'broadcast', label: 'Broadcast Address', accent: 'emerald' },
    { key: 'range', label: 'Usable Host Range', accent: 'cyan', wide: true },
    { key: 'mask', label: 'Subnet Mask', accent: 'violet' },
    { key: 'wildcard', label: 'Wildcard Mask', accent: 'emerald' },
    { key: 'usable', label: 'Usable Hosts', accent: 'cyan' },
    { key: 'total', label: 'Total Addresses', accent: 'violet' },
    { key: 'class', label: 'Address Class', accent: 'emerald' },
    { key: 'scope', label: 'Address Scope', accent: 'cyan' }
  ];

  function initSubnet() {
    const ipInput = $('#ip-input');
    const cidrInput = $('#cidr-input');
    const cidrRange = $('#cidr-range');
    const errorEl = $('#ip-error');
    const grid = $('#subnet-results');
    const binary = $('#subnet-binary');
    const send = $('#subnet-send');
    const summary = $('#subnet-summary');
    const cards = {};
    let last = null;

    // Build result cards once; update their text in place so changes can flash.
    grid.innerHTML = STAT_DEFS.map((d) => `
      <button type="button" class="stat ${d.accent}${d.wide ? ' wide' : ''}" data-key="${d.key}" title="Click to copy">
        <span class="stat-label">${esc(d.label)}${NS.icon('copy', 13)}</span>
        <span class="stat-value">—</span>
      </button>`).join('');
    STAT_DEFS.forEach((d) => {
      const el = $(`[data-key="${d.key}"]`, grid);
      cards[d.key] = { el, value: $('.stat-value', el) };
    });

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.stat');
      if (!btn) return;
      const label = $('.stat-label', btn).childNodes[0].textContent.trim();
      NS.util.copy($('.stat-value', btn).textContent, label);
    });

    const setStat = (key, text) => {
      const c = cards[key];
      if (c.value.textContent === text) return;
      c.value.textContent = text;
      c.el.classList.remove('flash');
      void c.el.offsetWidth;
      c.el.classList.add('flash');
    };

    function showError(msg, field) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
      ipInput.classList.toggle('invalid', field === 'ip');
      cidrInput.classList.toggle('invalid', field === 'cidr');
      grid.classList.add('stale');
      binary.classList.add('stale');
      send.disabled = true;
      summary.textContent = '';
      last = null;
    }

    function update() {
      let ipText = ipInput.value.trim();
      let cidrText = cidrInput.value.trim();

      // Allow "10.0.0.0/8" typed straight into the address box.
      if (ipText.includes('/')) {
        const [addr, pref] = ipText.split('/');
        ipText = addr.trim();
        cidrText = (pref || '').trim();
        if (/^\d{1,2}$/.test(cidrText)) {
          cidrInput.value = cidrText;
          cidrRange.value = cidrText;
        }
      }

      const ip = parseIPv4(ipText);
      if (ip === null) return showError('Enter a valid IPv4 address, e.g. 192.168.10.37 (four octets, 0–255).', 'ip');
      if (!/^\d{1,2}$/.test(cidrText) || Number(cidrText) > 32) return showError('Prefix length must be a whole number from 0 to 32.', 'cidr');

      const cidr = Number(cidrText);
      cidrRange.value = String(cidr);
      paintRange();

      errorEl.hidden = true;
      ipInput.classList.remove('invalid');
      cidrInput.classList.remove('invalid');
      grid.classList.remove('stale');
      binary.classList.remove('stale');

      const r = (last = compute(ip, cidr));
      const num = (n) => n.toLocaleString();

      setStat('cidr', `${toDotted(r.network)}/${cidr}`);
      setStat('network', toDotted(r.network));
      setStat('broadcast', cidr >= 31 ? `${toDotted(r.broadcast)} (n/a)` : toDotted(r.broadcast));
      setStat('range', r.first === r.last ? toDotted(r.first) : `${toDotted(r.first)} – ${toDotted(r.last)}`);
      setStat('mask', toDotted(r.mask));
      setStat('wildcard', toDotted(r.wildcard));
      setStat('usable', num(r.usable));
      setStat('total', num(r.total));
      setStat('class', classOf(ip));
      setStat('scope', scopeOf(ip));

      binary.innerHTML = [
        ['IP address', ip],
        ['Subnet mask', r.mask],
        ['Network ID', r.network],
        ['Broadcast', r.broadcast]
      ].map(([label, n]) => `<div class="bin-row"><span class="bin-label">${label}</span><span class="bin-val">${bitsHtml(n, cidr)}</span></div>`).join('');

      summary.textContent = `${toDotted(r.network)}/${cidr} · ${num(r.total)} addresses · ${32 - cidr} host bits`;
      send.disabled = false;
    }

    function paintRange() {
      cidrRange.style.setProperty('--fill', `${(Number(cidrRange.value) / 32) * 100}%`);
    }

    ipInput.addEventListener('input', update);
    ipInput.addEventListener('change', () => {
      // Tidy "10.0.0.0/8" into the two separate fields once editing finishes.
      if (ipInput.value.includes('/') && last) ipInput.value = toDotted(last.ip);
    });
    cidrInput.addEventListener('input', update);
    cidrRange.addEventListener('input', () => { cidrInput.value = cidrRange.value; update(); });
    $('#cidr-presets').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      cidrInput.value = chip.dataset.cidr;
      cidrRange.value = chip.dataset.cidr;
      update();
    });

    send.addEventListener('click', () => {
      if (!last) return;
      const r = last;
      NS.sendToKanban({
        title: `Provision subnet ${toDotted(r.network)}/${r.cidr}`,
        description: [
          `Network: ${toDotted(r.network)}/${r.cidr}`,
          `Mask: ${toDotted(r.mask)} · Wildcard: ${toDotted(r.wildcard)}`,
          `Hosts: ${toDotted(r.first)}${r.first === r.last ? '' : ' – ' + toDotted(r.last)}`,
          `Broadcast: ${toDotted(r.broadcast)}`,
          `Usable hosts: ${r.usable.toLocaleString()} (of ${r.total.toLocaleString()})`,
          `Scope: ${scopeOf(r.network)}`
        ].join('\n'),
        priority: 'Medium',
        tag: 'Network',
        column: 'backlog'
      });
    });

    update();
  }

  /* ===================================================================
     Port reference
     =================================================================== */
  const CAT_COLORS = {
    'Web': '#06b6d4',
    'Remote Access': '#8b5cf6',
    'File Transfer': '#f59e0b',
    'Email': '#ec4899',
    'Infrastructure': '#10b981',
    'Directory & Auth': '#6366f1',
    'Database': '#f43f5e',
    'Monitoring': '#14b8a6'
  };

  // enc: 'enc' = encrypted by design, 'clear' = cleartext protocol, '' = n/a or optional
  const PORTS = [
    { port: 20, proto: 'TCP', service: 'FTP (Data)', cat: 'File Transfer', enc: 'clear', desc: 'Data channel for active-mode FTP transfers.' },
    { port: 21, proto: 'TCP', service: 'FTP (Control)', cat: 'File Transfer', enc: 'clear', desc: 'FTP commands and credentials, all sent unencrypted.' },
    { port: 22, proto: 'TCP', service: 'SSH / SFTP / SCP', cat: 'Remote Access', enc: 'enc', desc: 'Encrypted remote shell and secure file transfer.' },
    { port: 23, proto: 'TCP', service: 'Telnet', cat: 'Remote Access', enc: 'clear', desc: 'Legacy remote terminal. Replace with SSH.' },
    { port: 25, proto: 'TCP', service: 'SMTP', cat: 'Email', enc: 'clear', desc: 'Server-to-server mail relay.' },
    { port: 53, proto: 'TCP/UDP', service: 'DNS', cat: 'Infrastructure', enc: 'clear', desc: 'Name resolution. UDP for queries, TCP for zone transfers and large replies.' },
    { port: 67, proto: 'UDP', service: 'DHCP Server', cat: 'Infrastructure', enc: '', desc: 'Hands out IP addresses and network settings to clients.' },
    { port: 68, proto: 'UDP', service: 'DHCP Client', cat: 'Infrastructure', enc: '', desc: 'Client side of DHCP address requests.' },
    { port: 69, proto: 'UDP', service: 'TFTP', cat: 'File Transfer', enc: 'clear', desc: 'Trivial FTP, no authentication. Used for PXE boot and device configs.' },
    { port: 80, proto: 'TCP', service: 'HTTP', cat: 'Web', enc: 'clear', desc: 'Unencrypted web traffic. Redirect to HTTPS.' },
    { port: 88, proto: 'TCP/UDP', service: 'Kerberos', cat: 'Directory & Auth', enc: '', desc: 'Ticket-based authentication used by Active Directory.' },
    { port: 110, proto: 'TCP', service: 'POP3', cat: 'Email', enc: 'clear', desc: 'Download mail from a server (cleartext).' },
    { port: 123, proto: 'UDP', service: 'NTP', cat: 'Infrastructure', enc: '', desc: 'Network time synchronisation, important for logs and Kerberos.' },
    { port: 137, proto: 'UDP', service: 'NetBIOS Name', cat: 'File Transfer', enc: 'clear', desc: 'Legacy Windows name service. Disable if unused.' },
    { port: 143, proto: 'TCP', service: 'IMAP', cat: 'Email', enc: 'clear', desc: 'Mailbox access that keeps mail on the server.' },
    { port: 161, proto: 'UDP', service: 'SNMP', cat: 'Monitoring', enc: 'clear', desc: 'Device monitoring. v1/v2c use cleartext community strings; prefer v3.' },
    { port: 162, proto: 'UDP', service: 'SNMP Trap', cat: 'Monitoring', enc: 'clear', desc: 'Asynchronous alerts sent from devices to a manager.' },
    { port: 389, proto: 'TCP/UDP', service: 'LDAP', cat: 'Directory & Auth', enc: 'clear', desc: 'Directory queries for users and groups.' },
    { port: 443, proto: 'TCP', service: 'HTTPS', cat: 'Web', enc: 'enc', desc: 'HTTP secured with TLS. HTTP/3 (QUIC) also uses UDP 443.' },
    { port: 445, proto: 'TCP', service: 'SMB', cat: 'File Transfer', enc: '', desc: 'Windows file and printer sharing. Never expose to the internet.' },
    { port: 465, proto: 'TCP', service: 'SMTPS', cat: 'Email', enc: 'enc', desc: 'SMTP over implicit TLS.' },
    { port: 500, proto: 'UDP', service: 'IKE (IPsec)', cat: 'Remote Access', enc: 'enc', desc: 'Key exchange for IPsec VPN tunnels.' },
    { port: 514, proto: 'UDP', service: 'Syslog', cat: 'Monitoring', enc: 'clear', desc: 'Centralised log forwarding from devices and servers.' },
    { port: 587, proto: 'TCP', service: 'SMTP Submission', cat: 'Email', enc: 'enc', desc: 'Mail submission from clients, upgraded with STARTTLS.' },
    { port: 636, proto: 'TCP', service: 'LDAPS', cat: 'Directory & Auth', enc: 'enc', desc: 'LDAP over TLS.' },
    { port: 873, proto: 'TCP', service: 'rsync', cat: 'File Transfer', enc: '', desc: 'Efficient file synchronisation daemon.' },
    { port: 993, proto: 'TCP', service: 'IMAPS', cat: 'Email', enc: 'enc', desc: 'IMAP over TLS.' },
    { port: 995, proto: 'TCP', service: 'POP3S', cat: 'Email', enc: 'enc', desc: 'POP3 over TLS.' },
    { port: 1194, proto: 'UDP', service: 'OpenVPN', cat: 'Remote Access', enc: 'enc', desc: 'Default OpenVPN tunnel port (UDP or TCP).' },
    { port: 1433, proto: 'TCP', service: 'Microsoft SQL Server', cat: 'Database', enc: '', desc: 'MSSQL database engine. Keep behind a firewall.' },
    { port: 1521, proto: 'TCP', service: 'Oracle DB', cat: 'Database', enc: '', desc: 'Oracle TNS listener.' },
    { port: 2049, proto: 'TCP/UDP', service: 'NFS', cat: 'File Transfer', enc: 'clear', desc: 'Unix network file system.' },
    { port: 3306, proto: 'TCP', service: 'MySQL / MariaDB', cat: 'Database', enc: '', desc: 'Popular open-source relational database.' },
    { port: 3389, proto: 'TCP/UDP', service: 'RDP', cat: 'Remote Access', enc: 'enc', desc: 'Windows Remote Desktop. A top ransomware entry point if exposed.' },
    { port: 5432, proto: 'TCP', service: 'PostgreSQL', cat: 'Database', enc: '', desc: 'PostgreSQL database server.' },
    { port: 5900, proto: 'TCP', service: 'VNC', cat: 'Remote Access', enc: 'clear', desc: 'Remote framebuffer desktop sharing. Tunnel through SSH or a VPN.' },
    { port: 6379, proto: 'TCP', service: 'Redis', cat: 'Database', enc: '', desc: 'In-memory data store. Often unauthenticated by default; never expose.' },
    { port: 8080, proto: 'TCP', service: 'HTTP Alternate', cat: 'Web', enc: 'clear', desc: 'Common for proxies, dev servers and admin consoles.' },
    { port: 8443, proto: 'TCP', service: 'HTTPS Alternate', cat: 'Web', enc: 'enc', desc: 'Alternate TLS web port for management interfaces.' },
    { port: 27017, proto: 'TCP', service: 'MongoDB', cat: 'Database', enc: '', desc: 'NoSQL document database. Enable auth and bind to localhost.' },
    { port: 51820, proto: 'UDP', service: 'WireGuard', cat: 'Remote Access', enc: 'enc', desc: 'Modern, lightweight VPN protocol.' }
  ];

  function initPorts() {
    const search = $('#port-search');
    const filters = $('#port-filters');
    const grid = $('#port-grid');
    const count = $('#port-count');
    let category = 'All';

    const categories = ['All', ...Object.keys(CAT_COLORS)];

    function renderFilters() {
      filters.innerHTML = categories.map((c) => {
        const n = c === 'All' ? PORTS.length : PORTS.filter((p) => p.cat === c).length;
        return `<button type="button" class="chip${c === category ? ' active' : ''}" data-cat="${esc(c)}" aria-pressed="${c === category}">${esc(c)}<span class="n">${n}</span></button>`;
      }).join('');
    }

    function render() {
      const q = search.value.trim().toLowerCase();
      const list = PORTS.map((p, idx) => ({ p, idx })).filter(({ p }) => {
        if (category !== 'All' && p.cat !== category) return false;
        if (!q) return true;
        return `${p.port} ${p.proto} ${p.service} ${p.cat} ${p.desc} ${p.enc === 'enc' ? 'encrypted secure' : p.enc === 'clear' ? 'cleartext insecure unencrypted' : ''}`.toLowerCase().includes(q);
      });

      count.textContent = `${list.length} of ${PORTS.length} ports`;

      if (!list.length) {
        grid.innerHTML = `<div class="empty-state">No ports match <strong>${esc(search.value)}</strong>. Try a service name or a number.</div>`;
        return;
      }

      grid.innerHTML = list.map(({ p, idx }, i) => `
        <article class="port-card" style="--tag:${CAT_COLORS[p.cat]};animation-delay:${Math.min(i, 12) * 18}ms">
          <div class="port-top">
            <button type="button" class="port-num mono" data-copy="${p.port}" title="Click to copy port number">${p.port}</button>
            <span class="badge">${esc(p.proto)}</span>
            <button type="button" class="icon-btn sm" data-send="${idx}" title="Send audit task to Kanban" aria-label="Send ${esc(p.service)} audit task to Kanban">${NS.icon('plus', 16)}</button>
          </div>
          <h4>${esc(p.service)}</h4>
          <p>${esc(p.desc)}</p>
          <div class="tag-row">
            <span class="tag" style="--tag:${CAT_COLORS[p.cat]}">${esc(p.cat)}</span>
            ${p.enc === 'enc' ? '<span class="tag enc">Encrypted</span>' : p.enc === 'clear' ? '<span class="tag clear">Cleartext</span>' : ''}
          </div>
        </article>`).join('');
    }

    filters.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      category = chip.dataset.cat;
      renderFilters();
      render();
    });
    search.addEventListener('input', NS.util.debounce(render, 90));

    grid.addEventListener('click', (e) => {
      const num = e.target.closest('[data-copy]');
      if (num) { NS.util.copy(num.dataset.copy, `Port ${num.dataset.copy}`); return; }

      const btn = e.target.closest('[data-send]');
      if (!btn) return;
      const p = PORTS[Number(btn.dataset.send)];
      if (!p) return;
      NS.sendToKanban({
        title: `Audit exposure: port ${p.port}/${p.proto} (${p.service})`,
        description: [
          `${p.service} · ${p.proto} ${p.port} · ${p.cat}`,
          p.desc,
          p.enc === 'clear' ? 'Risk: protocol is cleartext. Verify an encrypted alternative is enforced.' : 'Check: confirm the service is needed and reachable only from trusted sources.',
          'Steps: scan externally, review firewall rules, restrict source IPs, enable logging.'
        ].join('\n'),
        priority: p.enc === 'clear' || p.cat === 'Database' ? 'High' : 'Medium',
        tag: 'Network',
        column: 'backlog'
      });
    });

    renderFilters();
    render();
  }

  function init() {
    initSubnet();
    initPorts();
  }

  NS.Network = { init, _test: { compute, parseIPv4, toDotted, classOf, scopeOf } };
})();
