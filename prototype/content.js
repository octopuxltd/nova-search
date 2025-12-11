// Inject a blurred header at the top of the page
(function() {
  'use strict';

  // Function to inject the blurred header with gradient blur
  function injectHeader() {
    // Check if header already exists
    if (document.getElementById('nova-search-header')) {
      return;
    }

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
    iframe.src = chrome.runtime.getURL('figma-design.html');
    
    // Wait for iframe to load and adjust height
    iframe.onload = function() {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeBody = iframeDoc.body;
        const iframeHtml = iframeDoc.documentElement;
        
        // Set iframe height to match its content
        const height = Math.max(
          iframeBody.scrollHeight,
          iframeBody.offsetHeight,
          iframeHtml.clientHeight,
          iframeHtml.scrollHeight,
          iframeHtml.offsetHeight
        );
        iframe.style.height = height + 'px';
      } catch (e) {
        // Cross-origin restrictions - use default height
        console.warn('Could not access iframe content, using default height');
      }
    };
    
    designContainer.appendChild(iframe);
    header.appendChild(designContainer);

    // Insert the header directly into the document body or html
    // Use document.documentElement to ensure it's at the top level
    if (document.body) {
      document.documentElement.insertBefore(header, document.documentElement.firstChild);
    } else {
      // If body doesn't exist yet, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.insertBefore(header, document.documentElement.firstChild);
      });
    }
  }

  // Run when the page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHeader);
  } else {
    // DOM is already ready
    injectHeader();
  }
})();

