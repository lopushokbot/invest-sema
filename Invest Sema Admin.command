#!/bin/bash
# Double-click this file to open the Invest Sema admin panel on your Mac.
# In the panel, click "Work with Local Repository" and choose this
# "invest-sema" folder. Write your post, then Save.
# When you're done, just close this Terminal window.

cd "$(dirname "$0")" || exit 1

echo "Starting Invest Sema admin…"
echo "(Leave this window open while you work. Close it to stop.)"
echo

# First-time setup
if [ ! -d node_modules ]; then
  echo "First-time setup — installing (about a minute)…"
  npm install
fi

# Open the admin once the server is up
( sleep 5; open "http://localhost:4321/invest-sema/admin/" ) &

# Serve the site (the admin lives at /invest-sema/admin/)
npm run admin
