# PixelPress — Gaming RSS Reader

A static progressive web app for GitHub Pages. Based on the approved compact PixelPress v9 artwork, with a live feed reader, New / Read Later / All / Manage, article images, local bookmarks, and a Cloudflare RSS proxy.

## 1. Publish on GitHub Pages

1. Create a GitHub repository (e.g. `pixelpress`).
2. Upload **everything from this folder except the optional `worker/` folder** to the repository root. Include `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, and `icons/`.
3. GitHub repository → Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/(root)` → Save.
4. Open `https://YOUR-USERNAME.github.io/pixelpress/` after publishing.
5. On Android, open in Chrome → menu (⋮) → **Add to Home screen** → Install / Create shortcut.

The Worker URL is already set to:
`https://rss-proxy.rjmclarenphotography.workers.dev`

## 2. Connect your existing Worker

**Important:** I could not verify the Worker API from the development environment. The reader currently sends:

`GET https://rss-proxy.rjmclarenphotography.workers.dev/?url=<encoded-RSS-feed-URL>`

The response should be RSS 2.0 XML, Atom XML, or JSON with `items`, `articles`, or `entries`, or a feed object with `items`. The Worker **must send CORS headers** permitting the GitHub Pages origin; an `Access-Control-Allow-Origin` header with `*` works for unauthenticated requests.

If all feeds report errors in Manage and no stories load, your existing Worker likely uses a different request shape or does not send CORS headers. The optional `worker/worker.js` is a fully matched replacement implementation to deploy in Cloudflare's Worker editor. It does **not** deploy automatically; your existing Worker remains untouched until you choose to replace its code. When applying it, be aware that it will replace whatever functionality you currently have in that Worker.

## 3. Feed management

- New: unread items published within 72 hours from all subscribed feeds, sorted newest first.
- All: the loaded articles, including read and older articles.
- Read Later: saved articles retained locally, even if a feed no longer includes them.
- Manage: add / remove RSS URLs and edit the Worker URL.
- Tap the **unlit star** to bookmark; the **filled gold star** means saved. No long press.
- Open a card to mark it read and show its RSS content. The article dialog links to the publisher for full text when only a summary is available.
- In New, articles automatically become read when they have actually been on screen and then scrolled above the viewport.

The app caches the most recent successful stories and your preferences in localStorage on **that browser/device**. It does not sync bookmarks between devices. Article images depend on publishers allowing external image loading. Some RSS URLs may no longer be valid, redirect, or block Cloudflare.

## 4. No GitHub Action required

All feed fetching is done on demand via the Worker. A successful refresh caches fetched headlines locally in the browser. The service worker caches the app shell for offline reopening, but an internet connection is required to load new stories.

## 5. Artwork attribution

Desktop icons are from [Mayke Arth — Magical designer girl Desktop icons 32x32](https://mayke-arth.itch.io/cute-desktop-icons-32x32), supplied by the user. Artist credits are voluntary according to the creator's public comments; please review their asset page before distributing the art as a standalone icon pack. The filled/unfilled stars were custom-designed for PixelPress and are not claimed to be part of the original pack.

## 6. Troubleshooting

- **No stories and a red error banner:** open Manage for per-feed errors. Confirm the worker URL and CORS; if necessary deploy the included optional worker script.
- **Some missing images:** publishers may not include images in RSS; placeholders appear where image extraction fails.
- **No live content when opening `index.html` directly from file://:** try serving over HTTPS via GitHub Pages; service workers also require HTTPS.
- **Stale app after publishing updates:** refresh the site. If the old interface remains, clear the site's service worker/storage in Chrome and reload.
