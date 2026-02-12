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
    leaderboardCommentId: 'leaderboard:commentId',
    leaderboardPostId: 'leaderboard:postId',
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
// ============================================================
async function getFreshGameState(redis: any): Promise<GameState | null> {
    const raw = await redis.get(REDIS_KEYS.currentGame);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
}

// ============================================================
// Format leaderboard as Reddit markdown table
// ============================================================
function formatLeaderboardMarkdown(scores: { member: string; score: number }[]): string {
    const now = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
    let md = `# 🏆 Word Maestro — Global Leaderboard\n\n`;
    md += `*Last updated: ${now} UTC*\n\n`;

    if (!scores || scores.length === 0) {
        md += `No scores yet! Play the game to get on the leaderboard.\n`;
        return md;
    }

    md += `| Rank | Player | Score |\n`;
    md += `|:----:|:-------|------:|\n`;

    const medals = ['🥇', '🥈', '🥉'];
    scores.forEach((entry, i) => {
        const rank = i < 3 ? medals[i] : `${i + 1}`;
        const name = entry.member.includes(':') ? entry.member.split(':')[0] : entry.member;
        md += `| ${rank} | u/${name} | ${entry.score} |\n`;
    });

    md += `\n---\n*This leaderboard updates automatically after each game round.*`;
    return md;
}

// ============================================================
// SCHEDULER JOB: Update leaderboard comment periodically
// ============================================================
Devvit.addSchedulerJob({
    name: 'updateLeaderboardComment',
    onRun: async (event, context) => {
        const { redis, reddit } = context;
        try {
            const commentId = await redis.get(REDIS_KEYS.leaderboardCommentId);
            if (!commentId) {
                console.log('📊 [SCHEDULER] No leaderboard comment ID found, skipping');
                return;
            }

            // Fetch global leaderboard from Redis
            const scores = await redis.zRange(
                REDIS_KEYS.globalLeaderboard, 0, 19, { reverse: true, by: 'rank' }
            );

            const markdown = formatLeaderboardMarkdown(scores);

            // Edit the comment with updated leaderboard
            const comment = await reddit.getCommentById(commentId);
            await comment.edit({ text: markdown });
            console.log(`📊 [SCHEDULER] Leaderboard comment updated (${scores.length} players)`);
        } catch (e) {
            console.error('📊 [SCHEDULER] Failed to update leaderboard:', e);
        }
    },
});

// ============================================================
// CUSTOM POST TYPE
// ============================================================
Devvit.addCustomPostType({
    name: 'Word Maestro',
    description: 'Word Maestro — a multiplayer word game. Compete globally!',
    height: 'tall',
    render: (context) => {
        const { redis, realtime, reddit, postId } = context;
        // Fetch username once via useState initializer (runs once, no re-render loop)
        const [username] = useState(async () => {
            try {
                const user = await reddit.getCurrentUser();
                return user?.username || 'Guest';
            } catch { return 'Guest'; }
        });
        const [subscribed, setSubscribed] = useState(false);
        // Unique session ID for this tab instance
        const [sessionId] = useState(() => Math.random().toString(36).substring(2, 8));

        // ============================================================
        // Initialize game + AUTO-REGISTER PLAYER on server side
        // This guarantees playerCount >= 1 even if webview→server
        // messaging is broken (confirmed broken on Reddit mobile app)
        // ============================================================
        useAsync(async () => {
            // Ensure a game cycle exists
            let state = await getFreshGameState(redis);
            if (!state) {
                await createNewCycle();
                state = await getFreshGameState(redis);
            } else {
                const elapsed = Math.floor((Date.now() - state.cycleStartTime) / 1000);
                if (elapsed >= TOTAL_CYCLE) {
                    await createNewCycle();
                    state = await getFreshGameState(redis);
                }
            }

            // AUTO-REGISTER: Add this player to activePlayers immediately
            // This is the critical fix — we don't rely on webview 'ready' message
            if (state && username) {
                const playerKey = `${username}:${sessionId}`;
                await redis.zAdd(REDIS_KEYS.activePlayers(state.gameId), {
                    member: playerKey,
                    score: Date.now()
                });
                console.log(`✅ [INIT] Auto-registered player: ${playerKey} in game ${state.gameId}`);
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
                    console.log(`⏱ [TICK] Cycle expired, creating new cycle`);

                    // Before creating new cycle, update global leaderboard
                    try {
                        const gameScores = await redis.zRange(
                            REDIS_KEYS.gameScores(state.gameId), 0, -1, { reverse: true, by: 'rank' }
                        );
                        for (const entry of gameScores) {
                            const playerName = entry.member.includes(':') ? entry.member.split(':')[0] : entry.member;
                            const currentGlobal = await redis.zScore(REDIS_KEYS.globalLeaderboard, playerName) || 0;
                            await redis.zAdd(REDIS_KEYS.globalLeaderboard, {
                                member: playerName,
                                score: currentGlobal + entry.score
                            });
                        }
                        if (gameScores.length > 0) {
                            console.log(`📊 Updated global leaderboard for ${gameScores.length} players`);
                        }
                    } catch (e) {
                        console.error('📊 Failed to update global leaderboard:', e);
                    }

                    await createNewCycle();
                    return;
                }

                const { phase, timeLeft } = getPhaseInfo(state.cycleStartTime);
                let nextPhase = phase;
                let nextCycleStart = state.cycleStartTime;

                // Phase transition logic
                if (phase !== state.phase) {
                    console.log(`⏱ Phase transition: ${state.phase} → ${phase}`);
                    if (state.phase === 'lobby' && phase === 'game') {
                        const playerCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                        console.log(`⏱ Lobby→Game check: playerCount=${playerCount}, MIN=${MIN_PLAYERS}`);
                        if (playerCount < MIN_PLAYERS) {
                            nextCycleStart = Date.now();
                            nextPhase = 'lobby';
                            console.log(`⏱ Not enough players, restarting lobby`);
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
                    context.ui.webView.postMessage('game_webview', { type: 'phaseChange', data: phaseData });
                    return;
                }

                // Normal tick: send timeSync
                const info = getPhaseInfo(nextCycleStart);
                context.ui.webView.postMessage('game_webview', {
                    type: 'timeSync',
                    data: { phase: info.phase, timeLeft: info.timeLeft, gameId: state.gameId, letters: state.letters }
                });

                // Broadcast to other viewers
                await realtime.send('game_events', {
                    type: 'devvit-message',
                    data: {
                        message: {
                            type: 'timeSync',
                            data: { phase: info.phase, timeLeft: info.timeLeft, gameId: state.gameId, letters: state.letters }
                        }
                    }
                });
            } catch (e) {
                console.error(`⏱ Ticker error:`, e);
            }
        }, 1000);

        ticker.start();

        // ============================================================
        // CHANNEL: Forward realtime messages from others to webview
        // ============================================================
        const channel = useChannel({
            name: 'game_events',
            onMessage: (msg: any) => {
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
        // ============================================================
        const handleWebviewMessage = async (message: any) => {
            if (!message || !message.type) return;

            // Handle double-wrapped messages (webview might send devvit-message envelope)
            let msg = message;
            if (msg.type === 'devvit-message' && msg.data?.message) {
                msg = msg.data.message;
            }

            const currentUsername = username || 'Guest';

            switch (msg.type) {
                case 'ready': {
                    console.log(`📱 [READY] ✅ Message received from ${currentUsername}!`);
                    const state = await getFreshGameState(redis);
                    if (!state) {
                        console.error('❌ [READY] No game state in Redis!');
                        break;
                    }

                    const { phase, timeLeft } = getPhaseInfo(state.cycleStartTime);
                    console.log(`📱 [READY] Phase=${phase} TimeLeft=${timeLeft}`);

                    // Use stable ID: if logged in, use username. If guest, use session.
                    // This fixes "scores lost" on reload.
                    const playerKey = currentUsername !== 'Guest' ? currentUsername : `Guest-${sessionId}`;

                    await redis.zAdd(REDIS_KEYS.activePlayers(state.gameId), {
                        member: playerKey,
                        score: Date.now()
                    });

                    // Fetch player list
                    const players = await redis.zRange(
                        REDIS_KEYS.activePlayers(state.gameId), 0, 9, { reverse: true, by: 'rank' }
                    );

                    const initPayload = {
                        type: 'init',
                        data: {
                            username: currentUsername,
                            phase,
                            timeLeft,
                            gameId: state.gameId,
                            letters: state.letters,
                            displayName: currentUsername, // Default fallback
                            players: players.map((p: any) => ({
                                name: p.member.includes(':') ? p.member.split(':')[0] : p.member,
                                status: 'online'
                            }))
                        }
                    };

                    // Try to fetch real display name
                    try {
                        const currentUser = await context.reddit.getCurrentUser();
                        if (currentUser) {
                            // Use 'username' as fallback if displayName is not available on the type
                            // Note: Devvit types might not expose 'displayName' yet, checking at runtime or casting
                            const dName = (currentUser as any).displayName || currentUser.username;
                            initPayload.data.displayName = dName;
                        }
                    } catch (e) {
                        // Ignore
                    }

                    // (Redundant code removed)

                    context.ui.webView.postMessage('game_webview', initPayload);
                    break;
                }

                case 'joinGame': {
                    const state = await getFreshGameState(redis);
                    if (!state) break;

                    const playerCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                    if (playerCount >= MAX_PLAYERS) break;

                    const playerKey = currentUsername !== 'Guest' ? currentUsername : `Guest-${sessionId}`;
                    const existingScore = await redis.zScore(REDIS_KEYS.activePlayers(state.gameId), playerKey);
                    if (existingScore !== undefined) {
                        const currentCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                        context.ui.webView.postMessage('game_webview', {
                            type: 'playerJoined',
                            data: { username: currentUsername, playerCount: currentCount }
                        });
                        break;
                    }

                    await redis.zAdd(REDIS_KEYS.activePlayers(state.gameId), {
                        member: playerKey,
                        score: Date.now()
                    });

                    const newCount = await redis.zCard(REDIS_KEYS.activePlayers(state.gameId));
                    let dName = currentUsername;
                    try {
                        const currentUser = await context.reddit.getCurrentUser();
                        if (currentUser) {
                            dName = (currentUser as any).displayName || currentUser.username;
                        }
                    } catch (e) {
                        // Ignore
                    }

                    const joinData = { username: currentUsername, displayName: dName, playerCount: newCount };
                    const joinPayload = {
                        type: 'devvit-message' as const,
                        data: { message: { type: 'playerJoined', data: joinData } }
                    };

                    await realtime.send('game_events', joinPayload);
                    context.ui.webView.postMessage('game_webview', { type: 'playerJoined', data: joinData });
                    break;
                }

                case 'submitWord': {
                    const state = await getFreshGameState(redis);
                    if (!state) break;

                    const { word, score } = msg.data;
                    if (!word || !score) break;

                    const { phase } = getPhaseInfo(state.cycleStartTime);
                    if (phase !== 'game') break;

                    // Stable score key
                    const scoreKey = currentUsername !== 'Guest' ? currentUsername : `Guest-${sessionId}`;

                    // Check duplicates
                    const globalCheck = await redis.zScore(REDIS_KEYS.submittedWords(state.gameId), word);
                    if (globalCheck !== undefined) break;
                    const personalCheck = await redis.zScore(REDIS_KEYS.playerWords(state.gameId, scoreKey), word);
                    if (personalCheck !== undefined) break;

                    // Record word
                    await redis.zAdd(REDIS_KEYS.submittedWords(state.gameId), { member: word, score: Date.now() });
                    await redis.zAdd(REDIS_KEYS.playerWords(state.gameId, scoreKey), { member: word, score: 0 });

                    // Update game score
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

                    await realtime.send('game_events', scorePayload);
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
                    console.log(`[WebView]:`, msg.data);
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

// ============================================================
// MENU ITEM: Create game post + leaderboard comment
// ============================================================
Devvit.addMenuItem({
    label: 'Create Word Maestro Game',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, context) => {
        const { reddit, redis, scheduler, ui } = context;
        const subreddit = await reddit.getCurrentSubreddit();

        // Create the game post
        const post = await reddit.submitPost({
            title: '🎮 Word Maestro - Join the Global Word Battle!',
            subredditName: subreddit.name,
            preview: (
                <vstack alignment="center middle" height="100%" backgroundColor="#0e1113">
                    <text size="xlarge" color="white">Loading Word Maestro...</text>
                </vstack>
            ),
        });

        // Create the global leaderboard comment
        try {
            const leaderboardMd = formatLeaderboardMarkdown([]);
            const comment = await reddit.submitComment({
                id: post.id,
                text: leaderboardMd,
            });

            // Store comment + post IDs for the scheduler to update
            await redis.set(REDIS_KEYS.leaderboardCommentId, comment.id);
            await redis.set(REDIS_KEYS.leaderboardPostId, post.id);

            // Distinguish (sticky) the comment as mod
            try {
                await comment.distinguish(true);
            } catch (e) {
                console.warn('Could not distinguish comment:', e);
            }

            console.log(`📊 Leaderboard comment created: ${comment.id}`);

            // Schedule periodic leaderboard updates (every 60 seconds)
            await scheduler.runJob({
                name: 'updateLeaderboardComment',
                cron: '* * * * *', // every minute
            });
            console.log('📊 Leaderboard update job scheduled');
        } catch (e) {
            console.error('Failed to create leaderboard comment:', e);
        }

        ui.showToast({ text: 'Game created with leaderboard! Check the new post.' });
        ui.navigateTo(post);
    },
});

export default Devvit;
