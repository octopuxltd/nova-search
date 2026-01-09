// Background script for Nova extension

// Use browser API (Firefox) with chrome fallback
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Open mozilla.org on Firefox startup
browserAPI.runtime.onStartup.addListener(() => {
  console.log('[Nova Background] Firefox started, opening mozilla.org');
  browserAPI.tabs.create({ url: 'https://www.mozilla.org' });
});

// Also open on extension install/update
browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Nova Background] Extension installed, opening mozilla.org');
    browserAPI.tabs.create({ url: 'https://www.mozilla.org' });
  }
});

// Handle messages from content script
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Nova Background] Received message:', request);
  if (request.action === 'toggleChrome') {
    console.log('[Nova Background] Toggle chrome requested, calling native messaging');
    // Send message to native app to toggle userChrome.css
    browserAPI.runtime.sendNativeMessage('nova_toggle', { action: 'toggle' })
      .then(response => {
        console.log('[Nova Background] Native response:', response);
        sendResponse({ success: true, response });
      })
      .catch(error => {
        console.error('[Nova Background] Native messaging error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  if (request.action === 'getPixelColor') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }).then(dataUrl => {
      // Create image element
      const img = new Image();
      img.onload = function() {
        try {
          // Use OffscreenCanvas for service worker compatibility
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Get the pixel at the top middle position
          const middleX = Math.floor(canvas.width / 2);
          const topY = 0;
          const imageData = ctx.getImageData(middleX, topY, 1, 1);
          const pixel = imageData.data;
          
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];
          
          sendResponse({ color: `rgb(${r}, ${g}, ${b})` });
        } catch (error) {
          console.error('Error processing image:', error);
          sendResponse({ color: 'rgb(255, 255, 255)' });
        }
      };
      img.onerror = function() {
        console.error('Error loading image');
        sendResponse({ color: 'rgb(255, 255, 255)' });
      };
      img.src = dataUrl;
    }).catch(error => {
      console.error('Error capturing tab:', error);
      sendResponse({ color: 'rgb(255, 255, 255)' });
    });
    return true; // Keep the message channel open for async response
  }
});

