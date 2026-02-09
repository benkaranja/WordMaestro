/**
 * Multiplayer Helper for World Word Winner
 * Handles communication between the webview and Devvit server
 */

class MultiplayerHelper {
    constructor() {
        this.username = '';
        this.gameState = null;
        this.isDevvit = this.detectDevvit();
        this.callbacks = {
            onGameStateUpdate: null,
            onLeaderboardUpdate: null,
            onScoreUpdate: null,
            onPlayerJoined: null,
        };

        if (this.isDevvit) {
            this.setupDevvitListener();
        } else {
            console.log('🌐 Running in standalone mode (not in Devvit)');
        }
    }

    /**
     * Detect if running inside Devvit webview
     */
    detectDevvit() {
        return typeof window !== 'undefined' &&
            window.parent !== window &&
            typeof window.parent.postMessage === 'function';
    }

    /**
     * Set up message listener for Devvit communication
     */
    setupDevvitListener() {
        window.addEventListener('message', (event) => {
            const message = event.data;

            if (!message || !message.type) return;

            switch (message.type) {
                case 'init':
                    this.username = message.username || 'Anonymous';
                    this.gameState = message.gameState;
                    console.log('🎮 Initialized with username:', this.username);
                    if (this.callbacks.onGameStateUpdate) {
                        this.callbacks.onGameStateUpdate(this.gameState);
                    }
                    break;

                case 'gameUpdate':
                    this.gameState = message.data;
                    if (this.callbacks.onGameStateUpdate) {
                        this.callbacks.onGameStateUpdate(this.gameState);
                    }
                    break;

                case 'leaderboard':
                    if (this.callbacks.onLeaderboardUpdate) {
                        this.callbacks.onLeaderboardUpdate(message.data);
                    }
                    break;

                case 'scoreUpdate':
                    if (this.callbacks.onScoreUpdate) {
                        this.callbacks.onScoreUpdate(message.data);
                    }
                    break;

                case 'playerJoined':
                    if (this.callbacks.onPlayerJoined) {
                        this.callbacks.onPlayerJoined(message.data);
                    }
                    break;
            }
        });

        // Notify Devvit that webview is ready
        this.sendToDevvit({ type: 'ready' });
    }

    /**
     * Send message to Devvit parent
     */
    sendToDevvit(message) {
        if (this.isDevvit && window.parent) {
            window.parent.postMessage(message, '*');
        }
    }

    /**
     * Submit a word with score to the server
     */
    submitWord(word, score) {
        if (this.isDevvit) {
            this.sendToDevvit({
                type: 'submitWord',
                data: { word, score, username: this.username }
            });
        }
        // In standalone mode, just log it
        console.log(`📝 Submitted word: ${word} for ${score} points`);
    }

    /**
     * Request current leaderboard
     */
    requestLeaderboard() {
        if (this.isDevvit) {
            this.sendToDevvit({ type: 'getLeaderboard' });
        }
    }

    /**
     * Join the current game
     */
    joinGame() {
        if (this.isDevvit) {
            this.sendToDevvit({
                type: 'joinGame',
                data: { username: this.username }
            });
        }
    }

    /**
     * Get current username
     */
    getUsername() {
        return this.username || 'Player';
    }

    /**
     * Check if running in multiplayer mode
     */
    isMultiplayer() {
        return this.isDevvit;
    }

    /**
     * Register callback for game state updates
     */
    onGameStateUpdate(callback) {
        this.callbacks.onGameStateUpdate = callback;
    }

    /**
     * Register callback for leaderboard updates
     */
    onLeaderboardUpdate(callback) {
        this.callbacks.onLeaderboardUpdate = callback;
    }

    /**
     * Register callback for score updates from other players
     */
    onScoreUpdate(callback) {
        this.callbacks.onScoreUpdate = callback;
    }

    /**
     * Register callback for when players join
     */
    onPlayerJoined(callback) {
        this.callbacks.onPlayerJoined = callback;
    }
}

// Create global instance
window.multiplayerHelper = new MultiplayerHelper();
