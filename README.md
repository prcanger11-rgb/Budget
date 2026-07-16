# The Ledger

A standalone, offline-capable budget tracker. All data is saved to your browser's
localStorage — same device only, no account, no server, no AI calls.

## Run locally
```
npm install
npm run dev
```

## Deploy to Netlify
**Option A — drag and drop (no GitHub needed)**
1. `npm install`
2. `npm run build` (creates a `dist` folder)
3. Go to https://app.netlify.com/drop and drag the `dist` folder in
4. Netlify gives you a live URL instantly

**Option B — connect to GitHub (auto-redeploys on push)**
1. Push this folder to a GitHub repo
2. In Netlify: "Add new site" → "Import an existing project" → pick the repo
3. Netlify auto-detects the build command and publish folder from `netlify.toml`

## Add to your phone's home screen
Once deployed, open the Netlify URL on your phone, then:
- iPhone (Safari): Share icon → Add to Home Screen
- Android (Chrome): ⋮ menu → Add to Home Screen

It'll behave like an app icon and work fully offline after the first load, since
everything (data + logic) lives in the browser.

## Notes
- Data is per-browser, per-device. Clearing browser data/cache will erase your entries.
- No sign-in, no sync — this version is intentionally single-device only.
