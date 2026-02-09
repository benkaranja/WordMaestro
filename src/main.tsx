import { Devvit, useState, useChannel } from '@devvit/public-api';

// Configure Devvit with required capabilities
Devvit.configure({
    redditAPI: true,
    redis: true,
    realtime: true,
});

// Game constants
const GAME_DURATION = 60; // seconds
const LOBBY_DURATION = 10; // seconds
const END_SCREEN_DURATION = 10; // seconds
const MAX_PLAYERS_PER_ROUND = 50; // Devvit realtime limit safety

// Redis keys
const REDIS_KEYS = {
    currentGame: 'game:current',
    playerQueue: 'game:queue',
    activeGame: (gameId: string) => `game:${gameId}:active`,
    gameScores: (gameId: string) => `game:${gameId}:scores`,
    leaderboard: 'leaderboard:global',
};

// Game phases
type GamePhase = 'lobby' | 'game' | 'end';

interface GameState {
    phase: GamePhase;
    gameId: string;
    startTime: number;
    letters: string[];
    playerCount: number;
}

// Create custom post type
Devvit.addCustomPostType({
    name: 'World Word Winner',
    description: 'A multiplayer word game',
    height: 'tall',
    render: (context) => {
        const { redis, realtime, reddit, postId } = context;
        const [username, setUsername] = useState<string>('');
        const [gameState, setGameState] = useState<GameState | null>(null);
        const [webviewReady, setWebviewReady] = useState(false);

        // Get current user
        const getCurrentUser = async () => {
            const user = await reddit.getCurrentUser();
            if (user) {
                setUsername(user.username);
            }
        };

        // Initialize on mount
        useState(async () => {
            await getCurrentUser();
            await initializeGame();
        });

        // Initialize or get current game
        const initializeGame = async () => {
            const currentGame = await redis.get(REDIS_KEYS.currentGame);

            if (currentGame) {
                const state = JSON.parse(currentGame) as GameState;
                setGameState(state);
            } else {
                // Create new game
                const newGame: GameState = {
                    phase: 'lobby',
                    gameId: Date.now().toString(),
                    startTime: Date.now(),
                    letters: generateLetters(),
                    playerCount: 0,
                };
                await redis.set(REDIS_KEYS.currentGame, JSON.stringify(newGame));
                setGameState(newGame);
            }
        };

        // Generate balanced grid letters (5 vowels + 11 consonants)
        const generateLetters = (): string[] => {
            const vowels = ['A', 'E', 'I', 'O', 'U'];
            const consonants = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];

            const shuffledConsonants = consonants.sort(() => Math.random() - 0.5).slice(0, 11);
            const letters = [...vowels, ...shuffledConsonants];
            return letters.sort(() => Math.random() - 0.5);
        };

        // Subscribe to realtime updates
        const channel = useChannel({
            name: 'game-events',
            onMessage: (message: any) => {
                if (message.type === 'gameUpdate') {
                    setGameState(message.data as GameState);
                }
            },
        });

        channel.subscribe();

        // Handle messages from webview
        const handleWebviewMessage = async (message: any) => {
            switch (message.type) {
                case 'ready':
                    setWebviewReady(true);
                    // Send initial state to webview
                    context.ui.webView.postMessage('game-webview', {
                        type: 'init',
                        username,
                        gameState,
                    });
                    break;

                case 'submitWord':
                    // Validate and process word submission
                    const { word, score } = message.data;
                    if (gameState) {
                        await redis.zAdd(REDIS_KEYS.gameScores(gameState.gameId), {
                            member: username,
                            score: (await redis.zScore(REDIS_KEYS.gameScores(gameState.gameId), username) || 0) + score,
                        });

                        // Broadcast score update
                        await realtime.send('game-events', {
                            type: 'scoreUpdate',
                            data: { username, word, score },
                        });
                    }
                    break;

                case 'getLeaderboard':
                    if (gameState) {
                        const scores = await redis.zRange(REDIS_KEYS.gameScores(gameState.gameId), 0, 10, { reverse: true, by: 'rank' });
                        context.ui.webView.postMessage('game-webview', {
                            type: 'leaderboard',
                            data: scores,
                        });
                    }
                    break;
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
