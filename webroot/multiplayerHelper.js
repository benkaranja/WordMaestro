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
        // Use the real originals exposed by the debug panel script (loaded before us)
        this.originalLog = window._realConsoleLog || console.log;
        this.originalWarn = window._realConsoleWarn || console.warn;
        this.originalError = window._realConsoleError || console.error;

        const self = this;
        console.log = (...args) => {
            self.originalLog.apply(console, args);
            // Avoid infinite loop: don't forward logs that originated from sendToDevvit
            if (args[0] && typeof args[0] === 'string' && args[0].includes('📤 Sending to Devvit')) return;
            self.sendToDevvit({ type: 'log', data: args.join(' ') });
        };

        console.warn = (...args) => {
            self.originalWarn.apply(console, args);
            self.sendToDevvit({ type: 'log', data: 'WARN: ' + args.join(' ') });
        };

        console.error = (...args) => {
            self.originalError.apply(console, args);
            self.sendToDevvit({ type: 'log', data: 'ERROR: ' + args.join(' ') });
        };

        console.log('✅ Console hijacking active - logs forwarding to Devvit');
    }

    /**
     * Detect if running inside Devvit webview
     */
    detectDevvit() {
        const isDevvit = typeof window !== 'undefined' &&
            window.parent !== window &&
            typeof window.parent.postMessage === 'function';
        // Use real console to avoid circular dependency during init
        (window._realConsoleLog || console.log)('🔍 detectDevvit:', isDevvit,
            'parent!==window:', window.parent !== window,
            'postMessage:', typeof window.parent?.postMessage);
        return isDevvit;
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

        // Notify Devvit that webview is ready — send with retry
        console.log('🚀 Sending ready message to Devvit...');
        this.sendToDevvit({ type: 'ready' });
        // Retry ready in case the parent wasn't listening yet
        setTimeout(() => {
            console.log('🚀 Retry ready #1');
            this.sendToDevvit({ type: 'ready' });
        }, 500);
        setTimeout(() => {
            console.log('🚀 Retry ready #2');
            this.sendToDevvit({ type: 'ready' });
        }, 1500);
    }

    /**
     * Send message to Devvit parent — try BOTH raw and wrapped formats
     */
    sendToDevvit(message) {
        if (this.isDevvit && window.parent) {
            if (this.originalLog) {
                this.originalLog('📤 Sending to Devvit:', message.type);
            }
            // Send RAW format (what Devvit docs say)
            try {
                window.parent.postMessage(message, '*');
            } catch (e) { /* ignore */ }
            // Also send WRAPPED format (devvit-message envelope)
            try {
                window.parent.postMessage({
                    type: 'devvit-message',
                    data: { message: message }
                }, '*');
            } catch (e) { /* ignore */ }
        } else {
            if (this.originalWarn) {
                this.originalWarn('⚠️ sendToDevvit failed: isDevvit=', this.isDevvit, 'parent=', !!window.parent);
            } else {
                console.warn('⚠️ sendToDevvit failed: isDevvit=', this.isDevvit, 'parent=', !!window.parent);
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

// Global error handlers for Reddit app debugging
window.onerror = function (msg, url, line, col, error) {
    const detail = `UNCAUGHT ERROR: ${msg} at ${url}:${line}:${col} | ${error?.stack || ''}`;
    console.error(detail);
    // Also post directly in case console hijack hasn't set up yet
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'log', data: detail }, '*');
    }
    return false;
};

window.addEventListener('unhandledrejection', function (event) {
    const detail = `UNHANDLED PROMISE REJECTION: ${event.reason?.message || event.reason} | ${event.reason?.stack || ''}`;
    console.error(detail);
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'log', data: detail }, '*');
    }
});

// Create global instance
window.multiplayerHelper = new MultiplayerHelper();
