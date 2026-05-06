# Audiobookshelf Player Audit

Date: 2026-05-06

## Scope

This audit focused on the reliability and performance of the Electron/React Audiobookshelf client, especially the flows a listener depends on most:

- logging in and resuming a remembered server
- browsing book and podcast libraries
- preserving playback/progress state
- multi-file audiobook seeking
- search responsiveness
- mobile layout constraints
- build/test/dependency health

The supplied Audiobookshelf server at `http://192.168.178.195:13378` was reachable during the audit. The server returned two libraries, books and podcasts, and 476 progress entries for the test account.

## Findings And Changes

### Library Progress Loading

The book library previously fetched progress with one request per item after loading the item list. On the test server, progress is already available in bulk from `/api/me`, and the login response also contains the same style of progress array.

Change:
- Replaced per-item progress polling in `Library.tsx` with a single bulk progress fetch.
- Added staleness-aware progress merge helpers in `progressUtils.ts`.
- Reused the same helper for podcast episode progress seeding and refreshes.

Risk reduced:
- Faster library load on large libraries.
- Fewer server requests and less UI flicker.
- Duplicate progress rows now resolve consistently to the newest entry.

### Multi-File Audiobook Time Math

Track conversion was split between ad hoc helpers and a manager class, and older API track shapes could omit `startOffset`. That can lead to bad seek positions or `NaN`-style behavior around track boundaries.

Change:
- Centralized track normalization, boundary lookup, URL building, and track-time conversion in `audioTrackManager.ts`.
- Normalized missing `startOffset` values from cumulative duration.
- Added empty/out-of-range guards.
- Updated the player to use the tested helpers.

Risk reduced:
- Safer resume/seek behavior for multi-file books.
- Fewer edge case crashes around missing track data.

### Chapter Edge Cases

Zero-length or malformed chapters could produce invalid progress values, and chapter seek clamping did not fully guard `end <= start`.

Change:
- Clamped chapter durations to non-negative values.
- Prevented `NaN` progress.
- Ensured chapter seeks never move before the chapter start.

### Player Load And Bundle Performance

The initial renderer build was 863.70 kB minified before the audit. HLS was imported in the initial player bundle even though it is only needed for HLS streams.

Change:
- Lazy-loaded `hls.js`.
- Split React, Zustand, realtime, stats, and HLS chunks.
- Reduced HLS buffering from 10/20 minutes to 5/10 minutes and lowered max buffer memory from 60 MB to 30 MB.

Result:
- Main app chunk is now 133.37 kB minified.
- HLS remains a large lazy chunk at 523.86 kB, but it is no longer on the initial load path.

### Search And Library Race Conditions

Search and library switching could allow older async responses to overwrite newer UI state.

Change:
- Added request sequence guards to search.
- Added request sequence guards to library item loading.
- Clearing or closing search now cancels stale result writes.

### WebSocket Noise And Manual Ping

The WebSocket service emitted noisy production logs and manually wrote raw Socket.IO ping frames even though Socket.IO already manages heartbeat.

Change:
- Moved diagnostic logs behind `import.meta.env.DEV`.
- Removed the manual raw ping interval.

Risk reduced:
- Less production console noise.
- Less chance of protocol-level interference.

### Mobile Layout

CSS inspection and screenshots showed the compact top navigation and mini-player controls were the highest-risk responsive areas.

Change:
- Added mobile layout constraints for the floating nav/actions.
- Added mobile mini-player compaction.
- Hid nonessential mini-player sliders/buttons on narrow screens.
- Added mobile padding for the login screen.

Screenshots were generated under `/tmp/boek-ui-audit`:

- `login-mobile.png`
- `library-desktop.png`
- `library-mobile.png`
- `stats-desktop.png`

Authenticated Vite-browser screenshots cannot fully load server data because the real server does not allow the Vite browser origin; the Electron app currently bypasses that with its web-security setting. The repo now includes `scripts/bidi-ui-audit.mjs` for fuller browser automation where a WebDriver BiDi port is available.

### Tests

Vitest was added with focused coverage for:

- progress merge freshness and clamping
- item progress vs episode progress separation
- track normalization and boundary lookup
- authenticated track URL construction
- chapter zero-duration and seek clamping behavior

Current result: 14 tests passing.

### Dependency Audit

`npm audit fix` was applied for non-breaking updates.

Remaining audit findings require forced major upgrades:

- Electron 28 to Electron 42
- electron-builder 24 to 26
- Vite 5 to 8

Those upgrades were intentionally not forced in this pass because they affect packaging/runtime behavior and need separate validation.

## Verification

Commands run:

- `npm install`
- `npm install -D vitest`
- `npm run test`
- `npx tsc -p tsconfig.renderer.json --noEmit`
- `npx tsc -p tsconfig.main.json --noEmit`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm audit fix`

Current status:

- Tests pass.
- Renderer and main TypeScript builds pass.
- Production build passes.
- `npm audit` still reports forced-major-upgrade findings only.
