#!/usr/bin/env python3
"""
Nova Toggle - Native messaging host to toggle Firefox userChrome.css
"""

import json
import os
import struct
import subprocess
import sys
import configparser
from pathlib import Path

def get_message():
    """Read a message from stdin (native messaging protocol)."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(message)

def send_message(message):
    """Send a message to stdout (native messaging protocol)."""
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def find_firefox_profile():
    """Find the currently active Firefox profile by checking session files."""
    
    # Check which profile has the most recently modified session file
    profiles_dir = Path.home() / "Library" / "Application Support" / "Firefox" / "Profiles"
    
    if not profiles_dir.exists():
        return None
    
    try:
        profiles = [p for p in profiles_dir.iterdir() if p.is_dir()]
        if profiles:
            # Find profile with most recent sessionstore activity
            def get_session_mtime(p):
                # recovery.jsonlz4 is updated most frequently in active profile
                for session_file in ['sessionstore-backups/recovery.jsonlz4', 'sessionstore.jsonlz4']:
                    sf = p / session_file
                    if sf.exists():
                        return sf.stat().st_mtime
                return 0
            
            profiles.sort(key=get_session_mtime, reverse=True)
            return profiles[0]
    
    except Exception as e:
        pass
    
    return None

def toggle_user_chrome(profile_path):
    """Toggle userChrome.css on/off."""
    chrome_dir = profile_path / "chrome"
    user_chrome = chrome_dir / "userChrome.css"
    user_chrome_disabled = chrome_dir / "userChrome.css.disabled"
    
    if user_chrome.exists():
        # Disable it
        user_chrome.rename(user_chrome_disabled)
        return "disabled"
    elif user_chrome_disabled.exists():
        # Enable it
        user_chrome_disabled.rename(user_chrome)
        return "enabled"
    else:
        return "not_found"

def get_firefox_app_from_pid(pid):
    """Get the Firefox .app path from a process ID."""
    try:
        # Get the executable path for this PID
        result = subprocess.run(
            ['ps', '-p', str(pid), '-o', 'comm='],
            capture_output=True,
            text=True
        )
        comm = result.stdout.strip()
        
        # Map common executable paths to app bundles
        if 'Firefox Developer Edition' in comm or 'firefox' in comm.lower():
            # Try to find the actual app from the process path
            result = subprocess.run(
                ['lsof', '-p', str(pid)],
                capture_output=True,
                text=True
            )
            for line in result.stdout.split('\n'):
                if '.app/' in line and 'Firefox' in line:
                    # Extract the .app path
                    import re
                    match = re.search(r'(/Applications/[^/]+\.app)', line)
                    if match:
                        return match.group(1)
        
        # Fallback: check which Firefox apps exist and pick based on executable name
        if 'Developer' in comm:
            return "/Applications/Firefox Developer Edition.app"
        elif 'Nightly' in comm:
            return "/Applications/Firefox Nightly.app"
        else:
            return "/Applications/Firefox.app"
            
    except Exception:
        return None

def restart_firefox():
    """Restart only the Firefox instance that called this script."""
    
    # Get the parent PID - this is the Firefox process that launched native messaging
    ppid = os.getppid()
    
    # Get the grandparent (in case there's a wrapper process)
    try:
        result = subprocess.run(
            ['ps', '-p', str(ppid), '-o', 'ppid='],
            capture_output=True,
            text=True
        )
        gpid = int(result.stdout.strip())
    except:
        gpid = ppid
    
    # Find which Firefox app this is
    firefox_app = get_firefox_app_from_pid(ppid) or get_firefox_app_from_pid(gpid)
    
    # Fallback to checking what's installed
    if not firefox_app:
        for app in ["/Applications/Firefox Developer Edition.app", 
                    "/Applications/Firefox Nightly.app",
                    "/Applications/Firefox.app"]:
            if os.path.exists(app):
                firefox_app = app
                break
    
    if not firefox_app:
        return False
    
    # Spawn a detached script that:
    # 1. Kills only this specific Firefox process (by PID)
    # 2. Reopens the same Firefox variant
    restart_script = f'''
    sleep 0.5
    kill {ppid} 2>/dev/null || kill {gpid} 2>/dev/null
    sleep 0.5
    open -a "{firefox_app}"
    '''
    
    subprocess.Popen(
        ['bash', '-c', restart_script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True
    )
    
    return True

def main():
    message = get_message()
    
    if message and message.get('action') == 'toggle':
        profile_path = find_firefox_profile()
        
        if profile_path:
            # Check what files exist in chrome folder
            chrome_dir = profile_path / "chrome"
            chrome_files = list(chrome_dir.glob('*')) if chrome_dir.exists() else []
            
            status = toggle_user_chrome(profile_path)
            restart_firefox()
            send_message({
                'success': True,
                'status': status,
                'profile': str(profile_path),
                'chrome_files': [str(f.name) for f in chrome_files]
            })
        else:
            send_message({
                'success': False,
                'error': 'Could not find Firefox profile'
            })
    else:
        send_message({
            'success': False,
            'error': 'Unknown action'
        })

if __name__ == '__main__':
    main()
