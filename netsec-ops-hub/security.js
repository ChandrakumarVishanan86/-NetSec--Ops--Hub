/* =====================================================================
   NetSec Ops Hub — security.js
   Password strength / entropy analysis and the Hash & Cipher playground.
   Public API: NetSec.Security.init()
   ===================================================================== */
(() => {
  'use strict';

  const NS = (window.NetSec = window.NetSec || {});
  const $ = (sel, root = document) => root.querySelector(sel);

  /* ===================================================================
     Password analysis
     =================================================================== */
  const COMMON = new Set([
    'password', '123456', '12345678', '123456789', '1234567890', '111111', '000000', '123123', 'qwerty', 'qwertyuiop',
    'abc123', 'letmein', 'admin', 'admin123', 'welcome', 'iloveyou', 'monkey', 'dragon', 'master', 'login', 'passw0rd',
    'password1', 'p@ssw0rd', 'p@ssword', 'football', 'baseball', 'trustno1', 'sunshine', 'princess', 'root', 'toor',
    'changeme', 'secret', '1q2w3e4r', 'qazwsx', 'zaq12wsx', 'starwars', 'hello123', 'freedom', 'whatever'
  ]);
  const COMMON_WORDS = [
    'password', 'welcome', 'qwerty', 'letmein', 'admin', 'iloveyou', 'monkey', 'dragon', 'master', 'login',
    'football', 'baseball', 'sunshine', 'princess', 'secret', 'changeme', 'trustno', 'freedom', 'whatever'
  ];
  const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
  const GUESSES_PER_SECOND = 1e10; // offline attack against a fast hash on a GPU rig

  function charsetOf(pw) {
    const has = {
      lower: /[a-z]/.test(pw),
      upper: /[A-Z]/.test(pw),
      digit: /[0-9]/.test(pw),
      symbol: /[ -\/:-@\[-`{-~]/.test(pw),
      other: /[^\x00-\x7F]/.test(pw)
    };
    const pool = (has.lower ? 26 : 0) + (has.upper ? 26 : 0) + (has.digit ? 10 : 0) + (has.symbol ? 33 : 0) + (has.other ? 100 : 0);
    return { has, pool };
  }

  function detectPatterns(pw) {
    const lower = pw.toLowerCase();
    const chars = [...lower];

    let repeats = 0;
    for (let i = 1; i < chars.length; i++) if (chars[i] === chars[i - 1]) repeats++;

    let sequences = 0;
    for (let i = 0; i <= chars.length - 3; i++) {
      const a = chars[i].codePointAt(0), b = chars[i + 1].codePointAt(0), c = chars[i + 2].codePointAt(0);
      if (Math.abs(b - a) === 1 && b - a === c - b) sequences++;
    }

    let keyboard = false;
    for (const row of KEYBOARD_ROWS) {
      const rev = [...row].reverse().join('');
      for (const r of [row, rev]) {
        for (let i = 0; i <= r.length - 4; i++) if (lower.includes(r.slice(i, i + 4))) keyboard = true;
      }
    }

    // Exact match, or a common word dressed up with digits / leetspeak (e.g. "P@ssw0rd!2024")
    const plain = lower.replace(/[^a-z]/g, '');
    const leet = lower.replace(/@/g, 'a').replace(/0/g, 'o').replace(/3/g, 'e').replace(/\$/g, 's')
      .replace(/5/g, 's').replace(/1/g, 'i').replace(/!/g, 'i').replace(/[^a-z]/g, '');
    const derived = COMMON_WORDS.some((w) =>
      plain === w || leet === w ||
      (plain.startsWith(w) && plain.length - w.length <= 3) ||
      (leet.startsWith(w) && leet.length - w.length <= 3));
    const common = COMMON.has(lower) || derived;

    return { repeats, sequences, keyboard, common };
  }

  function analyze(pw) {
    const length = [...pw].length;
    if (!length) {
      return { length: 0, pool: 0, entropy: 0, level: 'empty', percent: 0, crackSeconds: 0, has: {}, patterns: {}, patternOk: false };
    }
    const { has, pool } = charsetOf(pw);
    const patterns = detectPatterns(pw);
    const bitsPerChar = Math.log2(pool || 1);

    let entropy = length * bitsPerChar;
    entropy -= patterns.repeats * bitsPerChar * 0.8;
    entropy -= patterns.sequences * bitsPerChar * 0.6;
    if (patterns.keyboard) entropy -= 10;
    if (patterns.common) entropy = Math.min(entropy, 24);
    entropy = Math.max(0, entropy);

    let level = 'moderate';
    if (patterns.common || length < 8 || entropy < 40) level = 'weak';
    else if (entropy >= 70) level = 'strong';

    const crackSeconds = Math.pow(2, Math.max(0, entropy - 1)) / GUESSES_PER_SECOND;
    const patternOk = !patterns.common && !patterns.keyboard && patterns.repeats === 0 && patterns.sequences === 0;

    return {
      length, pool, entropy, level, has, patterns, patternOk, crackSeconds,
      percent: Math.min(100, (entropy / 100) * 100)
    };
  }

  function formatDuration(sec) {
    const plural = (n, unit) => `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;
    if (sec < 1) return 'Instantly';
    if (sec < 60) return plural(Math.round(sec), 'second');
    const min = sec / 60;
    if (min < 60) return plural(Math.round(min), 'minute');
    const hr = min / 60;
    if (hr < 24) return plural(Math.round(hr), 'hour');
    const day = hr / 24;
    if (day < 365) return plural(Math.round(day), 'day');
    const yr = day / 365;
    if (yr < 1e3) return plural(Math.round(yr), 'year');
    if (yr < 1e6) return `${Math.round(yr / 1e3).toLocaleString()} thousand years`;
    if (yr < 1e9) return `${Math.round(yr / 1e6).toLocaleString()} million years`;
    if (yr < 1e12) return `${Math.round(yr / 1e9).toLocaleString()} billion years`;
    return 'Trillions of years+';
  }

  const LEVEL_LABEL = { empty: 'Awaiting input', weak: 'Weak', moderate: 'Moderate', strong: 'Strong' };

  function hintFor(r) {
    if (r.level === 'empty') return 'Start typing to see a live analysis.';
    if (r.patterns.common) return 'This looks like a very common password or a trivial variation of one. Attackers try these first.';
    if (r.length < 8) return 'Too short. Aim for at least 12 characters, ideally a passphrase of several random words.';
    if (r.patterns.keyboard) return 'Contains a keyboard run (like "qwer" or "asdf"), which cracking dictionaries include.';
    if (r.patterns.sequences) return 'Contains sequential characters (abc, 123). Mix them up for more entropy.';
    if (r.patterns.repeats) return 'Repeated characters add very little entropy. Try more variety.';
    if (r.level === 'weak') return 'Increase length and mix character types to push entropy above 40 bits.';
    if (r.level === 'moderate') return 'Decent, but length is the cheapest upgrade. Each extra character adds several bits.';
    return 'Strong. Store it in a password manager and never reuse it across sites.';
  }

  function initPassword() {
    const input = $('#pw-input');
    const toggle = $('#pw-toggle');
    const meter = $('#pw-meter');
    const send = $('#pw-send');
    let last = analyze('');

    const setToggleIcon = () => {
      const visible = input.type === 'text';
      toggle.innerHTML = NS.icon(visible ? 'eyeOff' : 'eye', 18);
      toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    };
    setToggleIcon();
    toggle.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      setToggleIcon();
      input.focus();
    });

    const checks = {
      len: (r) => r.length >= 12,
      lower: (r) => !!r.has.lower,
      upper: (r) => !!r.has.upper,
      digit: (r) => !!r.has.digit,
      symbol: (r) => !!(r.has.symbol || r.has.other),
      pattern: (r) => r.length > 0 && r.patternOk
    };

    function update() {
      const r = (last = analyze(input.value));
      meter.dataset.level = r.level;
      $('#pw-label').textContent = LEVEL_LABEL[r.level];
      $('#pw-bits').textContent = `${r.entropy.toFixed(1)} bits`;
      $('#pw-bar').style.width = `${r.percent}%`;
      const bar = $('#pw-progress');
      bar.setAttribute('aria-valuenow', String(Math.round(r.percent)));
      bar.setAttribute('aria-valuetext', `${LEVEL_LABEL[r.level]}, ${r.entropy.toFixed(1)} bits of entropy`);
      $('#pw-hint').textContent = hintFor(r);

      $('#pw-entropy').textContent = r.length ? `${r.entropy.toFixed(1)}` : '—';
      $('#pw-length').textContent = r.length;
      $('#pw-pool').textContent = r.pool;
      $('#pw-crack').textContent = r.length ? formatDuration(r.crackSeconds) : '—';

      document.querySelectorAll('#pw-checks li').forEach((li) => {
        li.classList.toggle('ok', !!checks[li.dataset.check](r));
      });
      send.disabled = r.length === 0;
    }

    input.addEventListener('input', update);
    update();

    send.addEventListener('click', () => {
      if (!last.length) return;
      const label = LEVEL_LABEL[last.level];
      const priority = last.level === 'weak' ? 'High' : last.level === 'moderate' ? 'Medium' : 'Low';
      const advice = last.level === 'strong'
        ? 'Result: meets policy. Confirm it is unique and stored in a password manager.'
        : 'Action: increase length (12+), mix character classes, avoid common words and patterns, then re-test.';
      NS.sendToKanban({
        title: `Password audit: ${label} credential (${last.entropy.toFixed(0)} bits)`,
        description: [
          `Strength: ${label}`,
          `Entropy: ${last.entropy.toFixed(1)} bits`,
          `Length: ${last.length} characters · Charset: ${last.pool}`,
          `Est. offline crack time: ${formatDuration(last.crackSeconds)}`,
          advice,
          '(The password itself was not recorded.)'
        ].join('\n'),
        priority,
        tag: 'Security',
        column: 'backlog'
      });
    });
  }

  /* ===================================================================
     SHA-256 (Web Crypto, with a pure-JS fallback for insecure contexts)
     =================================================================== */
  const K256 = [];
  const H256 = [];
  (function buildConstants() {
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0;
    let n = 2, count = 0;
    while (count < 64) {
      let prime = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (prime) {
        if (count < 8) H256.push(frac(Math.sqrt(n)));
        K256.push(frac(Math.cbrt(n)));
        count++;
      }
      n++;
    }
  })();

  function sha256Fallback(bytes) {
    const len = bytes.length;
    const padded = ((len + 9 + 63) >>> 6) << 6;
    const buf = new Uint8Array(padded);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    const bitLen = len * 8;
    dv.setUint32(padded - 8, Math.floor(bitLen / 4294967296));
    dv.setUint32(padded - 4, bitLen >>> 0);

    const h = H256.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < padded; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.crypto && window.crypto.subtle) {
      try {
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch { /* fall through to the JS implementation */ }
    }
    return sha256Fallback(bytes);
  }

  /* ===================================================================
     Base64 (UTF-8 safe) and Caesar cipher
     =================================================================== */
  function base64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  }

  function base64Decode(str) {
    let s = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function caesar(text, shift) {
    const s = ((shift % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, (ch) => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + s) % 26) + base);
    });
  }

  /* ===================================================================
     Playground UI
     =================================================================== */
  function bindSegmented(container, onChange) {
    let value = $('.seg.active', container).dataset.value;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg');
      if (!btn || btn.dataset.value === value) return;
      value = btn.dataset.value;
      container.querySelectorAll('.seg').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      onChange(value);
    });
    return () => value;
  }

  function setOutput(el, text, state) {
    el.textContent = text;
    el.classList.toggle('is-empty', state === 'empty');
    el.classList.toggle('is-error', state === 'error');
    if (state === 'ok') {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

  function initPlayground() {
    const input = $('#cx-input');
    const shaOut = $('#cx-sha');
    const b64Out = $('#cx-b64');
    const ccOut = $('#cx-caesar');
    const shift = $('#cx-shift');
    const shiftVal = $('#cx-shift-val');
    const send = $('#cx-send');
    const state = { sha: '', b64: '', b64Ok: false, cc: '' };
    let shaToken = 0;

    const getB64Mode = bindSegmented($('#b64-mode'), () => update());
    const getCcMode = bindSegmented($('#cc-mode'), () => update());

    const paintRange = () => {
      const pct = (Number(shift.value) / Number(shift.max)) * 100;
      shift.style.setProperty('--fill', `${pct}%`);
      shiftVal.textContent = shift.value;
    };

    async function updateSha(text) {
      const token = ++shaToken;
      if (!text) { state.sha = ''; setOutput(shaOut, 'Awaiting input…', 'empty'); return; }
      const hex = await sha256Hex(text);
      if (token !== shaToken) return; // a newer keystroke superseded this one
      state.sha = hex;
      setOutput(shaOut, hex, 'ok');
    }

    function update() {
      const text = input.value;
      const bytes = new TextEncoder().encode(text).length;
      $('#cx-count').textContent = `${[...text].length} chars · ${bytes} bytes`;

      updateSha(text);

      if (!text) {
        state.b64 = ''; state.b64Ok = false; state.cc = '';
        setOutput(b64Out, 'Awaiting input…', 'empty');
        setOutput(ccOut, 'Awaiting input…', 'empty');
      } else {
        try {
          state.b64 = getB64Mode() === 'encode' ? base64Encode(text) : base64Decode(text);
          state.b64Ok = true;
          setOutput(b64Out, state.b64, 'ok');
        } catch {
          state.b64 = ''; state.b64Ok = false;
          setOutput(b64Out, 'Not valid Base64 (or not valid UTF-8 text once decoded).', 'error');
        }
        const n = Number(shift.value);
        state.cc = caesar(text, getCcMode() === 'encode' ? n : -n);
        setOutput(ccOut, state.cc, 'ok');
      }
      send.disabled = !text;
    }

    input.addEventListener('input', update);
    shift.addEventListener('input', () => { paintRange(); update(); });
    $('#cx-clear').addEventListener('click', () => { input.value = ''; update(); input.focus(); });

    $('#cx-sha-copy').addEventListener('click', () => state.sha ? NS.util.copy(state.sha, 'SHA-256 hash') : NS.toast('Nothing to copy yet.', { type: 'info', duration: 1800 }));
    $('#cx-b64-copy').addEventListener('click', () => state.b64Ok && state.b64 ? NS.util.copy(state.b64, 'Base64 result') : NS.toast('Nothing to copy yet.', { type: 'info', duration: 1800 }));
    $('#cx-caesar-copy').addEventListener('click', () => state.cc ? NS.util.copy(state.cc, 'Caesar result') : NS.toast('Nothing to copy yet.', { type: 'info', duration: 1800 }));

    send.addEventListener('click', async () => {
      const text = input.value;
      if (!text) return;
      const hash = state.sha || await sha256Hex(text);
      const n = Number(shift.value);
      NS.sendToKanban({
        title: `Verify integrity: SHA-256 ${hash.slice(0, 12)}…`,
        description: [
          `Input: "${clip(text, 60)}" (${[...text].length} chars)`,
          `SHA-256: ${hash}`,
          `Base64 (${getB64Mode()}): ${state.b64Ok ? clip(state.b64) : 'invalid input'}`,
          `Caesar (${getCcMode()}, shift ${n}): ${clip(state.cc)}`
        ].join('\n'),
        priority: 'Medium',
        tag: 'Security',
        column: 'backlog'
      });
    });

    paintRange();
    update();
  }

  function init() {
    initPassword();
    initPlayground();
  }

  NS.Security = { init, _test: { analyze, sha256Fallback, base64Encode, base64Decode, caesar, formatDuration } };
})();
