// Inject a blurred header at the top of the page
(function() {
  'use strict';

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
          z-index: 1000002;
          display: none;
          max-width: 1010px;
          width: calc(100% - 24px);
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
      const left = iframeRect.left + urlAreaRect.left;
      const top = iframeRect.top + urlAreaRect.bottom + 11; // move down by 11px
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${urlAreaRect.width}px`; // match URL bar width
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
          }
        }
        if (data.type === 'nova:navigate') {
          const value = (data.value || '').replace(/\s+/g, ' ').trim();
          if (!value) return;
          const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
          const target = hasScheme ? value : `https://${value}`;
          const overlay = document.getElementById('nova-suggestions-overlay');
          if (overlay) overlay.style.display = 'none';
          console.log('[Nova Content] Navigating to', target);
          window.location.href = target;
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
        try {
          const favicon = (() => {
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
          })();

          iframe.contentWindow.postMessage(
            { type: 'nova:url-current', href: window.location.href, title: document.title, favicon },
            '*'
          );
        } catch (err) {
          console.warn('[Nova Content] Failed to post current URL to iframe', err);
        }
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

