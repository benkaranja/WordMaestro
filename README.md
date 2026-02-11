# 🎮 Word Maestro

> **A real-time multiplayer word game for Reddit** — Form words from a shared 4×4 grid, outscore your opponents, and climb the leaderboard!

[![Built with Devvit](https://img.shields.io/badge/Built_with-Devvit-FF4500?style=flat&logo=reddit)](https://developers.reddit.com)

---

## 🎯 How It Works

Word Maestro runs as a **custom Reddit post**. Click a post to join the game — no installs, no sign-ups.

### Game Flow (80-second cycles)

| Phase | Duration | What Happens |
|-------|----------|--------------|
| 🏛️ **Lobby** | 10s | Players join, countdown begins |
| 🎮 **Game** | 60s | Form words from the 4×4 letter grid |
| 🏆 **End** | 10s | Scores tallied, leaderboard revealed |
| 🔄 **Repeat** | — | New letters, new round — automatically |

### Scoring System

Words are scored using **Scrabble-style letter values** with length multipliers:

| Word Length | Multiplier | Example |
|-------------|------------|---------|
| 2–4 letters | 1× | WORD = 8 pts |
| 5 letters | 1.5× | QUEST = 21 pts |
| 6 letters | 2× | WIZARD = 38 pts |
| 7 letters | 2.5× | — |
| 8+ letters | 3× | — |

---

## ✨ Features

- **Real-time multiplayer** — See opponents' words and scores live
- **370,100-word dictionary** — Validates against a comprehensive word list
- **Scrabble-style scoring** — Letter values + word-length multipliers
- **Auto-cycling rounds** — Fresh letters every 80 seconds — always a new game
- **Live leaderboard** — Track your rank as scores update in real-time
- **Sound effects** — Audio feedback for clicks, submissions, and game events
- **Responsive design** — Plays great on desktop and mobile Reddit
- **Opponent word feed** — See what words your opponents are finding

---

## 🛠️ Technical Stack

| Component | Technology |
|-----------|-----------|
| **Server** | TypeScript (Devvit) |
| **Client** | Vanilla JavaScript |
| **Communication** | Devvit Realtime API + WebView messaging |
| **Storage** | Redis (via Devvit) |
| **Dictionary** | 370K-word JSON file loaded at runtime |
| **Audio** | Web Audio API (oscillator-based) |

### Architecture

```
┌─────────────────────────────────────┐
│           Reddit Post               │
│  ┌───────────────────────────────┐  │
│  │    Devvit Custom Post Type    │  │
│  │    (src/main.tsx)             │  │
│  │    - Game cycle management    │  │
│  │    - Redis state storage      │  │
│  │    - Realtime broadcasting    │  │
│  └───────────┬───────────────────┘  │
│              │ WebView + Realtime   │
│  ┌───────────▼───────────────────┐  │
│  │    WebView Client             │  │
│  │    webroot/game.js            │  │
│  │    webroot/multiplayerHelper  │  │
│  │    webroot/index.html         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## 🚀 Installation & Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [Devvit CLI](https://developers.reddit.com/docs/get-started/cli) (`npm install -g devvit`)

### Setup

```bash
# Clone the repository
git clone https://github.com/benkaranja/WordMaestro.git
cd WordMaestro

# Install dependencies
npm install

# Build (TypeScript compilation)
npm run build
```

### Deploy to Reddit

```bash
# Upload the app
devvit upload

# Install on a subreddit
devvit install r/WordMaestro

# Or playtest locally
npm run dev
```

### Create a Game Post

1. Navigate to your subreddit (e.g., r/WordMaestro)
2. Open the mod menu (three dots → "Create Word Maestro Game")
3. The game post will be created and the first 80-second cycle begins!

---

## 📁 Project Structure

```
WorldMaestro/
├── src/
│   └── main.tsx          # Devvit server — game cycle, Redis, realtime
├── webroot/
│   ├── index.html        # Game UI (lobby, game, end screens)
│   ├── game.js           # Client game logic (WordMaestro class)
│   ├── multiplayerHelper.js  # WebView ↔ Devvit bridge
│   ├── main.css          # Responsive styling
│   └── dictionary.json   # 370K word dictionary
├── devvit.yaml           # Devvit app configuration
├── package.json          # Dependencies & scripts
└── README.md             # This file
```

---

## 🏆 Reddit Daily Games Hackathon 2026

Word Maestro is built for the **Reddit Daily Games Hackathon**.

- **Recurring content**: Auto-cycling rounds with fresh letters every 80 seconds
- **Community-minded**: Real-time multiplayer on Reddit — play with your subreddit
- **Mobile-ready**: Responsive design optimized for Reddit mobile
- **Polish**: Sound effects, animations, live leaderboard, opponent word feed

---

## 📝 License

BSD-3-Clause
