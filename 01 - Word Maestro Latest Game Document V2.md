# World Maestro formerly World Word Winner — Comprehensive Game Document
> **Version:** v0.0.1.83 · **Platform:** Reddit Devvit · **Last Updated:** February 11, 2026
---
## 1. Game Overview
**World Maestro** is a real-time multiplayer word game built as a Reddit Devvit Custom Post Type. Players compete in timed rounds to form words from a shared 4×4 letter grid, with Scrabble-like scoring and live leaderboards.
### Game Cycle (80 seconds total)
| Phase | Duration | Description |
|-------|----------|-------------|
| **Lobby** | 10s | Players join, countdown displayed, instructions shown |
| **Game** | 60s | Players form words from tiles, scores update in real-time |
| **End** | 10s | Final standings, player stats, top words displayed |
After the end phase, a **new cycle** begins automatically with fresh letters and reset scores.
### Screens
| Screen | Left Column | Center Column | Right Column |
|--------|-------------|---------------|--------------|
| **Lobby** | Players Joining (list + count) | Countdown timer + How to Play | Scoring rules |
| **Game** | Leaderboard (live scores) | Tile grid + Word display + Buttons | Words Found (all players) |
| **End** | Final Standings | Game Statistics + Next Game countdown | Top Words |
---
## 2. Architecture
### Technology Stack
| Layer | Technology | File | Purpose |
|-------|-----------|------|---------|
| **Server** | TypeScript (Devvit) | `src/main.tsx` | Game state management, Redis, realtime messaging |
| **Client** | JavaScript | `webroot/game.js` | UI rendering, user interaction, game logic |
| **Bridge** | JavaScript | `webroot/multiplayerHelper.js` | Message protocol between WebView and Devvit |
| **Layout** | HTML | `webroot/index.html` | Three-screen HTML structure |
| **Styling** | CSS | `webroot/main.css` | Responsive layout, animations |
| **Storage** | Redis (Devvit) | — | Game state, player data, scores |
| **Realtime** | Devvit Realtime API | — | Cross-player message broadcasting |
### Message Flow
```
WebView (game.js)
  ↓ postMessage (via MultiplayerHelper)
Devvit Server (main.tsx)
  ↓ Read/Write Redis
  ↓ realtime.send() → broadcasts to ALL clients via channel
  ↓ postMessage() → echoes back to SENDER (realtime doesn't echo to self)
WebView (game.js)
  ↑ Receives via 'message' event listener in MultiplayerHelper
```
**Message Types (Server → Client):**
- `init` — Initial game state (username, phase, timeLeft, gameId, letters, players)
- `timeSync` — Sent every second with current phase and timeLeft
- `phaseChange` — Phase transition (lobby→game→end→lobby)
- `playerJoined` — New player joined (username, playerCount)
- `scoreUpdate` — Word submitted (username, word, score, totalScore, leaderboard)
- `newCycle` — New game cycle created (fresh gameId, letters)
- `leaderboard` — Leaderboard data response
**Message Types (Client → Server):**
- `ready` — WebView loaded, request init data
- `joinGame` — Player wants to join current game
- `submitWord` — Word submission with score
- `getLeaderboard` — Request current leaderboard data
### Key Design Decisions
1. **Server-Authoritative State**: Redis is the single source of truth. Every handler fetches fresh state via `getFreshGameState()` to avoid stale closures inherent in Devvit's React-like render model.
2. **Session-Keyed Players**: Player keys use `username:sessionId` format (e.g., `BenKaranja:abc123`) to correctly handle multiple tabs from the same user.
3. **Dual Communication**: `realtime.send()` broadcasts to all connected clients via the `game_events` channel; `context.ui.webView.postMessage()` echoes back to the sender (since realtime doesn't echo to self).
4. **Unwrapped postMessage**: Devvit's `postMessage` automatically wraps messages in `{ type: 'devvit-message', data: { message: <payload> } }`. Server code sends only the INNER payload to avoid double-wrapping.
---
## 3. Current Implementation Status
### ✅ Fully Working Features
#### Core Game Mechanics
- **4×4 Letter Grid** with weighted random generation (vowel/consonant balance)
- **Scrabble-like Scoring** with letter values and word-length multipliers (1× to 3×)
- **Dictionary Validation** — 370,100-word dictionary loaded via fetch with fallback
- **Duplicate Word Prevention** — `usedWords` Set tracks used words per session
- **Tile Interaction** — Click to build words, Clear/Submit/Shuffle buttons
- **Sound Effects** — `AudioManager` class with Web Audio API (tile click, success, error, shuffle, game over)
#### Multiplayer Infrastructure
- **Game Cycle Engine** — Server-driven lobby→game→end→auto-new-cycle loop
- **Phase Synchronization** — `useInterval` ticker sends `timeSync` every second
- **Phase Transitions** — Server broadcasts `phaseChange` messages when phases shift
- **Player Registration** — `joinGame` with idempotency check (Redis `zScore` lookup before adding)
- **Score Submission** — Words submitted to server, stored in Redis sorted set
- **Score Broadcasting** — `scoreUpdate` messages sent to all players with full leaderboard
- **New Cycle Creation** — `createNewCycle()` generates fresh letters, resets state, broadcasts
- **Opponent Word Notifications** — Toast notification when another player finds a word
#### UI Screens
- **Lobby Screen** — Players Joining list (deduplicated by name), countdown timer, How to Play, Scoring rules
- **Game Screen** — Live leaderboard with dynamic player count header, word display area, tile grid, buttons, words found list with dynamic count header
- **End Screen** — Final standings, game statistics (Total Score, Words Found, Longest Word, Best Word Score), Top Words, next game countdown
- **Responsive Layout** — CSS columns with mobile stacking
#### Communication Layer
- **MultiplayerHelper** — Full message protocol with callback registration for all message types
- **Console Hijacking** — WebView `console.log/warn/error` forwarded to Devvit console for debugging
- **Devvit Detection** — Automatic detection of Devvit vs standalone mode
---
## 4. Challenges Faced & Resolutions
### Challenge 1: Devvit Hook Ordering Error
**Error:** `"Hooks must be called in the same order every render"`
**Root Cause:** Devvit's render function requires hooks (`useState`, `useChannel`, `useInterval`) to be called in the same order on every render. Conditional logic placed before hooks caused ordering violations.
**Resolution:** Moved ALL hook calls to the top of the `render()` function, before any conditional logic. Used `useState` with initializer functions for conditional state.
**Files Changed:** `src/main.tsx`
---
### Challenge 2: Double-Wrapped Messages (CRITICAL)
**Symptom:** Score updates, player joins, phase changes, and new cycle data were all silently dropped by the WebView. No errors in console.
**Root Cause:** Devvit's `postMessage` API automatically wraps messages in `{ type: 'devvit-message', data: { message: <payload> } }`. But the server code was ALSO wrapping messages in this same format before sending via `postMessage`. This resulted in **double-wrapped** messages that the client's `multiplayerHelper.js` couldn't unwrap correctly.
**Example of the bug:**
```javascript
// Server was sending (already wrapped):
postMessage('game_webview', {
    type: 'devvit-message',
    data: { message: { type: 'scoreUpdate', data: {...} } }
});
// Devvit auto-wraps, so WebView received:
{
    type: 'devvit-message',
    data: {
        message: {
            type: 'devvit-message',  // ← SECOND LAYER
            data: { message: { type: 'scoreUpdate', ... } }
        }
    }
}
// multiplayerHelper unwraps ONE layer, sees type='devvit-message' (not 'scoreUpdate')
// → Message silently dropped
```
**Resolution:**
1. All `postMessage` echo calls now send the INNER message only (no wrapper).
2. The `useChannel.onMessage` handler now unwraps realtime messages before forwarding via `postMessage`.
```javascript
// CORRECT — send inner only:
context.ui.webView.postMessage('game_webview', { type: 'scoreUpdate', data: scoreData });
// Channel handler — unwrap before forwarding:
onMessage: (msg) => {
    if (msg?.type === 'devvit-message' && msg?.data?.message) {
        context.ui.webView.postMessage('game_webview', msg.data.message);
    } else {
        context.ui.webView.postMessage('game_webview', msg);
    }
}
```
**Affected messages:** `scoreUpdate`, `playerJoined`, `phaseChange`, `newCycle`
**Files Changed:** `src/main.tsx`
---
### Challenge 3: Duplicate `handleScoreUpdate` Method
**Symptom:** In-game leaderboard permanently showed "Waiting for scores..." even after words were submitted and server confirmed scores were saved.
**Root Cause:** Two `handleScoreUpdate` methods existed in `game.js`:
- **Line 1099:** Set `this.leaderboardData` (correct field used by `updateLeaderboard()`) ✅
- **Line 1288:** Set `this.leaderboard` (wrong field — `updateLeaderboard()` never reads this) ❌
JavaScript classes use the **last definition** in the prototype chain, so the line 1288 version always won. The `updateLeaderboard()` method reads from `this.leaderboardData`, which was never populated.
**Resolution:** Removed the duplicate definition at line 1288. The single definition at line 1099 correctly sets `this.leaderboardData` and also includes opponent word notification logic.
**Files Changed:** `webroot/game.js`
---
### Challenge 4: Duplicate Player Count Inflation
**Symptom:** Player count showed 5-6 when only 2 actual browser sessions existed. Player list showed duplicates of the same username.
**Root Causes (multiple):**
1. `handleInit()` called `this.multiplayer.joinGame()` on EVERY init message, resetting `_hasJoined = false` each time. This meant every `timeSync`-driven phase change or page refresh triggered a re-join.
2. Each browser refresh generated a new random `sessionId`, creating a new Redis sorted set entry without cleaning the old one.
3. The server's `joinGame` handler had no idempotency check — the same `username:sessionId` key could be re-added repeatedly.
**Resolution (multi-layered):**
1. **Client — `handleInit()`:** Now tracks `gameId` changes. Only calls `joinGame()` when the `gameId` differs (new cycle) or on first join (`!this._hasJoined`).
2. **Client — `handlePlayerJoined()`:** Deduplicates by player name before adding to the `recentPlayers` list.
3. **Server — `joinGame` handler:** Checks `redis.zScore()` for the player key. If already present, sends the current count without re-adding.
**Files Changed:** `webroot/game.js`, `src/main.tsx`
---
### Challenge 5: Wrong `multiplayerHelper` Reference
**Symptom:** Words were validated locally (dictionary check passed, score calculated) but never sent to the server. Other players never saw the words.
**Root Cause:** `processValidWord()` used `window.multiplayerHelper.submitWord()` instead of `this.multiplayer.submitWord()`. The `MultiplayerHelper` was instantiated as `this.multiplayer` in `WordBlitz`'s constructor, but `window.multiplayerHelper` was a separate global instance created at the bottom of `multiplayerHelper.js`. The global instance had no game context.
**Resolution:** Changed `window.multiplayerHelper` to `this.multiplayer` in `processValidWord()`.
**Files Changed:** `webroot/game.js`
---
### Challenge 6: Lobby Timer Freeze
**Symptom:** After the first game cycle completed, the lobby countdown froze. No new game started.
**Root Cause:** When the total cycle time (80 seconds) was reached, `getPhaseInfo()` returned `timeLeft: 0` for the end phase. But no code detected this condition to trigger a new cycle.
**Resolution:** Added `createNewCycle()` function in `main.tsx`. The ticker checks if the elapsed time exceeds `TOTAL_CYCLE` and calls `createNewCycle()` to generate a fresh game state, broadcast it, and echo to self.
**Files Changed:** `src/main.tsx`
---
### Challenge 7: Score & State Persistence Between Games
**Symptom:** Scores from game 1 appeared in game 2's leaderboard. Letter tiles didn't change between rounds.
**Root Cause:** `resetGameState()` only cleared basic state (`score`, `wordsFound`, `usedWords`). It didn't clear:
- `this.leaderboardData` — old leaderboard persisted
- `this.gridLetters` — was regenerated locally instead of cleared (so server letters were ignored)
- `this.recentPlayers` — old player list persisted
- `this.playerStats` — stats accumulated across games
**Resolution:** `resetGameState()` now clears ALL multiplayer state:
```javascript
this.leaderboardData = null;
this.leaderboard = [];
this.gridLetters = [];      // Will be set by server via newCycle/init
this.recentPlayers = [];
this.foundWords = [];
this.playerStats = { wordsFound: 0, longestWord: '', highestScoringWord: '', highestScore: 0 };
```
**Files Changed:** `webroot/game.js`
---
### Challenge 8: Blank WebView / Loading Screen
**Symptom:** WebView showed blank white screen or stuck on loading.
**Root Cause:** Multiple issues — missing `webroot` directory configuration in `devvit.yaml`, incorrect file paths, and early initialization errors preventing DOM rendering.
**Resolution:** Ensured `devvit.yaml` correctly pointed to `webroot`, verified all file paths, and added error handling in the initialization chain.
**Files Changed:** `devvit.yaml`, `webroot/index.html`
---
### Challenge 9: CSS Overflow on Mobile
**Symptom:** Content overflowed the WebView bounds on mobile devices. Title text was cut off.
**Root Cause:** Fixed-pixel dimensions from the desktop spec (660×512px) didn't adapt to mobile viewports.
**Resolution:** Converted to responsive CSS with `max-width`, `overflow: hidden`, and column stacking for narrow viewports.
**Files Changed:** `webroot/main.css`
---
## 5. Pending Items
### 🔴 High Priority
| # | Item | Description | Files |
|---|------|-------------|-------|
| 1 | **Opponent words in Words Found column** | Right column during game should show words found by ALL players, not just the current player. The `scoreUpdate` message already includes `word` and `username` — needs to append to the words list UI. | `webroot/game.js` |
| 2 | **Production MIN_PLAYERS** | Currently set to `1` for solo testing. Must be changed to `2` for production. | `src/main.tsx` (line 13) |
| 3 | **"Guest" username fallback** | Some sessions resolve as "Guest" when Reddit API fails (incognito/private browsing). Need retry logic or anonymous name generation. | `src/main.tsx` (lines 73-81) |
### 🟡 Medium Priority
| # | Item | Description | Files |
|---|------|-------------|-------|
| 4 | **Old session cleanup** | When a user refreshes, their old `sessionId` entry stays in Redis. Over time this inflates player counts. Need TTL or cleanup on new cycle. | `src/main.tsx` |
| 5 | **DUMMY_PLAYERS removal** | The `DUMMY_PLAYERS` constant (lines 24-57 of `game.js`) is unused in multiplayer but still present. Should be removed. | `webroot/game.js` |
| 6 | **Animated rank changes** | Original spec calls for animated leaderboard rank changes. Currently uses static HTML replacement. | `webroot/game.js`, `webroot/main.css` |
| 7 | **Player avatars** | Original spec mentions Reddit avatar display in lobby. Not yet implemented. | `webroot/index.html` |
| 8 | **Word count in leaderboard** | The leaderboard table has a `word-count` column that's always empty. Server should track and broadcast word counts per player. | `src/main.tsx`, `webroot/game.js` |
### 🟢 Low Priority / Nice-to-Have
| # | Item | Description |
|---|------|-------------|
| 9 | **GSAP animations** | Original spec calls for GSAP-powered tile animations and particle effects on word submission |
| 10 | **Keyboard input** | Original spec mentions keyboard input support alongside mouse/touch |
| 11 | **Global leaderboard** | `REDIS_KEYS.globalLeaderboard` exists but no UI displays it. Could show all-time rankings. |
| 12 | **Game history** | `REDIS_KEYS.gameHistory` exists but unused. Could enable replay or stats tracking. |
| 13 | **Web Components** | Original spec mentions custom elements (`<game-board>`, `<player-leaderboard>`, etc.) — currently using vanilla DOM |
| 14 | **Word dedup across players** | `REDIS_KEYS.submittedWords(gameId)` exists but isn't used to prevent two players from scoring the same word |
---
## 6. File Reference
### Source Files
| File | Lines | Purpose |
|------|-------|---------|
| `src/main.tsx` | 434 | Server: game state, Redis operations, realtime broadcasting, message handlers |
| `webroot/game.js` | 1,492 | Client: `WordBlitz` and `AudioManager` classes, all UI logic |
| `webroot/multiplayerHelper.js` | 260 | Client: `MultiplayerHelper` class, message protocol bridge |
| `webroot/index.html` | 162 | HTML structure for lobby, game, and end screens |
| `webroot/main.css` | ~350 | Responsive styling, animations, radial progress |
### Key Classes
**`WordBlitz` (game.js)** — Main game class
- Constructor: Sets up multiplayer callbacks, DOM caching, game state initialization
- Screen management: `showLobbyScreen()`, `showGameScreen()`, `showEndScreen()`
- Game flow: `startGame()`, `endGame()`, `resetGameState()`, `resetGame()`
- Word handling: `submitWord()`, `processValidWord()`, `calculateWordScore()`
- Multiplayer handlers: `handleInit()`, `handlePlayerJoined()`, `handlePhaseChange()`, `handleScoreUpdate()`, `handleTimeSync()`, `handleLeaderboard()`
- UI updates: `updateLeaderboard()`, `updateLobbyScreenPlayers()`, `updateFinalStandings()`, `updateEndScreenStats()`
**`MultiplayerHelper` (multiplayerHelper.js)** — Communication bridge
- Devvit detection and message listener setup
- Callback registration: `onInit()`, `onTimeSync()`, `onPhaseChange()`, `onScoreUpdate()`, `onPlayerJoined()`, `onNewCycle()`, `onLeaderboard()`
- Outbound: `sendToDevvit()`, `submitWord()`, `joinGame()`, `requestLeaderboard()`
**`AudioManager` (game.js)** — Sound effects via Web Audio API
- Programmatic sound generation (no audio files needed)
- Sounds: tileClick, success, error, gameOver, shuffle
### Key Constants
| Constant | Value | Location |
|----------|-------|----------|
| `LOBBY_DURATION` | 10s | `src/main.tsx` |
| `GAME_DURATION` | 60s | `src/main.tsx` |
| `END_DURATION` | 10s | `src/main.tsx` |
| `TOTAL_CYCLE` | 80s | `src/main.tsx` |
| `MAX_PLAYERS` | 50 | `src/main.tsx` |
| `MIN_PLAYERS` | 1 (test) / 2 (prod) | `src/main.tsx` |
| `MIN_WORD_LENGTH` | 2 | `webroot/game.js` |
### Redis Key Structure
| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `game:current` | String (JSON) | Current `GameState` object: `{ phase, gameId, cycleStartTime, letters, playerCount }` |
| `game:players:{gameId}` | Sorted Set | Active players. Member: `username:sessionId`, Score: join timestamp |
| `game:scores:{gameId}` | Sorted Set | Player scores. Member: `username:sessionId`, Score: total points |
| `game:playerwords:{gameId}:{username}` | Set | Words submitted by a specific player (planned) |
| `game:submitted:{gameId}` | Set | All submitted words for cross-player dedup (planned) |
| `game:history` | List | Game history records (planned) |
| `leaderboard:global` | Sorted Set | All-time player rankings (planned) |
### Scoring System
**Letter Values (Scrabble-like):**
```
A:1  B:3  C:3  D:2  E:1  F:4  G:2  H:4  I:1  J:8
K:5  L:1  M:3  N:1  O:1  P:3  Q:10 R:1  S:1  T:1
U:1  V:4  W:4  X:8  Y:4  Z:10
```
**Word Length Multipliers:**
| Length | Multiplier |
|--------|------------|
| 2-4 letters | 1× |
| 5 letters | 1.5× |
| 6 letters | 2× |
| 7 letters | 2.5× |
| 8+ letters | 3× |
**Formula:** `score = floor(sum(letter_values) × length_multiplier)`
---
## 7. Deployment
### Commands
```bash
# Development with live reload
npm run dev
# → Runs: devvit playtest r/WorldWordWinner
# Production upload
devvit upload
# Install on subreddit
devvit install <subreddit>
```
### Creating a Game Post
1. Navigate to r/WorldWordWinner
2. Open mod menu → "Create World Word Winner Game"
3. A custom post is created with the game WebView embedded
### Current Playtest URL
```
https://www.reddit.com/r/WorldWordWinner/?playtest=world-wordwinner
```
### Environment
- **Node.js** — Required for Devvit CLI
- **Devvit CLI** — `npm install -g devvit`
- **Configuration** — `devvit.yaml` in project root