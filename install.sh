#!/bin/bash
# Nova Extension Installer for Firefox Developer Edition
# This script sets up native messaging and userChrome.css

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$SCRIPT_DIR/native"

echo "🦊 Nova Extension Installer"
echo "=========================="
echo ""

# 1. Install native messaging host
echo "📦 Installing native messaging host..."

# Firefox native messaging hosts location on macOS
NATIVE_HOSTS_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
mkdir -p "$NATIVE_HOSTS_DIR"

# Update the manifest with the correct absolute path
TOGGLE_SCRIPT="$NATIVE_DIR/nova_toggle.py"
cat > "$NATIVE_HOSTS_DIR/nova_toggle.json" << EOF
{
  "name": "nova_toggle",
  "description": "Toggle Firefox userChrome.css for Nova extension",
  "path": "$TOGGLE_SCRIPT",
  "type": "stdio",
  "allowed_extensions": ["nova@octopuxltd.com"]
}
EOF

echo "   ✓ Native messaging host registered"

# 2. Make sure the toggle script is executable
chmod +x "$TOGGLE_SCRIPT"
echo "   ✓ Toggle script is executable"

# 3. Find Firefox profile and set up userChrome.css
echo ""
echo "📁 Setting up userChrome.css..."

# Look for Firefox Developer Edition profiles
PROFILES_INI="$HOME/Library/Application Support/Firefox Developer Edition/profiles.ini"
if [ ! -f "$PROFILES_INI" ]; then
    PROFILES_INI="$HOME/Library/Application Support/Firefox/profiles.ini"
fi

if [ -f "$PROFILES_INI" ]; then
    # Find the default profile path (simple grep approach)
    PROFILE_PATH=$(grep -A5 "Default=1" "$PROFILES_INI" | grep "Path=" | head -1 | cut -d'=' -f2)
    
    if [ -z "$PROFILE_PATH" ]; then
        # Fallback: look for dev-edition-default
        PROFILE_PATH=$(grep "Path=.*dev-edition" "$PROFILES_INI" | head -1 | cut -d'=' -f2)
    fi
    
    if [ -n "$PROFILE_PATH" ]; then
        # Check if relative path
        if [[ "$PROFILE_PATH" != /* ]]; then
            PROFILE_DIR="$(dirname "$PROFILES_INI")/$PROFILE_PATH"
        else
            PROFILE_DIR="$PROFILE_PATH"
        fi
        
        CHROME_DIR="$PROFILE_DIR/chrome"
        mkdir -p "$CHROME_DIR"
        
        USER_CHROME="$CHROME_DIR/userChrome.css"
        
        if [ ! -f "$USER_CHROME" ] && [ ! -f "$USER_CHROME.disabled" ]; then
            cat > "$USER_CHROME.disabled" << 'EOF'
/* Nova userChrome.css - Hides Firefox browser chrome */
#TabsToolbar, #nav-bar, #PersonalToolbar, #sidebar-header { 
  display: none !important; 
}
EOF
            echo "   ✓ Created userChrome.css (disabled by default)"
        else
            echo "   ✓ userChrome.css already exists"
        fi
        
        # Enable userChrome.css in Firefox preferences
        USER_JS="$PROFILE_DIR/user.js"
        if ! grep -q "toolkit.legacyUserProfileCustomizations.stylesheets" "$USER_JS" 2>/dev/null; then
            echo 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);' >> "$USER_JS"
            echo "   ✓ Enabled userChrome.css in Firefox preferences"
        else
            echo "   ✓ userChrome.css already enabled in preferences"
        fi
        
        echo ""
        echo "   Profile: $PROFILE_DIR"
    else
        echo "   ⚠️  Could not find default profile. You may need to set up userChrome.css manually."
    fi
else
    echo "   ⚠️  Could not find Firefox profiles.ini"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Open Firefox Developer Edition"
echo "2. Go to about:debugging → This Firefox → Load Temporary Add-on"
echo "3. Select: $SCRIPT_DIR/firefox/manifest.json"
echo "4. Browse to any website"
echo "5. Click the extensions icon (puzzle piece) in the simulated toolbar to toggle browser chrome"
echo ""
