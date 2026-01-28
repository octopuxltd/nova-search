// Inject a blurred header at the top of the page
(function() {
  'use strict';

  // Initialize navigation state tracking on first load
  (function initNavState() {
    // Check if this is a fresh tab/window or navigation
    const navIndex = sessionStorage.getItem('nova-nav-index');
    if (navIndex === null) {
      // First page in this session - initialize at 0
      sessionStorage.setItem('nova-nav-index', '0');
      sessionStorage.setItem('nova-nav-length', '1');
    }
    // Detect if we arrived via regular link click (not back/forward)
    // Performance navigation type: 'navigate' for new nav, 'back_forward' for history nav
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    if (navType === 'navigate' || navType === 'reload') {
      // Check if we need to update state (for link clicks not from our extension)
      const lastNavType = sessionStorage.getItem('nova-last-nav-type');
      if (lastNavType !== 'controlled') {
        // Regular link click - increment state
        const currentIndex = parseInt(sessionStorage.getItem('nova-nav-index') || '0', 10);
        // Only increment if not first page
        if (currentIndex > 0 || sessionStorage.getItem('nova-nav-length') !== '1') {
          const newIndex = currentIndex + 1;
          sessionStorage.setItem('nova-nav-index', String(newIndex));
          sessionStorage.setItem('nova-nav-length', String(newIndex + 1));
        }
      }
    }
    // Clear the controlled flag
    sessionStorage.removeItem('nova-last-nav-type');
  })();

  // Preload padding to reduce layout shift before header renders
  (function applyPreloadPadding() {
    if (!document.getElementById('nova-preload-style')) {
      const preloadStyle = document.createElement('style');
      preloadStyle.id = 'nova-preload-style';
      preloadStyle.textContent = `
        body { padding-top: 96px !important; }
      `;
      document.documentElement.appendChild(preloadStyle);
    }
  })();

  console.log('[Nova Content] Content script loaded');
  console.log('[Nova Content] Document ready state:', document.readyState);

  let suggestionDataPromise = null;

  function loadSuggestionData() {
    if (suggestionDataPromise) return suggestionDataPromise;
    const dataUrl = chrome.runtime.getURL('assets/suggestion-words.json');
    suggestionDataPromise = fetch(dataUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Suggestion data fetch failed: ${res.status}`);
        return res.json();
      })
      .catch(err => {
        console.error('[Nova Content] Failed to load suggestion data', err);
        return {};
      });
    return suggestionDataPromise;
  }

  function extractLetters(value) {
    return (value || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const HISTORY_STORAGE_KEY = 'nova-search-history-v1';
  const HISTORY_LIMIT = 500;
  const MAX_SUGGESTIONS = 10;
  let historyDataPromise = null;
  let historyCache = null;

  function getStorageAPI() {
    return (typeof browser !== 'undefined' ? browser : chrome).storage?.local;
  }

  function storageGet(key) {
    const storage = getStorageAPI();
    if (!storage) return Promise.resolve({});
    try {
      const result = storage.get(key);
      if (result && typeof result.then === 'function') return result;
    } catch (err) {
      console.warn('[Nova Content] Storage get failed', err);
    }
    return new Promise((resolve) => {
      storage.get(key, (items) => {
        if (chrome.runtime?.lastError) {
          console.warn('[Nova Content] Storage get error', chrome.runtime.lastError);
          resolve({});
          return;
        }
        resolve(items || {});
      });
    });
  }

  function storageSet(payload) {
    const storage = getStorageAPI();
    if (!storage) return Promise.resolve();
    try {
      const result = storage.set(payload);
      if (result && typeof result.then === 'function') return result;
    } catch (err) {
      console.warn('[Nova Content] Storage set failed', err);
    }
    return new Promise((resolve) => {
      storage.set(payload, () => {
        if (chrome.runtime?.lastError) {
          console.warn('[Nova Content] Storage set error', chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  function createEmptyHistory() {
    return { version: 1, items: {} };
  }

  function normalizeHistory(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyHistory();
    if (raw.version !== 1 || !raw.items || typeof raw.items !== 'object') {
      return createEmptyHistory();
    }
    return raw;
  }

  function pruneHistory(history) {
    const entries = Object.values(history.items || {});
    if (entries.length <= HISTORY_LIMIT) return history;
    entries.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    const trimmed = entries.slice(0, HISTORY_LIMIT);
    const items = {};
    trimmed.forEach((entry) => {
      if (!entry) return;
      const fallbackKey = entry.term ? entry.term.toLowerCase() : null;
      const key = entry.key || fallbackKey;
      if (!key) return;
      items[key] = { ...entry, key };
    });
    return { ...history, items };
  }

  function loadSearchHistory() {
    if (historyDataPromise) return historyDataPromise;
    historyDataPromise = storageGet(HISTORY_STORAGE_KEY)
      .then((data) => {
        const history = normalizeHistory(data[HISTORY_STORAGE_KEY]);
        historyCache = history;
        return history;
      })
      .catch((err) => {
        console.warn('[Nova Content] Failed to load search history', err);
        historyCache = createEmptyHistory();
        return historyCache;
      });
    return historyDataPromise;
  }

  function updateHistoryCache(history) {
    historyCache = history;
    historyDataPromise = Promise.resolve(history);
  }

  async function saveSearchHistory(history) {
    await storageSet({ [HISTORY_STORAGE_KEY]: history });
  }

  async function recordSearchTerm(value) {
    const trimmed = (value || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    const normalized = extractLetters(trimmed);
    if (!normalized) return;
    const history = historyCache || await loadSearchHistory();
    const key = trimmed.toLowerCase();
    const now = Date.now();
    const existing = history.items[key];
    const nextEntry = {
      key,
      term: trimmed,
      normalized,
      count: existing ? (existing.count || 0) + 1 : 1,
      lastUsed: now
    };
    history.items[key] = nextEntry;
    const pruned = pruneHistory(history);
    await saveSearchHistory(pruned);
    updateHistoryCache(pruned);
  }

  function getHistoryMatches(lettersOnly, history) {
    if (!lettersOnly) return [];
    const entries = Object.values(history.items || {});
    const filtered = entries.filter(entry => {
      const normalized = entry?.normalized || extractLetters(entry?.term || '');
      return normalized.startsWith(lettersOnly);
    });
    filtered.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    return filtered;
  }

  function getSuggestionIcon(type) {
    if (type === 'history') {
      return `
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
          <circle cx="8" cy="8" r="6" stroke="#7B618F" stroke-width="1.2"/>
          <path d="M8 4.5V8.3L10.3 9.7" stroke="#7B618F" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
        <path d="M7.1 1a6.1 6.1 0 1 1 0 12.2A6.1 6.1 0 0 1 7.1 1Zm0 1.3a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z" fill="#7B618F"/>
        <path d="m10.8 10.8 3 3" stroke="#7B618F" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    `;
  }

  // Function to inject the blurred header with gradient blur
  function injectHeader() {
    console.log('[Nova Content] injectHeader called');
    
    // Check if header already exists
    if (document.getElementById('nova-search-header')) {
      console.log('[Nova Content] Header already exists, skipping');
      return;
    }
    
    console.log('[Nova Content] Creating new header...');

    // Create the header container
    const header = document.createElement('div');
    header.id = 'nova-search-header';
    header.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 999999;
      margin: 0;
      padding: 0;
      pointer-events: none;
      overflow: visible;
      min-height: 96px;
    `;

    // Create container for Figma design content
    const designContainer = document.createElement('div');
    designContainer.style.cssText = `
      position: relative;
      top: 4px;
      left: 4px;
      right: 4px;
      margin: 0 auto;
      border-radius: 12px;
      pointer-events: auto;
      overflow: hidden;
    `;
    
    // Create a smooth gradient blur effect using multiple layers
    // The blur will cover the entire header height dynamically
    const numLayers = 10;
    const maxBlur = 20;
    
    // Create blur layers that cover the full height using percentages
    for (let i = 0; i < numLayers; i++) {
      const layerDiv = document.createElement('div');
      const progress = i / (numLayers - 1); // 0 at top, 1 at bottom
      const blurAmount = maxBlur * (1 - progress); // Full blur at top, no blur at bottom
      const opacity = 1 - progress; // Full opacity at top, transparent at bottom
      const topPercent = (i / numLayers) * 100;
      const heightPercent = 100 / numLayers;
      
      layerDiv.style.cssText = `
        position: absolute;
        top: ${topPercent}%;
        left: 0;
        width: 100%;
        height: ${heightPercent}%;
        backdrop-filter: blur(${blurAmount}px);
        -webkit-backdrop-filter: blur(${blurAmount}px);
        background-color: rgba(255, 255, 255, ${0.1 * opacity});
        opacity: ${opacity};
        pointer-events: none;
      `;
      header.appendChild(layerDiv);
    }
    
    // Create an iframe to load the HTML content
    const iframe = document.createElement('iframe');
    iframe.setAttribute('scrolling', 'no');
    iframe.style.cssText = `
      width: 100%;
      border: none;
      border-radius: 12px;
      overflow: hidden;
      pointer-events: auto;
      display: block;
    `;
    const iframeUrl = chrome.runtime.getURL('figma-design.html');
    iframe.src = iframeUrl;
    console.log('[Nova Content] Iframe src set to:', iframeUrl);
    
    // Function to update body padding based on header height
    function updateBodyPadding() {
      if (document.body) {
        // Remove preload padding style if present
        const preloadStyle = document.getElementById('nova-preload-style');
        if (preloadStyle) preloadStyle.remove();

        // Get the actual header height (including all content)
        const headerRect = header.getBoundingClientRect();
        const headerHeight = headerRect.height;
        console.log('[Nova Content] Header actual height:', headerHeight + 'px');
        
        // Apply padding to push content down
        document.body.style.paddingTop = headerHeight + 'px';
        console.log('[Nova Content] Body padding-top set to:', headerHeight + 'px');
      }
    }
    
    // Apply initial padding immediately (will be updated when iframe loads)
    const defaultHeight = 96; // Default header height estimate
    if (document.body) {
      document.body.style.paddingTop = defaultHeight + 'px';
      console.log('[Nova Content] Initial body padding-top set to:', defaultHeight + 'px');
    }
    
    function ensureOverlayContainer() {
      let overlay = document.getElementById('nova-suggestions-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'nova-suggestions-overlay';
        overlay.style.cssText = `
          position: fixed;
          z-index: 2147483647;
          display: none;
          pointer-events: auto;
        `;
        document.body.appendChild(overlay);
      }
      return overlay;
    }

    async function loadOverlayHTML() {
      const overlay = ensureOverlayContainer();
      if (overlay.dataset.loaded === 'true') return overlay;
      const overlayUrl = chrome.runtime.getURL('search-suggestions-overlay.html');
      try {
        const res = await fetch(overlayUrl);
        if (!res.ok) throw new Error(`Overlay fetch failed: ${res.status}`);
        let html = await res.text();
        // Rewrite relative asset paths to extension URLs
        const assetsBase = chrome.runtime.getURL('assets/');
        html = html.replace(/src="assets\//g, `src="${assetsBase}`);
        overlay.innerHTML = html;
        const suggestionsList = overlay.querySelector('[data-nova-suggestions="true"]');
        if (suggestionsList && !suggestionsList.dataset.defaultHtml) {
          suggestionsList.dataset.defaultHtml = suggestionsList.innerHTML;
        }
        overlay.dataset.loaded = 'true';
      } catch (err) {
        console.error('[Nova Content] Failed to load overlay HTML', err);
      }
      return overlay;
    }

    function positionOverlay(overlay, urlAreaRect, iframeRect) {
      const left = iframeRect.left + urlAreaRect.left - 8; // 8px to the left
      const top = iframeRect.top + urlAreaRect.bottom + 11 - 52; // moved up by 52px
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${urlAreaRect.width}px`; // match URL bar width
    }

    function showExtensionMenu(buttonRect, iframeRect) {
      const timestamp = '__BUILD_TIME__';
      // Remove existing menu if any
      let menu = document.getElementById('nova-extension-menu');
      if (menu) {
        menu.remove();
      }
      
      // Create menu
      menu = document.createElement('div');
      menu.id = 'nova-extension-menu';
      menu.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        width: 310px;
        background: #ffffff;
        border: 1px solid #e1e3f2;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 6px;
        font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      
      // Position below and to the left of the button
      const left = iframeRect.left + buttonRect.right - 310;
      const top = iframeRect.top + buttonRect.bottom + 4;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      
      const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
      const fullscreenShortcut = isMac ? 'CMD+CTRL+F' : 'F11';

      menu.innerHTML = `
        <div style="padding: 8px 12px; font-size: 11px; color: #5e606d; line-height: 1.4;">
          <div style="font-weight: 600; color: #25052c; margin-bottom: 6px;">
            Nova prototype mode (i.e. hide Firefox's classic UI)
          </div>
          <div style="display: grid; gap: 4px;">
            <div>1. Go to <code style="font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">about:config</code></div>
            <div>2. Set <code style="font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">full-screen-api.ignore-widgets</code> to true</div>
            <div>3. Set <code style="font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">browser.fullscreen.autohide</code> to true</div>
            <div>4. Press <code style="font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${fullscreenShortcut}</code> to show/hide the classic UI</div>
          </div>
        </div>
        <div style="height: 1px; background: #e1e3f2; margin: 6px 0;"></div>
        <div style="padding: 8px 12px; font-size: 11px; color: #5e606d; line-height: 1.4;">
          This is a simulation of the Search & Suggest features in the Nova redesign style. Questions? Contact Paul Annett on Slack (or email pannett@mozilla.com)
        </div>
        <div style="height: 1px; background: #e1e3f2; margin: 6px 0;"></div>
        <div style="padding: 8px 12px; font-size: 11px; color: #5e606d;">
          Extension updated:<br>${timestamp}
        </div>
      `;
      
      document.body.appendChild(menu);
      
      // Close on click outside
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 0);
    }

    // Update nav state when navigating to a new page (not back/forward)
    function incrementNavState() {
      const navIndex = parseInt(sessionStorage.getItem('nova-nav-index') || '0', 10);
      const newIndex = navIndex + 1;
      sessionStorage.setItem('nova-nav-index', String(newIndex));
      sessionStorage.setItem('nova-nav-length', String(newIndex + 1)); // Truncate forward history
      sessionStorage.setItem('nova-last-nav-type', 'controlled'); // Mark as controlled navigation
    }

    function navigateTo(value) {
      const trimmed = (value || '').replace(/\s+/g, ' ').trim();
      if (!trimmed) return;
      
      const overlay = document.getElementById('nova-suggestions-overlay');
      if (overlay) overlay.style.display = 'none';
      
      // Mark this as a new navigation (not back/forward)
      incrementNavState();
      
      // Check if it has a scheme (http://, https://, etc.)
      const hasScheme = /^https?:\/\//i.test(trimmed);
      if (hasScheme) {
        window.location.href = trimmed;
        return;
      }
      
      // Check if it looks like a URL (domain.tld pattern, no spaces)
      const looksLikeUrl = /^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ');
      if (looksLikeUrl) {
        window.location.href = `https://${trimmed}`;
        return;
      }
      
      // Otherwise, Google search
      recordSearchTerm(trimmed);
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }

    function wireOverlayInput(overlay) {
      const input = overlay.querySelector('.fxnova-bar-input');
      const suggestionsList = overlay.querySelector('[data-nova-suggestions="true"]');
      const defaultSuggestionsHtml = suggestionsList?.dataset.defaultHtml || '';
      if (!input) return;
      
      let highlightIndex = -1; // -1 means input is focused
      const overlayShell = overlay.querySelector('.fxnova-overlay-shell');

      function getSelectableItems() {
        return Array.from(overlay.querySelectorAll('.fxnova-result-row, .fxnova-card'));
      }

      function updateHighlight(newIndex, isKeyboardNav = true) {
        const items = getSelectableItems();
        // Remove existing keyboard highlight
        items.forEach(item => item.classList.remove('fxnova-keyboard-highlight'));
        
        highlightIndex = newIndex;
        
        // Toggle keyboard-nav class to suppress hover styles
        if (overlayShell) {
          if (isKeyboardNav) {
            overlayShell.classList.add('fxnova-keyboard-nav');
          } else {
            overlayShell.classList.remove('fxnova-keyboard-nav');
            overlayShell.removeAttribute('data-keyboard-preview');
          }
        }
        
        let previewId = null;
        if (isKeyboardNav && highlightIndex >= 0 && highlightIndex < items.length) {
          const item = items[highlightIndex];
          item.classList.add('fxnova-keyboard-highlight');
          item.scrollIntoView({ block: 'nearest' });
          if (item.classList.contains('fxnova-card')) {
            previewId = item.getAttribute('data-preview');
          }
        }
        
        if (overlayShell && isKeyboardNav) {
          if (previewId) {
            overlayShell.setAttribute('data-keyboard-preview', previewId);
          } else {
            overlayShell.removeAttribute('data-keyboard-preview');
          }
        }
      }

      // Add mouse listeners to sync highlight index with hover
      function wireMouseListeners() {
        const items = getSelectableItems();
        items.forEach((item, index) => {
          item.addEventListener('mouseenter', () => {
            // Clear keyboard highlight and update index to match hovered item
            updateHighlight(index, false);
          });
        });
      }

      function getSuggestionsForInput(lettersOnly, data) {
        if (!lettersOnly) return [];
        if (lettersOnly.length === 1) {
          const prefixes = Object.keys(data)
            .filter(key => key.startsWith(lettersOnly))
            .sort();
          return prefixes.map(prefix => data[prefix]?.[0]).filter(Boolean);
        }
        const prefix = lettersOnly.slice(0, 2);
        const list = Array.isArray(data[prefix]) ? data[prefix] : [];
        if (lettersOnly.length <= 2) return list.slice();
        const filtered = list.filter(item => item.startsWith(lettersOnly));
        return filtered.length ? filtered : list;
      }

      function formatSuggestionLabel(term, lettersOnly) {
        if (!lettersOnly) return escapeHtml(term);
        const normalizedItem = term.toLowerCase();
        const normalizedLetters = lettersOnly.toLowerCase();
        if (!normalizedItem.startsWith(normalizedLetters)) {
          return escapeHtml(term);
        }
        const safeLength = Math.min(lettersOnly.length, term.length);
        const matched = term.slice(0, safeLength);
        const remainder = term.slice(safeLength);
        return `<span class="fxnova-typed-chars">${escapeHtml(matched)}</span>${escapeHtml(remainder)}`;
      }

      function buildSuggestionItems(lettersOnly, history, data) {
        const historyMatches = getHistoryMatches(lettersOnly, history);
        const suggestionMatches = getSuggestionsForInput(lettersOnly, data);
        const results = [];
        const seen = new Set();

        historyMatches.forEach((entry) => {
          const key = entry.normalized || extractLetters(entry.term);
          if (!key || seen.has(key)) return;
          seen.add(key);
          results.push({ term: entry.term, type: 'history' });
        });

        suggestionMatches.forEach((term) => {
          const key = extractLetters(term);
          if (!key || seen.has(key)) return;
          seen.add(key);
          results.push({ term, type: 'suggestion' });
        });

        return results.slice(0, MAX_SUGGESTIONS);
      }

      function renderSuggestions(items, lettersOnly) {
        if (!suggestionsList) return;
        if (!items.length) {
          suggestionsList.innerHTML = `
            <div class="fxnova-result-row fxnova-google-suggestion">
              <div class="fxnova-result-icon" style="width:28px;height:28px;">
                ${getSuggestionIcon('suggestion')}
              </div>
              <div class="fxnova-result-content">
                <p class="fxnova-result-title" style="font-weight:600;">No suggestions found</p>
                <p class="fxnova-result-meta"><span class="fxnova-meta-dot">·</span>Search with Google</p>
              </div>
            </div>
          `;
          wireMouseListeners();
          return;
        }

        const rows = items.map(item => `
          <div class="fxnova-result-row fxnova-google-suggestion" data-nova-suggestion="${escapeHtml(item.term)}">
            <div class="fxnova-result-icon" style="width:28px;height:28px;">
              ${getSuggestionIcon(item.type)}
            </div>
            <div class="fxnova-result-content">
              <p class="fxnova-result-title" style="font-weight:400;">${formatSuggestionLabel(item.term, lettersOnly)}</p>
              <p class="fxnova-result-meta"><span class="fxnova-meta-dot">·</span>Search with Google</p>
            </div>
          </div>
        `).join('');

        suggestionsList.innerHTML = `
          ${rows}
        `;
        wireMouseListeners();
        overlay.querySelectorAll('[data-nova-suggestion]').forEach((row) => {
          row.addEventListener('click', () => {
            const value = row.dataset.novaSuggestion;
            if (value) navigateTo(value);
          });
        });
      }

      async function updateSuggestions(value) {
        if (!suggestionsList) return;
        const lettersOnly = extractLetters(value);
        if (!lettersOnly) {
          suggestionsList.innerHTML = defaultSuggestionsHtml;
          wireMouseListeners();
          return;
        }
        const [data, history] = await Promise.all([
          loadSuggestionData(),
          loadSearchHistory()
        ]);
        const suggestions = buildSuggestionItems(lettersOnly, history, data);
        renderSuggestions(suggestions, lettersOnly);
      }

      if (!input.dataset.wired) {
        input.dataset.wired = 'true';
        
        // Reset highlight when user types (not arrow keys)
        input.addEventListener('input', () => {
          highlightIndex = -1;
          const items = getSelectableItems();
          items.forEach(item => item.classList.remove('fxnova-keyboard-highlight'));
          if (overlayShell) {
            overlayShell.classList.remove('fxnova-keyboard-nav');
            overlayShell.removeAttribute('data-keyboard-preview');
          }
          updateSuggestions(input.value);
        });
        
        // Handle keyboard navigation
        input.addEventListener('keydown', (e) => {
          const items = getSelectableItems();
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (highlightIndex < items.length - 1) {
              updateHighlight(highlightIndex + 1);
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlightIndex > -1) {
              updateHighlight(highlightIndex - 1);
            }
            if (highlightIndex === -1) {
              input.focus();
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            console.log('[Nova Content] Enter pressed, highlightIndex:', highlightIndex, 'value:', input.value);
            if (highlightIndex >= 0 && highlightIndex < items.length) {
              // Trigger click on highlighted item
              items[highlightIndex].click();
            } else {
              navigateTo(input.value);
            }
          } else if (e.key === 'Escape') {
            overlay.style.display = 'none';
            highlightIndex = -1;
            updateHighlight(-1);
          }
        });
        
        // Also listen on overlay for arrow keys when items are highlighted
        overlay.addEventListener('keydown', (e) => {
          if (e.target === input) return; // Already handled above
          
          const items = getSelectableItems();
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (highlightIndex < items.length - 1) {
              updateHighlight(highlightIndex + 1);
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlightIndex > -1) {
              updateHighlight(highlightIndex - 1);
            }
            if (highlightIndex === -1) {
              input.focus();
            }
          } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            items[highlightIndex].click();
          } else if (e.key === 'Escape') {
            overlay.style.display = 'none';
            highlightIndex = -1;
            updateHighlight(-1);
          }
        });
        
        // Reset highlight when overlay is hidden
        const observer = new MutationObserver(() => {
          if (overlay.style.display === 'none') {
            highlightIndex = -1;
            updateHighlight(-1);
          }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
      }
      
      // Pre-fill with current URL on every open
      const initialValue = window.location.href.replace(/^https?:\/\//i, '');
      input.value = initialValue;
      
      // Reset highlight state and keyboard-nav styling on open
      highlightIndex = -1;
      const items = getSelectableItems();
      items.forEach(item => item.classList.remove('fxnova-keyboard-highlight'));
      if (overlayShell) {
        overlayShell.classList.remove('fxnova-keyboard-nav');
        overlayShell.removeAttribute('data-keyboard-preview');
      }

      // Focus, select all, but keep scroll at start
      setTimeout(() => {
        input.focus();
        input.select();
        requestAnimationFrame(() => {
          input.scrollLeft = 0;
        });
      }, 0);
      updateSuggestions('');
    }

    // Show/hide overlay driven by messages from iframe
    function setupMessageBridge(iframe) {
      const handleMessage = async (event) => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data || {};
        if (data.type === 'nova:key') {
          console.log('[Nova Content] key event:', data.key, 'value:', data.value);
        }
        if (data.type === 'nova:url-click') {
          const overlay = await loadOverlayHTML();
          const iframeRect = iframe.getBoundingClientRect();
          if (data.rect) {
            positionOverlay(overlay, data.rect, iframeRect);
            overlay.style.display = 'block';
            // Wire up and focus the overlay input
            wireOverlayInput(overlay);
          }
        }
        if (data.type === 'nova:toggle-extension-menu') {
          const menu = document.getElementById('nova-extension-menu');
          if (menu) {
            menu.remove();
          } else {
            const iframeRect = iframe.getBoundingClientRect();
            showExtensionMenu(data.rect, iframeRect);
          }
        }
        if (data.type === 'nova:close-extension-menu') {
          const menu = document.getElementById('nova-extension-menu');
          if (menu) menu.remove();
        }
        if (data.type === 'nova:reload') {
          window.location.reload();
        }
        if (data.type === 'nova:back') {
          // Decrement nav index before going back
          const navIndex = parseInt(sessionStorage.getItem('nova-nav-index') || '0', 10);
          if (navIndex > 0) {
            sessionStorage.setItem('nova-nav-index', String(navIndex - 1));
          }
          window.history.back();
        }
        if (data.type === 'nova:forward') {
          // Increment nav index before going forward
          const navIndex = parseInt(sessionStorage.getItem('nova-nav-index') || '0', 10);
          const navLength = parseInt(sessionStorage.getItem('nova-nav-length') || '1', 10);
          if (navIndex < navLength - 1) {
            sessionStorage.setItem('nova-nav-index', String(navIndex + 1));
          }
          window.history.forward();
        }
      };
      window.addEventListener('message', handleMessage);

      // Hide overlay on document click (outside)
      const hideOverlay = (event) => {
        const overlay = document.getElementById('nova-suggestions-overlay');
        if (!overlay) return;
        const target = event.target;
        const insideOverlay = overlay.contains(target);
        const insideIframe = iframe.contains(target);
        if (!insideOverlay && !insideIframe) {
          overlay.style.display = 'none';
        }
      };
      document.addEventListener('click', hideOverlay);
    }

    // Function to get current favicon
    function getFavicon() {
      try {
        const links = Array.from(
          document.querySelectorAll(
            'link[rel~="icon"], link[rel="icon"], link[rel="shortcut icon"], link[rel="mask-icon"]'
          )
        );
        if (links.length) {
          const href = links[0].getAttribute('href');
          if (href) return new URL(href, document.baseURI).href;
        }
      } catch (_) {}
      try {
        return new URL('/favicon.ico', window.location.origin).href;
      } catch (_) {
        return '';
      }
    }
    
    // Navigation state tracking
    function getNavState() {
      // Can go back if we have history entries before this one
      // We track this by: history.length > 1 AND we're not at the start
      const navIndex = parseInt(sessionStorage.getItem('nova-nav-index') || '0', 10);
      const navLength = parseInt(sessionStorage.getItem('nova-nav-length') || '1', 10);
      
      const canGoBack = navIndex > 0;
      const canGoForward = navIndex < navLength - 1;
      
      return { canGoBack, canGoForward };
    }
    
    function sendNavStateToIframe() {
      try {
        const state = getNavState();
        iframe.contentWindow.postMessage({ type: 'nova:nav-state', ...state }, '*');
      } catch (err) {
        console.warn('[Nova Content] Failed to post nav state to iframe', err);
      }
    }

    // Function to send current URL/title to iframe
    function sendUrlToIframe() {
      try {
        iframe.contentWindow.postMessage(
          { type: 'nova:url-current', href: window.location.href, title: document.title, favicon: getFavicon() },
          '*'
        );
        sendNavStateToIframe();
      } catch (err) {
        console.warn('[Nova Content] Failed to post current URL to iframe', err);
      }
    }
    
    // Listen for SPA navigation (History API)
    function setupSpaListeners() {
      // Listen for back/forward navigation
      window.addEventListener('popstate', () => {
        console.log('[Nova Content] popstate detected');
        // popstate fires for back/forward, nav state was already updated before the navigation
        sendUrlToIframe();
      });
      
      // Listen for regular link clicks to update nav state
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link && link.href && !link.href.startsWith('javascript:')) {
          // About to navigate via link click - increment nav state
          incrementNavState();
        }
      }, true);
      
      // Override pushState and replaceState to detect SPA navigation
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        originalPushState.apply(this, args);
        console.log('[Nova Content] pushState detected');
        setTimeout(sendUrlToIframe, 0);
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        console.log('[Nova Content] replaceState detected');
        setTimeout(sendUrlToIframe, 0);
      };
      
      // Watch for title changes
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const titleObserver = new MutationObserver(() => {
          console.log('[Nova Content] Title changed');
          sendUrlToIframe();
        });
        titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    }

    // Wait for iframe to load and adjust height + overlay wiring
    iframe.onload = function() {
      console.log('[Nova Content] Iframe loaded');
      try {
        // Even if cross-origin, we can still set height using defaults and wire bridge
        // Update padding after next tick
        setTimeout(updateBodyPadding, 0);

        // Wire overlay + navigation via message bridge
        setupMessageBridge(iframe);

        // Send current page URL to iframe for display
        sendUrlToIframe();
        
        // Setup listeners for SPA navigation
        setupSpaListeners();
      } catch (e) {
        console.warn('[Nova Content] Could not access iframe content, using default height', e);
        setTimeout(updateBodyPadding, 0);
      }
    };
    
    designContainer.appendChild(iframe);
    header.appendChild(designContainer);

    // Insert the header directly into the document body or html
    // Use document.documentElement to ensure it's at the top level
    if (document.body) {
      document.documentElement.insertBefore(header, document.documentElement.firstChild);
      console.log('[Nova Content] Header inserted into document');
    } else {
      // If body doesn't exist yet, wait for it
      console.log('[Nova Content] Body not ready, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.insertBefore(header, document.documentElement.firstChild);
        console.log('[Nova Content] Header inserted into document (after DOMContentLoaded)');
      });
    }
    
    console.log('[Nova Content] Header injection complete');
  }

  // Run when the page is ready
  // Attempt immediate injection; injectHeader handles DOMContentLoaded fallback internally
    injectHeader();
})();

