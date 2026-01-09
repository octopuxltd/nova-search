# Firefox distribution plan

## Goal
Create a self-installing package that allows users to easily install and use the Nova browser simulation extension on Firefox Developer Edition, with the ability to toggle between the simulated UI and real Firefox chrome.

## Components needed

### 1. Firefox extension
- Port the existing Chrome extension to Firefox
- Add a toggle button in the simulated browser UI
- Implement native messaging to communicate with the toggle script

### 2. Native messaging host
A shell script that:
- Auto-detects the active Firefox Developer Edition profile by parsing `profiles.ini`
- Toggles `userChrome.css` (renames to/from `.disabled`)
- Restarts Firefox Developer Edition

**Location:** `~/Library/Application Support/Mozilla/NativeMessagingHosts/`

**Manifest file:** `nova_toggle.json` pointing to the toggle script

### 3. userChrome.css
Hides Firefox's native browser chrome:
```css
#TabsToolbar, #nav-bar, #PersonalToolbar, #sidebar-header { 
  display: none !important; 
}
```

### 4. Installer script (`install.sh`)
One-time setup that:
1. Detects Firefox Developer Edition installation
2. Finds or creates the default profile
3. Creates `chrome/userChrome.css` in the profile
4. Enables `toolkit.legacyUserProfileCustomizations.stylesheets` in `user.js`
5. Registers the native messaging host
6. Installs the extension (or provides instructions)

## User experience

### Installation
```bash
./install.sh
```

### Usage
1. Open Firefox Developer Edition
2. Browse to any website
3. Simulated browser chrome appears at top
4. Click toggle button → Firefox restarts with real chrome visible
5. Click toggle button again → Firefox restarts with simulated chrome

## File structure
```
nova/
├── firefox/
│   ├── manifest.json          # Firefox extension manifest
│   ├── content.js             # Same as Chrome version
│   ├── background.js          # With native messaging
│   ├── figma-design.html
│   ├── figma-design.js
│   ├── search-suggestions-overlay.html
│   └── assets/
├── native/
│   ├── nova_toggle.sh         # Toggle script
│   └── nova_toggle.json       # Native messaging manifest
├── install/
│   ├── install.sh             # Main installer
│   └── userChrome.css         # Template CSS
└── FIREFOX-DISTRIBUTION-PLAN.md
```

## Technical notes

### Profile detection
Parse `~/Library/Application Support/Firefox Developer Edition/profiles.ini` to find:
- `[Profile*]` sections
- `Default=1` indicates the default profile
- `Path=` gives the profile folder (relative or absolute)

### Native messaging
- Firefox requires the native messaging manifest in a specific location
- The manifest must reference the script with an absolute path
- The script must be executable

### Considerations
- Firefox restart causes brief interruption (~1-2 seconds)
- User's tabs are preserved (Firefox session restore)
- Works across all Firefox Developer Edition profiles on the same Mac
