/**
 * Multiplayer Helper for Word Maestro
 * Handles communication between the webview and Devvit server
 * 
 * Message Protocol:
 * - Webview → Devvit: postMessage to parent
 * - Devvit → Webview: 'message' events with type/data
 * 
 * Server message types received:
 *   init          - Initial state (username, phase, timeLeft, letters)
 *   timeSync      - Every second (phase, timeLeft, gameId, letters)
 *   phaseChange   - Phase transition (phase, timeLeft, finalScores?)
 *   scoreUpdate   - Another player scored (username, word, score, leaderboard)
 *   playerJoined  - Player joined (username, playerCount)
 *   newCycle      - New 80s cycle started (full GameState)
 *   leaderboard   - Leaderboard response
 * 
 * Client message types sent:
 *   ready           - Webview loaded
 *   joinGame        - Player wants to join
 *   submitWord      - Word submission (word, score)
 *   getLeaderboard  - Request current leaderboard
 */

class MultiplayerHelper {
    constructor() {
        this.username = '';
        this.gameId = '';
        this.phase = 'lobby';
        this.timeLeft = 10;
        this.letters = [];
        this.isDevvit = this.detectDevvit();
        this.callbacks = {
            onInit: null,
            onTimeSync: null,
            onPhaseChange: null,
            onScoreUpdate: null,
            onPlayerJoined: null,
            onNewCycle: null,
            onLeaderboardUpdate: null,
        };

        if (this.isDevvit) {
            this.setupDevvitListener();
            this.hijackConsole(); // Forward logs to Devvit terminal
        } else {
            console.log('🌐 Running in standalone mode (not in Devvit)');
        }
    }

    /**
     * Hijack console methods to forward logs to Devvit
     */
    hijackConsole() {
        this.originalLog = console.log;
        this.originalWarn = console.warn;
        this.originalError = console.error;

        console.log = (...args) => {
            this.originalLog.apply(console, args);
            // Avoid infinite loop: don't forward logs that originated from sendToDevvit
            if (args[0] && typeof args[0] === 'string' && args[0].includes('📤 Sending to Devvit')) return;
            this.sendToDevvit({ type: 'log', data: args.join(' ') });
        };

        console.warn = (...args) => {
            this.originalWarn.apply(console, args);
            this.sendToDevvit({ type: 'log', data: 'WARN: ' + args.join(' ') });
        };

        console.error = (...args) => {
            this.originalError.apply(console, args);
            this.sendToDevvit({ type: 'log', data: 'ERROR: ' + args.join(' ') });
        };

        // Notify that logging is set up
        console.log('✅ Console hijacking active - logs forwarding to Devvit');
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
            const msg = event.data;
            if (!msg || !msg.type) return;

            // Handle Devvit wrapper format
            let message = msg;
            if (msg.type === 'devvit-message' && msg.data?.message) {
                message = msg.data.message;
            }

            switch (message.type) {
                case 'init':
                    this.username = message.data?.username || 'Player';
                    this.phase = message.data?.phase || 'lobby';
                    this.timeLeft = message.data?.timeLeft || 10;
                    this.gameId = message.data?.gameId || '';
                    this.letters = message.data?.letters || [];
                    console.log('🎮 Initialized:', this.username, 'Phase:', this.phase);
                    if (this.callbacks.onInit) {
                        this.callbacks.onInit(message.data);
                    }
                    break;

                case 'timeSync':
                    this.phase = message.data?.phase || this.phase;
                    this.timeLeft = message.data?.timeLeft ?? this.timeLeft;
                    this.gameId = message.data?.gameId || this.gameId;
                    this.letters = message.data?.letters || this.letters;
                    // Temp debug log to confirm receipt
                    // (Silenced to prevent log spam every second)
                    if (this.callbacks.onTimeSync) {
                        this.callbacks.onTimeSync(message.data);
                    }
                    break;

                case 'phaseChange':
                    this.phase = message.data?.phase || this.phase;
                    this.timeLeft = message.data?.timeLeft ?? this.timeLeft;
                    console.log('🔄 Phase changed to:', this.phase);
                    if (this.callbacks.onPhaseChange) {
                        this.callbacks.onPhaseChange(message.data);
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

                case 'newCycle':
                    this.gameId = message.data?.gameId || this.gameId;
                    this.letters = message.data?.letters || this.letters;
                    this.phase = 'lobby';
                    if (this.callbacks.onNewCycle) {
                        this.callbacks.onNewCycle(message.data);
                    }
                    if (this.callbacks.onInit) {
                        this.callbacks.onInit(message.data);
                    }
                    break;

                case 'leaderboard':
                case 'globalLeaderboard':
                    if (this.callbacks.onLeaderboard) {
                        this.callbacks.onLeaderboard(message.data);
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
            if (this.originalLog) {
                this.originalLog('📤 Sending to Devvit:', JSON.stringify(message));
            } else {
                console.log('📤 Sending to Devvit:', JSON.stringify(message));
            }
            window.parent.postMessage(message, '*');
        } else {
            if (this.originalWarn) {
                this.originalWarn('⚠️ accurate sendToDevvit failed: isDevvit=', this.isDevvit, 'parent=', !!window.parent);
            } else {
                console.warn('⚠️ accurate sendToDevvit failed: isDevvit=', this.isDevvit, 'parent=', !!window.parent);
            }
        }
    }

    /**
     * Submit a word with score to the server
     */
    submitWord(word, score) {
        if (this.isDevvit) {
            this.sendToDevvit({
                type: 'submitWord',
                data: { word, score }
            });
        }
        console.log(`📝 Submitted: ${word} for ${score} pts`);
    }

    /**
     * Request current leaderboard
     */
    onLeaderboard(callback) {
        this.callbacks.onLeaderboard = callback;
    }

    onTimeSync(callback) {
        this.callbacks.onTimeSync = callback;
    }

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
            this.sendToDevvit({ type: 'joinGame' });
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

    // Callback registrations
    onInit(cb) { this.callbacks.onInit = cb; }
    onTimeSync(cb) { this.callbacks.onTimeSync = cb; }
    onPhaseChange(cb) { this.callbacks.onPhaseChange = cb; }
    onScoreUpdate(cb) { this.callbacks.onScoreUpdate = cb; }
    onPlayerJoined(cb) { this.callbacks.onPlayerJoined = cb; }
    onNewCycle(cb) { this.callbacks.onNewCycle = cb; }
    onLeaderboardUpdate(cb) { this.callbacks.onLeaderboardUpdate = cb; }
    onGlobalLeaderboard(cb) { this.callbacks.onGlobalLeaderboard = cb; }
}

// Create global instance
window.multiplayerHelper = new MultiplayerHelper();
