(() => {
  const parentWin = window.parent;
  const defaultFav = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect width='16' height='16' rx='2' fill='%234B3F72'/><text x='4' y='12' font-size='9' fill='white' font-family='Segoe UI'>W</text></svg>";

  function splitUrl(value) {
    if (!value) return { domain: '', rest: '' };
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      const domain = url.host || '';
      const path = (url.pathname || '/') + (url.search || '') + (url.hash || '');
      return { domain, rest: path === '/' ? '' : path };
    } catch (_) {
      // fallback: treat first space/slash as split
      const parts = value.split(/\/|\s/);
      const domain = parts.shift() || value;
      const rest = value.slice(domain.length);
      return { domain, rest };
    }
  }

  function updateGhost(text) {
    const { domain, rest } = splitUrl(text);
    const d = document.querySelector('.url-domain');
    const r = document.querySelector('.url-rest');
    if (d) d.textContent = domain;
    if (r) r.textContent = rest;
    const input = document.querySelector('.url-field');
    if (input && text !== undefined) input.value = text;
  }

  function updateTabTitlesFromPageTitle(href, providedTitle) {
    const el = document.querySelector('.tab-title-primary');
    if (!el) return;
    let title = providedTitle || document.title || '';
    if ((!title || title === '') && href) {
      try {
        const url = new URL(href);
        title = url.hostname;
      } catch (_) {
        title = href;
      }
    }
    if (!title) title = 'New tab';
    const truncated = title.length > 10 ? `${title.slice(0, 10)}…` : title;
    el.textContent = truncated || 'New tab';

    const secondary = document.querySelector('.tab-title-secondary');
    if (secondary) secondary.textContent = 'Wikipedia';
  }

  function updateFavicons(faviconUrl) {
    const fav = document.querySelector('.tab-fav-primary');
    if (fav) {
      fav.src = faviconUrl || defaultFav;
      fav.alt = 'Favicon';
    }
  }

  function sendUrlRect() {
    const urlEl = document.querySelector('.url-input');
    if (!urlEl || !parentWin) return;
    const rect = urlEl.getBoundingClientRect();
    parentWin.postMessage({ type: 'nova:url-click', rect }, '*');
  }

  function wire() {
    const input = document.querySelector('.url-field');
    const urlEl = document.querySelector('.url-input');
    updateTabTitlesFromPageTitle();
    if (urlEl) {
      urlEl.addEventListener('click', sendUrlRect);
    }
    if (input) {
      input.addEventListener('focus', sendUrlRect);
      input.addEventListener('keydown', (e) => {
        parentWin.postMessage({ type: 'nova:key', key: e.key, value: input.value }, '*');
        if (e.key === 'Enter') {
          const value = (input.value || '').trim();
          parentWin.postMessage({ type: 'nova:navigate', value }, '*');
        }
      });
      input.addEventListener('input', () => {
        parentWin.postMessage({ type: 'nova:key', key: 'input', value: input.value }, '*');
        updateGhost(input.value);
      });
    }

    // Listen for parent-sent current URL
    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'nova:url-current' && data.href) {
        updateGhost(data.href);
        updateTabTitlesFromPageTitle(data.href, data.title);
        updateFavicons(data.favicon);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();

