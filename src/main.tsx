import { Devvit, useState, useChannel, useInterval } from '@devvit/public-api';

// Configure Devvit with required capabilities
Devvit.configure({
    redditAPI: true,
    redis: true,
    realtime: true,
});

// Game constants
const GAME_DURATION = 60;       // seconds for gameplay
const LOBBY_DURATION = 10;      // seconds for lobby countdown
const END_SCREEN_DURATION = 10; // seconds for end/results screen
const TOTAL_CYCLE = LOBBY_DURATION + GAME_DURATION + END_SCREEN_DURATION; // 80s total
const MAX_PLAYERS = 50;         // Devvit realtime limit safety

// Redis keys
const REDIS_KEYS = {
    currentGame: 'game:current',
    globalLeaderboard: 'leaderboard:global',
    activePlayers: (gameId: string) => `game:${gameId}:players`,
    gameScores: (gameId: string) => `game:${gameId}:scores`,
    playerWords: (gameId: string, username: string) => `game:${gameId}:words:${username}`,
    gameHistory: 'game:history',
};

// Game phases
type GamePhase = 'lobby' | 'game' | 'end';

interface GameState {
    phase: GamePhase;
    gameId: string;
    cycleStartTime: number;  // When this 80s cycle started
    letters: string[];
    playerCount: number;
}

/**
 * Calculate current phase and time remaining from cycle start time
 */
function getPhaseInfo(cycleStartTime: number): { phase: GamePhase; timeLeft: number; phaseElapsed: number } {
    const elapsed = Math.floor((Date.now() - cycleStartTime) / 1000);

    if (elapsed < LOBBY_DURATION) {
        return {
            phase: 'lobby',
            timeLeft: LOBBY_DURATION - elapsed,
            phaseElapsed: elapsed,
        };
    } else if (elapsed < LOBBY_DURATION + GAME_DURATION) {
        const gameElapsed = elapsed - LOBBY_DURATION;
        return {
            phase: 'game',
            timeLeft: GAME_DURATION - gameElapsed,
            phaseElapsed: gameElapsed,
        };
    } else if (elapsed < TOTAL_CYCLE) {
        const endElapsed = elapsed - LOBBY_DURATION - GAME_DURATION;
        return {
            phase: 'end',
            timeLeft: END_SCREEN_DURATION - endElapsed,
            phaseElapsed: endElapsed,
        };
    } else {
        // Cycle has ended, start a new one
        return { phase: 'lobby', timeLeft: LOBBY_DURATION, phaseElapsed: 0 };
    }
}

/**
 * Generate balanced grid letters (5 vowels + 11 consonants = 16 tiles)
 */
function generateLetters(): string[] {
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    const consonants = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];

    // Shuffle and pick 11 consonants
    const shuffledConsonants = [...consonants].sort(() => Math.random() - 0.5).slice(0, 11);
    const letters = [...vowels, ...shuffledConsonants];
    return letters.sort(() => Math.random() - 0.5);
}

// Create custom post type
Devvit.addCustomPostType({
    name: 'World Word Winner',
    description: 'A multiplayer word game - compete globally!',
    height: 'tall',
    render: (context) => {
        const { redis, realtime, reddit } = context;
        const [username, setUsername] = useState<string>('');
        const [gameState, setGameState] = useState<GameState | null>(null);

        // Get current user on mount
        useState(async () => {
            const user = await reddit.getCurrentUser();
            if (user) {
                setUsername(user.username);
            }

            // Initialize or fetch game state
            await initOrFetchGame();
        });

        /**
         * Initialize game state from Redis or create a new cycle
         */
        const initOrFetchGame = async () => {
            const raw = await redis.get(REDIS_KEYS.currentGame);

            if (raw) {
                const state = JSON.parse(raw) as GameState;
                const { phase } = getPhaseInfo(state.cycleStartTime);
                const elapsed = Math.floor((Date.now() - state.cycleStartTime) / 1000);

                if (elapsed >= TOTAL_CYCLE) {
                    // Cycle expired, start fresh
                    await createNewCycle();
                } else {
                    state.phase = phase;
                    setGameState(state);
                }
            } else {
                await createNewCycle();
            }
        };

        /**
         * Create a brand new game cycle
         */
        const createNewCycle = async () => {
            const newGame: GameState = {
                phase: 'lobby',
                gameId: Date.now().toString(),
                cycleStartTime: Date.now(),
                letters: generateLetters(),
                playerCount: 0,
            };
            await redis.set(REDIS_KEYS.currentGame, JSON.stringify(newGame));
            setGameState(newGame);

            // Broadcast new cycle to all connected clients
            await realtime.send('game-events', {
                type: 'devvit-message',
                data: {
                    message: {
                        type: 'newCycle',
                        data: newGame,
                    }
                }
            });
        };

        // Poll every second to check phase transitions
        const ticker = useInterval(async () => {
            if (!gameState) return;

            const { phase: currentPhase, timeLeft } = getPhaseInfo(gameState.cycleStartTime);

            // Phase changed - update state
            if (currentPhase !== gameState.phase) {
                const updatedState = { ...gameState, phase: currentPhase };
                setGameState(updatedState);

                // If cycle ended, create new one
                if (currentPhase === 'lobby' && gameState.phase === 'end') {
                    await createNewCycle();
                }

                // When game phase starts, broadcast
                if (currentPhase === 'game' && gameState.phase === 'lobby') {
                    await realtime.send('game-events', {
                        type: 'devvit-message',
                        data: {
                            message: {
                                type: 'phaseChange',
                                data: { phase: 'game', timeLeft: GAME_DURATION }
                            }
                        }
                    });
                }

                // When end phase starts, send final scores
                if (currentPhase === 'end' && gameState.phase === 'game') {
                    // Fetch and broadcast final scores
                    const scores = await redis.zRange(
                        REDIS_KEYS.gameScores(gameState.gameId), 0, 10,
                        { reverse: true, by: 'rank' }
                    );
                    await realtime.send('game-events', {
                        type: 'devvit-message',
                        data: {
                            message: {
                                type: 'phaseChange',
                                data: {
                                    phase: 'end',
                                    timeLeft: END_SCREEN_DURATION,
                                    finalScores: scores,
                                }
                            }
                        }
                    });

                    // Update global leaderboard
                    for (const entry of scores) {
                        const currentGlobal = await redis.zScore(REDIS_KEYS.globalLeaderboard, entry.member) || 0;
                        await redis.zAdd(REDIS_KEYS.globalLeaderboard, {
                            member: entry.member,
                            score: currentGlobal + entry.score,
                        });
                    }
                }
            }

            // Send time sync to webview
            context.ui.webView.postMessage('game-webview', {
                type: 'timeSync',
                data: {
                    phase: currentPhase,
                    timeLeft,
                    gameId: gameState.gameId,
                    letters: gameState.letters,
                }
            });
        }, 1000);

        ticker.start();

        // Subscribe to realtime updates from other players
        const channel = useChannel({
            name: 'game-events',
            onMessage: (msg: any) => {
                // Forward realtime messages to webview
                if (msg.type === 'devvit-message' && msg.data?.message) {
                    context.ui.webView.postMessage('game-webview', msg.data.message);
                }
            },
        });

        channel.subscribe();

        // Handle messages from webview
        const handleWebviewMessage = async (message: any) => {
            if (!message || !message.type) return;

            switch (message.type) {
                case 'ready': {
                    // Webview loaded - send current state
                    if (gameState) {
                        const { phase, timeLeft } = getPhaseInfo(gameState.cycleStartTime);
                        context.ui.webView.postMessage('game-webview', {
                            type: 'init',
                            data: {
                                username: username || 'Player',
                                phase,
                                timeLeft,
                                gameId: gameState.gameId,
                                letters: gameState.letters,
                            }
                        });
                    }
                    break;
                }

                case 'joinGame': {
                    // Track player joining
                    if (gameState) {
                        const playerCount = await redis.sCard(REDIS_KEYS.activePlayers(gameState.gameId));
                        if (playerCount < MAX_PLAYERS) {
                            await redis.sAdd(REDIS_KEYS.activePlayers(gameState.gameId), [username]);
                            const newCount = await redis.sCard(REDIS_KEYS.activePlayers(gameState.gameId));

                            // Broadcast player joined
                            await realtime.send('game-events', {
                                type: 'devvit-message',
                                data: {
                                    message: {
                                        type: 'playerJoined',
                                        data: { username, playerCount: newCount }
                                    }
                                }
                            });
                        }
                    }
                    break;
                }

                case 'submitWord': {
                    // Process word submission
                    const { word, score } = message.data;
                    if (!gameState || !word || !score) break;

                    const { phase } = getPhaseInfo(gameState.cycleStartTime);
                    if (phase !== 'game') break; // Only accept during game phase

                    // Check if word already submitted by this player
                    const alreadySubmitted = await redis.sIsMember(
                        REDIS_KEYS.playerWords(gameState.gameId, username), word
                    );
                    if (alreadySubmitted) break;

                    // Record the word
                    await redis.sAdd(REDIS_KEYS.playerWords(gameState.gameId, username), [word]);

                    // Update player score (cumulative)
                    const currentScore = await redis.zScore(
                        REDIS_KEYS.gameScores(gameState.gameId), username
                    ) || 0;
                    await redis.zAdd(REDIS_KEYS.gameScores(gameState.gameId), {
                        member: username,
                        score: currentScore + score,
                    });

                    // Get updated leaderboard (top 6)
                    const topScores = await redis.zRange(
                        REDIS_KEYS.gameScores(gameState.gameId), 0, 5,
                        { reverse: true, by: 'rank' }
                    );

                    // Broadcast score update to all players
                    await realtime.send('game-events', {
                        type: 'devvit-message',
                        data: {
                            message: {
                                type: 'scoreUpdate',
                                data: {
                                    username,
                                    word,
                                    score,
                                    totalScore: currentScore + score,
                                    leaderboard: topScores,
                                }
                            }
                        }
                    });
                    break;
                }

                case 'getLeaderboard': {
                    if (gameState) {
                        const scores = await redis.zRange(
                            REDIS_KEYS.gameScores(gameState.gameId), 0, 10,
                            { reverse: true, by: 'rank' }
                        );
                        context.ui.webView.postMessage('game-webview', {
                            type: 'leaderboard',
                            data: scores,
                        });
                    }
                    break;
                }

                case 'getGlobalLeaderboard': {
                    const globalScores = await redis.zRange(
                        REDIS_KEYS.globalLeaderboard, 0, 10,
                        { reverse: true, by: 'rank' }
                    );
                    context.ui.webView.postMessage('game-webview', {
                        type: 'globalLeaderboard',
                        data: globalScores,
                    });
                    break;
                }
            }
        };

        return (
            <vstack height="100%" width="100%" backgroundColor="#0e1113">
                <webview
                    id="game-webview"
                    url="index.html"
                    width="100%"
                    height="100%"
                    onMessage={handleWebviewMessage}
                />
            </vstack>
        );
    },
});

// Menu action to create game post
Devvit.addMenuItem({
    label: 'Create World Word Winner Game',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, context) => {
        const { reddit, ui } = context;
        const subreddit = await reddit.getCurrentSubreddit();

        const post = await reddit.submitPost({
            title: '🎮 World Word Winner - Join the Global Word Battle!',
            subredditName: subreddit.name,
            preview: (
                <vstack alignment="center middle" height="100%" backgroundColor="#0e1113">
                    <text size="xlarge" color="white">Loading World Word Winner...</text>
                </vstack>
            ),
        });

        ui.showToast({ text: 'Game created! Check the new post.' });
        ui.navigateTo(post);
    },
});

export default Devvit;
