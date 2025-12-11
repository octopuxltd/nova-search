// Background script to capture page and detect pixel color
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

