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
      height: 92px;
      z-index: 999999;
      margin: 0;
      padding: 0;
      pointer-events: none;
      overflow: hidden;
    `;

    // Create a smooth gradient blur effect using multiple layers
    // More layers = smoother gradient
    const numLayers = 10;
    const maxBlur = 20;
    
    for (let i = 0; i < numLayers; i++) {
      const layerDiv = document.createElement('div');
      const progress = i / (numLayers - 1); // 0 at top, 1 at bottom
      const blurAmount = maxBlur * (1 - progress); // Full blur at top, no blur at bottom
      const opacity = 1 - progress; // Full opacity at top, transparent at bottom
      const layerHeight = 92 / numLayers;
      
      layerDiv.style.cssText = `
        position: absolute;
        top: ${i * layerHeight}px;
        left: 0;
        width: 100%;
        height: ${layerHeight}px;
        backdrop-filter: blur(${blurAmount}px);
        -webkit-backdrop-filter: blur(${blurAmount}px);
        background-color: rgba(255, 255, 255, ${0.1 * opacity});
        opacity: ${opacity};
        pointer-events: none;
      `;
      header.appendChild(layerDiv);
    }

    // Create the centered rounded rectangle
    const rectangle = document.createElement('div');
    rectangle.style.cssText = `
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      height: 88px;
      background-color: #F4E6EF;
      border-radius: 12px;
      pointer-events: auto;
      margin: 0 auto;
    `;
    header.appendChild(rectangle);

    // Insert the header
    if (document.body) {
      document.body.insertBefore(header, document.body.firstChild);
      
      // Add margin to body to prevent content from being hidden behind the header
      document.body.style.marginTop = '92px';
    } else {
      // If body doesn't exist yet, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        document.body.insertBefore(header, document.body.firstChild);
        document.body.style.marginTop = '92px';
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

