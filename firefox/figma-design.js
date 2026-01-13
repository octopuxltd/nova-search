(() => {
  const parentWin = window.parent;
  const defaultFav = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect width='16' height='16' rx='2' fill='%234B3F72'/><text x='4' y='12' font-size='9' fill='white' font-family='Segoe UI'>W</text></svg>";

  let currentPageTitle = '';

  function splitUrl(value) {
    if (!value) return { domain: '', rest: '' };
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      let domain = url.host || '';
      // Strip www. prefix
      if (domain.startsWith('www.')) {
        domain = domain.slice(4);
      }
      const path = (url.pathname || '/') + (url.search || '') + (url.hash || '');
      return { domain, rest: path === '/' ? '' : path };
    } catch (_) {
      // fallback: treat first space/slash as split
      const parts = value.split(/\/|\s/);
      let domain = parts.shift() || value;
      if (domain.startsWith('www.')) {
        domain = domain.slice(4);
      }
      const rest = value.slice(domain.length);
      return { domain, rest };
    }
  }

  function updateGhost(text, title) {
    const { domain, rest } = splitUrl(text);
    const d = document.querySelector('.fxnova-url-domain');
    const t = document.querySelector('.fxnova-url-title');
    const r = document.querySelector('.fxnova-url-rest');
    
    if (d) d.textContent = domain;
    if (t) {
      const pageTitle = title || currentPageTitle;
      t.textContent = pageTitle ? `\u00A0\u00A0\u2022\u00A0\u00A0${pageTitle}` : '';
    }
    if (r) r.textContent = rest;
    
    const input = document.querySelector('.fxnova-url-field');
    if (input && text !== undefined) input.value = text;
  }

  function updateTabTitlesFromPageTitle(href, providedTitle) {
    const el = document.querySelector('.fxnova-tab-title-primary');
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
    const truncated = title.length > 25 ? `${title.slice(0, 25)}…` : title;
    el.textContent = truncated || 'New tab';

    const secondary = document.querySelector('.fxnova-tab-title-secondary');
    if (secondary) secondary.textContent = 'Wikipedia';
  }

  function updateFavicons(faviconUrl) {
    const fav = document.querySelector('.fxnova-tab-fav-primary');
    if (fav) {
      fav.src = faviconUrl || defaultFav;
      fav.alt = 'Favicon';
    }
  }

  function sendUrlRect() {
    const urlEl = document.querySelector('.fxnova-url-input');
    if (!urlEl || !parentWin) return;
    const rect = urlEl.getBoundingClientRect();
    parentWin.postMessage({ type: 'nova:url-click', rect }, '*');
  }

  function wire() {
    const input = document.querySelector('.fxnova-url-field');
    const urlEl = document.querySelector('.fxnova-url-input');
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
        updateGhost(input.value, currentPageTitle);
      });
    }

    // Listen for parent-sent current URL
    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'nova:url-current' && data.href) {
        currentPageTitle = data.title || '';
        updateGhost(data.href, data.title);
        updateTabTitlesFromPageTitle(data.href, data.title);
        updateFavicons(data.favicon);
      }
      if (data.type === 'nova:nav-state') {
        // Update back/forward button states
        const backBtn = document.getElementById('back-btn');
        const forwardBtn = document.getElementById('forward-btn');
        if (backBtn) {
          backBtn.classList.toggle('fxnova-inactive', !data.canGoBack);
        }
        if (forwardBtn) {
          forwardBtn.classList.toggle('fxnova-inactive', !data.canGoForward);
        }
      }
    });

    // App menu - toggle in parent page
    const appMenuBtn = document.getElementById('app-menu-btn');
    console.log('[Nova Iframe] App menu button found:', !!appMenuBtn);
    
    if (appMenuBtn) {
      appMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = appMenuBtn.getBoundingClientRect();
        parentWin.postMessage({ 
          type: 'nova:toggle-extension-menu', 
          rect
        }, '*');
      });
    }
    
    // Close extension menu when clicking anywhere else in the toolbar
    document.addEventListener('click', () => {
      parentWin.postMessage({ type: 'nova:close-extension-menu' }, '*');
    });
    
    // Puzzle piece button - no longer used for menu
    const toggleBtn = document.getElementById('toggle-chrome-btn');
    console.log('[Nova Iframe] Toggle button found:', !!toggleBtn);

    // Reload button
    const reloadBtn = document.getElementById('reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        parentWin.postMessage({ type: 'nova:reload' }, '*');
      });
    }

    // Back button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        parentWin.postMessage({ type: 'nova:back' }, '*');
      });
    }

    // Forward button
    const forwardBtn = document.getElementById('forward-btn');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        parentWin.postMessage({ type: 'nova:forward' }, '*');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
