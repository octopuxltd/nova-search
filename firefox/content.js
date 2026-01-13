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
        width: 260px;
        background: #ffffff;
        border: 1px solid #e1e3f2;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 6px;
        font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      
      // Position below and to the left of the button
      const left = iframeRect.left + buttonRect.right - 260;
      const top = iframeRect.top + buttonRect.bottom + 4;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      
      menu.innerHTML = `
        <button id="nova-menu-toggle" style="
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          background: transparent;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          color: #25052c;
          cursor: pointer;
          text-align: left;
        ">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v1A1.5 1.5 0 0 1 12.5 7h-9A1.5 1.5 0 0 1 2 5.5v-1Z" fill="#7B618F"/>
            <path d="M2 10.5A1.5 1.5 0 0 1 3.5 9h9a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-1Z" fill="#7B618F" opacity="0.4"/>
          </svg>
          Toggle real toolbar
        </button>
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
      
      // Add hover effect
      const toggleBtn = menu.querySelector('#nova-menu-toggle');
      toggleBtn.addEventListener('mouseenter', () => {
        toggleBtn.style.background = '#f1f0fb';
      });
      toggleBtn.addEventListener('mouseleave', () => {
        toggleBtn.style.background = 'transparent';
      });
      
      // Toggle action
      toggleBtn.addEventListener('click', () => {
        menu.remove();
        const api = typeof browser !== 'undefined' ? browser : chrome;
        api.runtime.sendMessage({ action: 'toggleChrome' });
      });
      
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
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }

    function wireOverlayInput(overlay) {
      const input = overlay.querySelector('.fxnova-bar-input');
      if (!input) return;
      
      // Pre-fill with current URL
      if (!input.dataset.wired) {
        input.value = window.location.href;
        input.dataset.wired = 'true';
        
        let highlightIndex = -1; // -1 means input is focused
        
        function getSelectableItems() {
          return Array.from(overlay.querySelectorAll('.fxnova-result-row, .fxnova-card'));
        }
        
        const overlayShell = overlay.querySelector('.fxnova-overlay-shell');
        
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
            }
          }
          
          if (isKeyboardNav && highlightIndex >= 0 && highlightIndex < items.length) {
            items[highlightIndex].classList.add('fxnova-keyboard-highlight');
            items[highlightIndex].scrollIntoView({ block: 'nearest' });
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
        wireMouseListeners();
        
        // Reset highlight when user types (not arrow keys)
        input.addEventListener('input', () => {
          highlightIndex = -1;
          const items = getSelectableItems();
          items.forEach(item => item.classList.remove('fxnova-keyboard-highlight'));
          if (overlayShell) overlayShell.classList.remove('fxnova-keyboard-nav');
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
      
      // Focus and select all text
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
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
        if (data.type === 'nova:toggle-chrome') {
          console.log('[Nova Content] Toggle chrome requested, sending to background');
          // Send message to background script to trigger native messaging
          const api = typeof browser !== 'undefined' ? browser : chrome;
          api.runtime.sendMessage({ action: 'toggleChrome' })
            .then(response => {
              console.log('[Nova Content] Background response:', response);
            })
            .catch(err => {
              console.error('[Nova Content] Error sending to background:', err);
            });
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

