# PixelPress v15 — Expanded in-app article reader

This builds on v14, retaining its compact story-first layout, RSS feeds, bookmarks, read tracking and PWA support.

## What changes
- The app now preserves up to 35,000 characters of article content when supplied by RSS instead of discarding it after 600 characters.
- Tapping a story first shows the full available RSS text, then asks the Cloudflare Worker for fuller article paragraphs and headings using `?article=<encoded article URL>`.
- If the publisher blocks extraction, the in-app reader retains RSS content and links to the publisher. No paywall bypass is attempted.
- Previously loaded article text is cached in memory during the session (up to 15 articles).
- Opening an article marks it as read without removing it from the list during scrolling.

## Deployment
1. Upload root files (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`) to GitHub Pages repository `outsketching/pixelreader`.
2. In Cloudflare Workers, **review and deploy** `worker/worker.js` to `rss-proxy.rjmclarenphotography.workers.dev` to enable fuller article extraction. This is an optional replacement; make a backup first if other applications rely on the existing Worker.
3. Reload the app twice if the previous service worker is still serving cached resources.
4. Open a story and check the status in the reader. It starts with RSS text and expands to article text where available.

The Worker retains `?url=` feed proxy and `?image=` image proxy features. No additional npm packages are required. The new article extraction is best-effort, and uses Cloudflare's HTMLRewriter to gather publisher-provided paragraphs and headings. Some sites may show only excerpts due to paywalls, bot restrictions, or different HTML markup. 

The worker URL is already preconfigured. No changes to your subscriptions or bookmarks are required.
