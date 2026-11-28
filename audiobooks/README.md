# Earshot

A free audiobook player for the LibriVox catalogue: about 18,900 English public-domain recordings read by volunteers. It runs in the browser and installs on a phone's home screen like an app.

## What it does

- **Browse and search** the whole catalogue by title or author (partial words work, e.g. `austen prid`), with genre chips (Mystery, Adventure, Science fiction, Horror, Children, Poetry and more) and an English-only switch. Results are sorted by how often they're listened to.
- **Book pages** show the cover, length, description and every chapter. Tap any chapter to play it.
- **Your shelf** shows a *Continue listening* card for the book you're on, plus everything else you've added, with progress and time left.
- **Player:** back 15 s and forward 30 s, previous and next chapter, a scrubber, speeds from 0.75× to 3×, a sleep timer (5 to 90 minutes, or end of chapter) and bookmarks with notes. It also shows how much of the book is left at your current speed.
- **Remembers your place** in every book, saved every few seconds and whenever you pause or leave the app. Your speed is remembered too. If you come back after more than a minute, it replays the last 5 seconds.
- **Lock-screen and headphone controls** (play/pause, skip, chapter, scrubbing) through the Media Session API, with cover art.
- **Installable:** it has a manifest and a service worker, so the app opens offline. Audio still streams, so it needs a connection to play.

Everything is stored on the device (localStorage). There are no accounts and no server.

## How it works

LibriVox recordings are hosted on the Internet Archive, and archive.org's search and metadata APIs accept requests straight from a browser (CORS). So this is a static site with no backend:

- Search: `archive.org/advancedsearch.php` on `collection:librivoxaudio`
- Book details and chapter files: `archive.org/metadata/<id>` (it uses the 64 kbps MP3s)
- Audio and covers: `archive.org/download/<id>/<file>` and `archive.org/services/img/<id>`

Code: `src/api.ts` (archive.org), `src/store.ts` (shelf and progress), `src/player.ts` (the audio engine, sleep timer and lock screen), `src/views.tsx` (shelf, browse and book pages), `src/App.tsx` (frame, mini player and full player).

Stack: Vite, React 18 and TypeScript. Fonts are Literata and Inter, both self-hosted.

## Run it

```
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check and build to dist/
```

## Deploy

It's a static Vite site. On Vercel: create a new project from this repo, set **Root Directory** to `audiobooks`, and deploy. `vercel.json` sets the framework and keeps `sw.js` uncached. No environment variables are needed.

To install it on an iPhone, open the site in Safari, tap Share, then **Add to Home Screen**. On Android, use Chrome's menu and tap **Install app**.

## Tests

`tests/e2e.cjs` drives the built app in a phone-sized Chromium against the real archive.org catalogue. Chapter MP3s are swapped for a 90-second tone (`tests/tone.mp3`), served with byte ranges like archive.org, so runs are quick.

```
npm run build && npx vite preview --port 4173 &
npm run test:e2e                     # or BASE_URL=https://your-site npm run test:e2e
```

**17/17 pass** (2026-11-28). The tests cover:

- popular books and search by title, author and partial words
- genre filters and the book page
- play, speed, skips, bookmarks with notes, next chapter, and the end-of-chapter sleep timer
- playing from the chapter list
- progress and speed surviving a reload, and resuming from the saved spot
- removing a book
- desktop layout and no page errors
