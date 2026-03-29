// src/ui/file-switcher.ts
/* file-switcher.ts — Ctrl+K map picker overlay
 * Triggered by the QuickLoad command in command.ts.
 * Fetches the map list from /catalog, shows a filterable
 * overlay. Arrow keys navigate, Enter opens, Escape closes.
 */

const STYLE = `
  #fs-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.45);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
  }
  #fs-box {
    background: var(--color-pane);
    border: 1px solid rgba(44, 32, 21, 0.2);
    border-radius: 6px;
    width: min(520px, 90vw);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #fs-input {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    font-size: 15px;
    border: none;
    border-bottom: 1px solid rgba(44, 32, 21, 0.15);
    outline: none;
    font-family: var(--font-sans);
    background: var(--color-pane);
    color: var(--color-text);
  }
  #fs-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 320px;
    overflow-y: auto;
  }
  #fs-list li a {
    display: block;
    padding: 8px 14px;
    text-decoration: none;
    color: var(--color-text);
    font-size: 14px;
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #fs-list li a:hover,
  #fs-list li a:focus {
    background: var(--color-hover);
    outline: none;
  }
  #fs-list li a.fs-active {
    background: var(--color-pane-hover);
  }
  #fs-empty {
    padding: 12px 14px;
    color: var(--color-accent);
    opacity: 0.5;
    font-size: 13px;
    font-family: var(--font-sans);
  }
`;

type MapEntry = { name: string; href: string };

let backdrop: HTMLElement | null = null;
let cachedMaps: MapEntry[] | null = null;

async function fetchMaps(): Promise<MapEntry[]> {
  if (cachedMaps) return cachedMaps;
  const res = await fetch('/catalog');
  if (!res.ok) throw new Error('catalog fetch failed: ' + res.status);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  cachedMaps = Array.from(doc.querySelectorAll('#list li')).map(li => ({
    name: (li as HTMLElement).dataset.name ?? '',
    href: li.querySelector('.view-row')?.getAttribute('href') ?? '',
  })).filter(m => m.name && m.href);
  return cachedMaps;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function activeLink(): HTMLAnchorElement | null {
  return document.querySelector('#fs-list a.fs-active');
}

function setActive(a: HTMLAnchorElement | null) {
  document.querySelectorAll('#fs-list a').forEach(el => el.classList.remove('fs-active'));
  if (a) { a.classList.add('fs-active'); a.scrollIntoView({ block: 'nearest' }); }
}

function populate(maps: MapEntry[], query: string) {
  const ul = document.getElementById('fs-list');
  if (!ul) return;
  const q = query.toLowerCase();
  const filtered = q ? maps.filter(m => m.name.toLowerCase().includes(q)) : maps;
  if (filtered.length === 0) {
    ul.innerHTML = '<li id="fs-empty">no matches</li>';
    return;
  }
  ul.innerHTML = filtered.map(m =>
    `<li><a href="${encodeURI(m.href)}" tabindex="-1">${escapeHtml(m.name)}</a></li>`
  ).join('');
  setActive(ul.querySelector('a'));
}

function hide() {
  backdrop?.remove();
  backdrop = null;
}

function show() {
  // Guard against double invocation (e.g. command system firing twice).
  if (document.getElementById('fs-backdrop')) return;
  /* inject styles once */
  if (!document.getElementById('fs-style')) {
    const tag = document.createElement('style');
    tag.id = 'fs-style';
    tag.textContent = STYLE;
    document.head.appendChild(tag);
  }

  backdrop = document.createElement('div');
  backdrop.id = 'fs-backdrop';
  backdrop.innerHTML = `
    <div id="fs-box">
      <input id="fs-input" type="text" placeholder="filter maps…" autocomplete="off" spellcheck="false">
      <ul id="fs-list"><li id="fs-empty">Loading…</li></ul>
    </div>
  `;

  /* close on backdrop click */
  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop) hide();
  });

  const input = backdrop.querySelector('#fs-input') as HTMLInputElement;
  const ul    = backdrop.querySelector('#fs-list') as HTMLUListElement;

  input.addEventListener('input', () => {
    if (cachedMaps) populate(cachedMaps, input.value);
  });

  input.addEventListener('keydown', e => {
    // Prevent all keystrokes from reaching the command system while the overlay is open.
    e.stopPropagation();

    const links = Array.from(ul.querySelectorAll<HTMLAnchorElement>('a'));
    const idx   = links.indexOf(activeLink()!);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(links[Math.min(idx + 1, links.length - 1)]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(links[Math.max(idx - 1, 0)]);
        break;
      case 'Enter':
        e.preventDefault();
        const a = activeLink();
        if (a) { hide(); location.href = a.href; }
        break;
      case 'Escape':
        hide();
        break;
    }
  });

  document.body.appendChild(backdrop);
  input.focus();

  fetchMaps()
    .then(maps => populate(maps, input.value))
    .catch(() => { ul.innerHTML = '<li id="fs-empty">failed to load maps</li>'; });
}

export function toggle() {
  backdrop?.isConnected ? hide() : show();
}
