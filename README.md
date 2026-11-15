# -NetSec--Ops--Hub
A single-page utility suite for ICT students and professionals: security and crypto tools, network diagnostics, and a sprint/incident Kanban board. Built with 100% vanilla HTML5, CSS3 and ES6+ JavaScript. No frameworks, no build step, no dependencies.

## Quick start

1. Extract the zip into a folder (keep all files together).
2. Open index.html in a modern browser (Chrome, Edge, Firefox, Safari).

That's it. It works straight from disk (file://) and also from any static server, for example:

bash
python3 -m http.server 8000   # then visit http://localhost:8000


## Project structure

| File | Purpose |
| --- | --- |
| index.html | App shell, sidebar, the three module views and the task modal |
| style.css | Design tokens, dark glassmorphism theme, animations, responsive rules |
| app.js | Shared helpers (icons, toasts, clipboard), hash router, startup |
| security.js | Password entropy analyzer, SHA-256, Base64, Caesar cipher |
| network.js | IPv4 subnet calculator and port reference |
| kanban.js | Board, drag and drop, modal editor, localStorage persistence |

Scripts are loaded as plain <script defer> tags in this order: kanban.js, security.js, network.js, app.js. They share a single window.NetSec namespace.

## Features

### Module 1: Security & Crypto Lab
- *Password Strength Analyzer*
  - Live entropy: length × log2(charset size), reduced for repeats, sequences, keyboard runs, and common words (including leetspeak variants like P@ssw0rd).
  - Glowing meter with Weak (< 40 bits or very short), Moderate (40-70) and Strong (70+) levels.
  - Crack-time estimate assuming an offline attack at 10 billion guesses per second.
  - Checklist for length, character classes and pattern avoidance.
- *Hash & Cipher Playground*
  - SHA-256 via the Web Crypto API, with a built-in pure-JS fallback when crypto.subtle is unavailable.
  - Base64 encode/decode, UTF-8 safe, accepts URL-safe input.
  - Caesar cipher with a 0-25 slider and encode/decode toggle.

### Module 2: Network & IP Tools
- *IPv4 Subnet Calculator*
  - Network ID, broadcast, usable host range, subnet mask, wildcard mask, host counts, address class and scope (private, loopback, link-local, CGNAT, multicast, public).
  - Binary octet view with network and host bits color-coded.
  - Accepts CIDR notation typed into the address field (e.g. 10.0.0.0/8), a prefix slider, and preset chips.
  - Handles /31 (point-to-point, RFC 3021) and /32 (host route) correctly.
  - Click any result card to copy it.
- *Port Reference*: 41 common ports with search, category filters, protocol badges, and Encrypted/Cleartext tags. Click a port number to copy it.

### Module 3: Sprint & Incident Kanban
- Columns: *Backlog, **In Progress, **Testing, **Done*.
- Add, edit and delete tasks (title, description, priority, column, label).
- Drag and drop between columns with a drop indicator, or use the arrow buttons (works on touch screens).
- Filter by keyword, progress bar, "Clear done", and click a description to expand it.
- Saved automatically to localStorage and synced across open tabs.
- First run seeds a few example tasks.

### Send to Kanban
Buttons in these places create a Backlog task pre-filled with the generated data:
- Password analyzer (strength metrics only; the password itself is never recorded)
- Hash & Cipher playground (input preview, SHA-256, Base64 and Caesar output)
- Subnet calculator (network, mask, range, broadcast, host count, scope)
- Each port card (the + button creates an exposure-audit task)

A toast confirms the action and offers a shortcut to the board.

## Privacy

Everything runs in your browser. Nothing is sent to a server. The only stored data is your task list in localStorage under the key netsec-ops-hub:kanban:v1. To reset the board, clear that key in your browser's developer tools (Application / Storage tab).

## Browser support

Any current evergreen browser. Requires <dialog>, CSS color-mix(), CSS custom properties and ES2020. Drag and drop uses the HTML5 API, so touch devices should use the move arrows on each card.

## Extending

- *Add a port:* append an object to the PORTS array in network.js (port, proto, service, cat, enc, desc).
- *Add a module:* add a <section class="view" id="view-xyz" hidden> and a nav link with data-view="xyz" in index.html, then register it in the VIEWS map in app.js.
- *Create tasks from your own code:* NetSec.sendToKanban({ title, description, priority, tag, column }).
- *Retheme:* edit the CSS variables at the top of style.css (--cyan, --emerald, --violet, backgrounds).

## Notes and limitations

- Crack-time and entropy figures are estimates for learning purposes, not a guarantee of security.
- Caesar cipher and Base64 are encodings or toy ciphers, not encryption. Do not use them to protect secrets.
- Never reuse a password you have tested in any online tool; this one runs locally, but good habits matter.


Made By : Chandrakumar Vishanan ( SLIATE ) HND - IT
