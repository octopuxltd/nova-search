# Firefox distribution plan

## Goal
Ship a Firefox add-on that simulates the Nova UI without modifying the user's profile or using native messaging. The real browser chrome is hidden via fullscreen + about:config preferences.

## Components needed

### 1. Firefox extension
- Inject the simulated Nova toolbar and suggestions UI
- No native messaging and no profile modifications

### 2. Firefox preferences (one-time)
These are set by the user in `about:config`:
- `full-screen-api.ignore-widgets` = `true`
- `browser.fullscreen.autohide` = `true`

With these enabled, fullscreen hides the native chrome without resizing the window, making it easy to toggle the real chrome on/off with the normal fullscreen shortcut.

## User experience

### Installation
1. Install the extension (temporary add-on for development or signed XPI for distribution).
2. Set the two fullscreen preferences in `about:config`.

### Usage
1. Open any website.
2. Simulated browser chrome appears at the top.
3. Use the standard fullscreen shortcut to hide/show real Firefox chrome.

## Building the XPI
Run this from the `firefox/` folder to package the extension:

```bash
TIMESTAMP=$(date "+%H:%M  •  %d %b %Y") && \
sed -i '' "s/__BUILD_TIME__/$TIMESTAMP/" content.js && \
rm -f ../nova-extension.xpi && \
zip -r ../nova-extension.xpi * -x "*.DS_Store" && \
sed -i '' "s/$TIMESTAMP/__BUILD_TIME__/" content.js
```

This produces `nova-extension.xpi` in the repo root. Install it by opening the XPI in Firefox.

## File structure
```
nova/
├── firefox/
│   ├── manifest.json          # Firefox extension manifest
│   ├── content.js
│   ├── background.js
│   ├── figma-design.html
│   ├── figma-design.js
│   ├── search-suggestions-overlay.html
│   └── assets/
└── FIREFOX-DISTRIBUTION-PLAN.md
```

## Considerations
- Fullscreen can change page state and may affect layout for some sites.
- Users can always exit fullscreen to restore the native chrome.
