import { Devvit, useState, useChannel, useInterval, useAsync } from '@devvit/public-api';

// Configure Devvit with required capabilities
Devvit.configure({
    redditAPI: true,
    redis: true,
    realtime: true,
});

// Game constants
const GAME_DURATION = 60;
const LOBBY_DURATION = 10;
const END_SCREEN_DURATION = 10;
const TOTAL_CYCLE = LOBBY_DURATION + GAME_DURATION + END_SCREEN_DURATION;
const MAX_PLAYERS = 50;
const MIN_PLAYERS = 1; // Set to 2 for production, 1 for solo testing

// Redis keys
const REDIS_KEYS = {
    currentGame: 'game:current',
    globalLeaderboard: 'leaderboard:global',
    activePlayers: (gameId: string) => `game:${gameId}:players`,
    gameScores: (gameId: string) => `game:${gameId}:scores`,
    playerWords: (gameId: string, username: string) => `game:${gameId}:words:${username}`,
    submittedWords: (gameId: string) => `game:${gameId}:submitted`,
    gameHistory: 'game:history',
};

type GamePhase = 'lobby' | 'game' | 'end';

interface GameState {
    phase: GamePhase;
    gameId: string;
    cycleStartTime: number;
    letters: string[];
    playerCount: number;
    [key: string]: any;
}

function getPhaseInfo(cycleStartTime: number): { phase: GamePhase; timeLeft: number; phaseElapsed: number } {
    const elapsed = Math.floor((Date.now() - cycleStartTime) / 1000);
    if (elapsed < LOBBY_DURATION) {
        return { phase: 'lobby', timeLeft: LOBBY_DURATION - elapsed, phaseElapsed: elapsed };
    } else if (elapsed < LOBBY_DURATION + GAME_DURATION) {
        const gameElapsed = elapsed - LOBBY_DURATION;
        return { phase: 'game', timeLeft: GAME_DURATION - gameElapsed, phaseElapsed: gameElapsed };
    } else if (elapsed < TOTAL_CYCLE) {
        const endElapsed = elapsed - LOBBY_DURATION - GAME_DURATION;
        return { phase: 'end', timeLeft: END_SCREEN_DURATION - endElapsed, phaseElapsed: endElapsed };
    } else {
        return { phase: 'lobby', timeLeft: LOBBY_DURATION, phaseElapsed: 0 };
    }
}

function generateLetters(): string[] {
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    const consonants = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];
    const shuffledConsonants = [...consonants].sort(() => Math.random() - 0.5).slice(0, 11);
    const letters = [...vowels, ...shuffledConsonants];
    return letters.sort(() => Math.random() - 0.5);
}

// ============================================================
// Helper: Always fetch fresh game state from Redis.
// This avoids ALL stale-closure bugs.
// ============================================================
async function getFreshGameState(redis: any): Promise<GameState | null> {
    const raw = await redis.get(REDIS_KEYS.currentGame);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
}

async function getOrFetchUsername(reddit: any, currentUsername: string): Promise<string> {
    if (currentUsername) return currentUsername;
    try {
        const user = await reddit.getCurrentUser();
        if (user?.username) return user.username;
    } catch {
        // Reddit API unavailable — fall through to guest name
    }
    // Generate a unique guest name to avoid collisions
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `Player_${id}`;
}

Devvit.addCustomPostType({
    name: 'Word Maestro',
    description: 'Word Maestro — a multiplayer word game. Compete globally!',
    height: 'tall',
    render: (context) => {
        const { redis, realtime, reddit } = context;
        // Fetch username once via useState initializer (runs once, no re-render loop)
        const [username] = useState(async () => {
            try {
                const user = await reddit.getCurrentUser();
                return user?.username || 'Guest';
            } catch { return 'Guest'; }
        });
        const [subscribed, setSubscribed] = useState(false);
        // Unique session ID for this tab instance (handles same-user multi-tab)
        const [sessionId] = useState(() => Math.random().toString(36).substring(2, 8));

        // Initialize game on first load
        useAsync(async () => {
            const raw = await redis.get(REDIS_KEYS.currentGame);
            if (raw) {
                const state = JSON.parse(raw) as GameState;
                const elapsed = Math.floor((Date.now() - state.cycleStartTime) / 1000);
                if (elapsed >= TOTAL_CYCLE) {
                    await createNewCycle();
                }
                // Otherwise, existing cycle is fine
            } else {
                await createNewCycle();
            }
            return true;
        });

        async function createNewCycle() {
            const newGame: GameState = {
                phase: 'lobby',
                gameId: Date.now().toString(),
                cycleStartTime: Date.now(),
                letters: generateLetters(),
                playerCount: 0,
            };
            console.log('🆕 Creating NEW game cycle:', newGame.gameId);
            await redis.set(REDIS_KEYS.currentGame, JSON.stringify(newGame));
            // Clean up old keys (best effort)
            try {
                await redis.del(REDIS_KEYS.activePlayers(newGame.gameId));
                await redis.del(REDIS_KEYS.submittedWords(newGame.gameId));
                await redis.del(REDIS_KEYS.gameScores(newGame.gameId));
            } catch { }

            const newCyclePayload = {
                type: 'devvit-message' as const,
                data: { message: { type: 'newCycle', data: newGame } }
            };
            await realtime.send('game_events', newCyclePayload);
            // Echo to self — postMessage already wraps in devvit-message, so send inner only
            context.ui.webView.postMessage('game_webview', { type: 'newCycle', data: newGame });
        }

        // ============================================================
        // TICKER: Runs every second. ALL state comes from Redis.
        // ============================================================
        const ticker = useInterval(async () => {
            try {
                const state = await getFreshGameState(redis);
                if (!state) return;

                const elapsed = Math.floor((Date.now() - state.cycleStartTime) / 1000);

                // CYCLE EXPIRED: Create a brand new cycle
                if (elapsed >= TOTAL_CYCLE) {
                    await createNewCycle();
                    return;
                }

                const { phase, timeLeft } = getPhaseInfo(state.cycleStartTime);
                let nextPhase = phase;
                let nextCycleStart = state.cycleStartTime;

                // Phase transition logic
                if (phase !== state.phase) {
                    if (state.phase === 'lobby' && phase === 'game') {
                        const playerCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                        if (playerCount < MIN_PLAYERS) {
                            // Not enough players, restart lobby
                            nextCycleStart = Date.now();
                            nextPhase = 'lobby';
                        }
                    }
                    // Save updated state
                    const newState = { ...state, phase: nextPhase, cycleStartTime: nextCycleStart };
                    await redis.set(REDIS_KEYS.currentGame, JSON.stringify(newState));

                    // Broadcast phase change
                    const phaseData = { phase: nextPhase, newState, timeLeft: getPhaseInfo(nextCycleStart).timeLeft };
                    const phasePayload = {
                        type: 'devvit-message' as const,
                        data: { message: { type: 'phaseChange', data: phaseData } }
                    };
                    await realtime.send('game_events', phasePayload);
                    // postMessage already wraps, so send inner only
                    context.ui.webView.postMessage('game_webview', { type: 'phaseChange', data: phaseData });
                    return;
                }

                // Normal tick: send timeSync directly to local webview
                const info = getPhaseInfo(nextCycleStart);
                context.ui.webView.postMessage('game_webview', {
                    type: 'timeSync',
                    data: { phase: info.phase, timeLeft: info.timeLeft, gameId: state.gameId }
                });

                // Broadcast to others
                await realtime.send('game_events', {
                    type: 'devvit-message',
                    data: {
                        message: {
                            type: 'timeSync',
                            data: { phase: info.phase, timeLeft: info.timeLeft, gameId: state.gameId }
                        }
                    }
                });
            } catch (e) {
                console.error('Ticker Error:', e);
            }
        }, 1000);

        ticker.start();

        // ============================================================
        // CHANNEL: Forward realtime messages from others to webview
        // ============================================================
        const channel = useChannel({
            name: 'game_events',
            onMessage: (msg: any) => {
                // Channel messages arrive wrapped: { type: 'devvit-message', data: { message: {...} } }
                // postMessage ALSO wraps in devvit-message, so unwrap first
                if (msg?.type === 'devvit-message' && msg?.data?.message) {
                    context.ui.webView.postMessage('game_webview', msg.data.message);
                } else {
                    context.ui.webView.postMessage('game_webview', msg);
                }
            },
        });

        if (!subscribed) {
            channel.subscribe();
            setSubscribed(true);
        }

        // ============================================================
        // WEBVIEW MESSAGE HANDLER
        // CRITICAL: NEVER use stale closures. Always fetch from Redis.
        // ============================================================
        const handleWebviewMessage = async (message: any) => {
            if (!message || !message.type) return;

            // Use the username from useState (stable, set once)
            const currentUsername = username || 'Guest';

            switch (message.type) {
                case 'ready': {
                    // Fetch FRESH state from Redis (never use closure)
                    const state = await getFreshGameState(redis);
                    if (!state) break;

                    const { phase, timeLeft } = getPhaseInfo(state.cycleStartTime);

                    // Auto-register player into activePlayers (fix issue 4: lobby freeze)
                    // This ensures at least 1 player exists before the ticker checks zCard
                    const playerKey = `${currentUsername}:${sessionId}`;
                    const existing = await redis.zScore(REDIS_KEYS.activePlayers(state.gameId), playerKey);
                    if (existing === undefined) {
                        await redis.zAdd(REDIS_KEYS.activePlayers(state.gameId), {
                            member: playerKey,
                            score: Date.now()
                        });
                    }

                    // Fetch current player list
                    const players = await redis.zRange(
                        REDIS_KEYS.activePlayers(state.gameId), 0, 9, { reverse: true, by: 'rank' }
                    );

                    context.ui.webView.postMessage('game_webview', {
                        type: 'init',
                        data: {
                            username: currentUsername,
                            phase,
                            timeLeft,
                            gameId: state.gameId,
                            letters: state.letters,
                            // Strip session suffix from display names
                            players: players.map((p: any) => ({
                                name: p.member.includes(':') ? p.member.split(':')[0] : p.member,
                                status: 'online'
                            }))
                        }
                    });
                    break;
                }

                case 'joinGame': {
                    // Fetch FRESH state from Redis (never use closure)
                    const state = await getFreshGameState(redis);
                    if (!state) {
                        console.error('❌ joinGame: No game state in Redis!');
                        break;
                    }

                    const playerCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                    if (playerCount >= MAX_PLAYERS) break;

                    // Use sessionId suffix to make same-user multi-tab count as separate players
                    const playerKey = `${currentUsername}:${sessionId}`;

                    // IDEMPOTENT: Skip if already joined this game
                    const existingScore = await redis.zScore(REDIS_KEYS.activePlayers(state.gameId), playerKey);
                    if (existingScore !== undefined) {
                        // Already in game, just send current count
                        const currentCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                        context.ui.webView.postMessage('game_webview', {
                            type: 'playerJoined',
                            data: { username: currentUsername, playerCount: currentCount }
                        });
                        break;
                    }

                    console.log(`✅ Player joining: ${currentUsername} (key: ${playerKey}, game: ${state.gameId})`);

                    // Add player to Redis with timestamp score
                    await redis.zAdd(REDIS_KEYS.activePlayers(state.gameId), {
                        member: playerKey,
                        score: Date.now()
                    });

                    const newCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                    console.log(`👥 Total players now: ${newCount}`);

                    const joinData = { username: currentUsername, playerCount: newCount };
                    const joinPayload = {
                        type: 'devvit-message' as const,
                        data: { message: { type: 'playerJoined', data: joinData } }
                    };

                    // Broadcast to others
                    await realtime.send('game_events', joinPayload);
                    // Echo to self — postMessage already wraps
                    context.ui.webView.postMessage('game_webview', { type: 'playerJoined', data: joinData });
                    break;
                }

                case 'submitWord': {
                    const state = await getFreshGameState(redis);
                    if (!state) break;

                    const { word, score } = message.data;
                    if (!word || !score) break;

                    const { phase } = getPhaseInfo(state.cycleStartTime);
                    if (phase !== 'game') break;

                    // Use session-keyed username for score tracking
                    const scoreKey = `${currentUsername}:${sessionId}`;

                    // Check global duplicate
                    const globalCheck = await redis.zScore(REDIS_KEYS.submittedWords(state.gameId), word);
                    if (globalCheck !== undefined) break;

                    // Check personal duplicate
                    const personalCheck = await redis.zScore(REDIS_KEYS.playerWords(state.gameId, currentUsername), word);
                    if (personalCheck !== undefined) break;

                    // Record word
                    await redis.zAdd(REDIS_KEYS.submittedWords(state.gameId), { member: word, score: Date.now() });
                    await redis.zAdd(REDIS_KEYS.playerWords(state.gameId, currentUsername), { member: word, score: 0 });

                    // Update score (use scoreKey so session-suffixed names show in leaderboard)
                    const currentScore = await redis.zScore(REDIS_KEYS.gameScores(state.gameId), scoreKey) || 0;
                    const newTotal = currentScore + score;
                    await redis.zAdd(REDIS_KEYS.gameScores(state.gameId), { member: scoreKey, score: newTotal });

                    // Get leaderboard
                    const topScores = await redis.zRange(
                        REDIS_KEYS.gameScores(state.gameId), 0, 5, { reverse: true, by: 'rank' }
                    );

                    const scoreData = { username: currentUsername, word, score, totalScore: newTotal, leaderboard: topScores };
                    const scorePayload = {
                        type: 'devvit-message' as const,
                        data: { message: { type: 'scoreUpdate', data: scoreData } }
                    };

                    // Broadcast to others
                    await realtime.send('game_events', scorePayload);
                    // Echo to self — postMessage already wraps
                    context.ui.webView.postMessage('game_webview', { type: 'scoreUpdate', data: scoreData });
                    break;
                }

                case 'getLeaderboard': {
                    const state = await getFreshGameState(redis);
                    if (!state) break;

                    const scores = await redis.zRange(
                        REDIS_KEYS.gameScores(state.gameId), 0, 10, { reverse: true, by: 'rank' }
                    );
                    context.ui.webView.postMessage('game_webview', { type: 'leaderboard', data: scores });
                    break;
                }

                case 'getGlobalLeaderboard': {
                    const globalScores = await redis.zRange(
                        REDIS_KEYS.globalLeaderboard, 0, 10, { reverse: true, by: 'rank' }
                    );
                    context.ui.webView.postMessage('game_webview', { type: 'globalLeaderboard', data: globalScores });
                    break;
                }

                case 'log': {
                    console.log(`[WebView]:`, message.data);
                    break;
                }
            }
        };

        return (
            <vstack height="100%" width="100%" backgroundColor="#0e1113" alignment="center middle">
                <webview
                    id="game_webview"
                    url="index.html"
                    width="100%"
                    height="100%"
                    onMessage={handleWebviewMessage}
                />
            </vstack>
        );
    },
});

Devvit.addMenuItem({
    label: 'Create Word Maestro Game',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, context) => {
        const { reddit, ui } = context;
        const subreddit = await reddit.getCurrentSubreddit();
        const post = await reddit.submitPost({
            title: '🎮 Word Maestro - Join the Global Word Battle!',
            subredditName: subreddit.name,
            preview: (
                <vstack alignment="center middle" height="100%" backgroundColor="#0e1113">
                    <text size="xlarge" color="white">Loading Word Maestro...</text>
                </vstack>
            ),
        });
        ui.showToast({ text: 'Game created! Check the new post.' });
        ui.navigateTo(post);
    },
});

export default Devvit;
