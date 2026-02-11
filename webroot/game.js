const LETTER_SCORES = {
    'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1,
    'F': 4, 'G': 2, 'H': 4, 'I': 1, 'J': 8,
    'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1,
    'P': 3, 'Q': 10, 'R': 1, 'S': 1, 'T': 1,
    'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10
};

const WORD_MULTIPLIERS = {
    1: 1,    // 1-4 letters
    2: 1,
    3: 1,
    4: 1,
    5: 1.5,  // 5 letters
    6: 2,    // 6 letters
    7: 2.5,  // 7 letters
    8: 3     // 8+ letters
};

const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];



class AudioManager {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        this.initializeSounds();
    }

    async initializeSounds() {
        // Create oscillator-based sounds
        this.sounds = {
            tileClick: this.createTileClickSound(),
            wordSuccess: this.createWordSuccessSound(),
            wordError: this.createWordErrorSound(),
            gameOver: this.createGameOverSound(),
            shuffle: this.createShuffleSound()
        };
    }

    createTileClickSound() {
        return () => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.connect(gain);
            gain.connect(this.context.destination);

            // Higher starting frequency for sharper attack
            osc.frequency.setValueAtTime(1200, this.context.currentTime);
            // Faster drop to lower frequency for a 'pop' effect
            osc.frequency.exponentialRampToValueAtTime(300, this.context.currentTime + 0.2);

            // Much lower volume
            gain.gain.setValueAtTime(0.03, this.context.currentTime);
            // Faster fade out
            gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.2);

            // Shorter overall duration
            osc.start();
            osc.stop(this.context.currentTime + 0.2);
        };
    }

    createWordSuccessSound() {
        return () => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.connect(gain);
            gain.connect(this.context.destination);

            osc.frequency.setValueAtTime(440, this.context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.context.currentTime + 0.15);

            gain.gain.setValueAtTime(0.2, this.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.15);

            osc.start();
            osc.stop(this.context.currentTime + 0.15);
        };
    }

    createWordErrorSound() {
        return () => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.connect(gain);
            gain.connect(this.context.destination);

            osc.frequency.setValueAtTime(220, this.context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, this.context.currentTime + 0.2);

            gain.gain.setValueAtTime(0.2, this.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);

            osc.start();
            osc.stop(this.context.currentTime + 0.2);
        };
    }

    createGameOverSound() {
        return () => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.connect(gain);
            gain.connect(this.context.destination);

            osc.frequency.setValueAtTime(880, this.context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, this.context.currentTime + 0.5);

            gain.gain.setValueAtTime(0.3, this.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);

            osc.start();
            osc.stop(this.context.currentTime + 0.5);
        };
    }

    createShuffleSound() {
        return () => {
            const duration = 0.3;
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.connect(gain);
            gain.connect(this.context.destination);

            osc.frequency.setValueAtTime(440, this.context.currentTime);

            // Create shuffle effect
            for (let i = 0; i < 3; i++) {
                const time = this.context.currentTime + (i * 0.1);
                osc.frequency.setValueAtTime(440 + (i * 220), time);
            }

            gain.gain.setValueAtTime(0.2, this.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

            osc.start();
            osc.stop(this.context.currentTime + duration);
        };
    }

    playSound(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName]();
        }
    }
}

class WordMaestro {
    constructor() {
        // Initialize multiplayer helper first to enable logging
        this.multiplayer = new MultiplayerHelper();
        console.log('🎮 Initializing WordMaestro game...');

        // Verify multiplayer connection
        this.multiplayer.onInit((data) => {
            console.log('✅ Received init data:', data);
            this.handleInit(data);
        });

        this.multiplayer.onPlayerJoined((data) => {
            console.log('👤 Player joined:', data);
            this.handlePlayerJoined(data);
        });

        this.multiplayer.onPhaseChange((data) => {
            console.log('🔄 Phase change:', data);
            this.handlePhaseChange(data);
        });

        this.multiplayer.onScoreUpdate((data) => {
            // console.log('🏆 Score update:', data);
            this.handleScoreUpdate(data);
        });

        this.multiplayer.onLeaderboard((data) => {
            this.handleLeaderboard(data);
        });

        this.multiplayer.onTimeSync((data) => {
            this.handleTimeSync(data);
        });

        // Cache DOM elements in constructor
        this.domElements = {
            wordDisplay: document.querySelector('.word-display'),
            clearBtn: document.querySelector('button.clear'),
            submitBtn: document.querySelector('button.submit'),
            shuffleBtn: document.querySelector('button.shuffle'),
            progressBar: document.querySelector('.progress-bar'),
            scoreDisplay: document.querySelector('.header-column:last-child span'),
            wordsFoundDisplay: document.querySelector('.header-column:first-child span'),
            grid: document.querySelector('.grid'),
            wordsList: document.querySelector('.words-list')
        };

        // Bind methods to preserve context
        this.handleTileClick = this.handleTileClick.bind(this);
        this.submitWord = this.submitWord.bind(this);
        this.clearSelection = this.clearSelection.bind(this);
        this.shuffleTiles = this.shuffleTiles.bind(this);

        // Game constants
        this.VOWELS = ['A', 'E', 'I', 'O', 'U'];
        this.CONSONANTS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];
        this.MIN_WORD_LENGTH = 2;

        // Scrabble-like letter scores
        this.LETTER_SCORES = {
            'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1,
            'F': 4, 'G': 2, 'H': 4, 'I': 1, 'J': 8,
            'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1,
            'P': 3, 'Q': 10, 'R': 1, 'S': 1, 'T': 1,
            'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4,
            'Z': 10
        };

        // Word length multipliers
        this.WORD_MULTIPLIERS = {
            2: 1,    // 2 letters
            3: 1,    // 3-4 letters
            4: 1,
            5: 1.5,  // 5 letters
            6: 2,    // 6 letters
            7: 2.5,  // 7 letters
            8: 3     // 8+ letters
        };

        // Game state
        this.selectedTiles = [];
        this.currentWord = '';
        this.score = 0;
        this.wordsFound = 0;
        this.gameActive = false;
        this.timeLeft = 60;
        this.dictionary = new Set();
        this.usedWords = new Set();
        this.currentScreen = 'start';
        this.audioInitialized = false;

        // Multiplayer state
        this.players = [];
        this.playerCount = 0;
        this.leaderboard = [];

        // Initialize grid letters
        this.gridLetters = this.generateGridLetters();

        // Initialize screens and DOM elements
        this.initializeScreens();
        this.initializeDOM();

        // Load dictionary and prepare game
        this.loadDictionary()
            .then(() => {
                console.log('📚 Dictionary loaded successfully');
                // Dismiss splash screen
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    const status = splash.querySelector('.splash-status');
                    if (status) status.textContent = 'Ready!';
                    setTimeout(() => splash.classList.add('hidden'), 400);
                }
                if (!this.phase) {
                    this.showLobbyScreen();
                    this.updateLobbyScreenPlayers();
                }
            })
            .catch(error => {
                console.error('❌ Failed to initialize game:', error);
                const splash = document.getElementById('splash-screen');
                if (splash) splash.classList.add('hidden');
            });

        // Initialize audio with safety checks
        this.initializeAudio();
        this.soundEnabled = true;

        // Sound toggle button
        const soundBtn = document.getElementById('sound-toggle');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                this.soundEnabled = !this.soundEnabled;
                soundBtn.textContent = this.soundEnabled ? '\u{1F50A}' : '\u{1F507}';
                soundBtn.classList.toggle('muted', !this.soundEnabled);
            });
        }

        this.gameTime = 60; // Game duration in seconds
        this.timeLeft = this.gameTime;
        this.countdownInterval = null;
        this.lobbyTimer = null;  // Track lobby countdown interval
        this.endTimer = null;    // Track end screen countdown interval
        this.timer = null;       // Track game timer interval
        this.score = 0;
        this.foundWords = [];
        this.playerStats = {
            wordsFound: 0,
            longestWord: '',
            highestScoringWord: '',
            highestScore: 0
        };
    }

    generateGridLetters() {
        // Start with all vowels
        let letters = [...this.VOWELS];

        // Calculate remaining spots for consonants (16 - 5 vowels = 11 spots)
        const remainingSpots = 16 - this.VOWELS.length;

        // Get random consonants for remaining spots
        const shuffledConsonants = [...this.CONSONANTS]
            .sort(() => Math.random() - 0.5)
            .slice(0, remainingSpots);

        // Combine vowels and consonants
        letters = letters.concat(shuffledConsonants);

        // Final shuffle
        return letters.sort(() => Math.random() - 0.5);
    }

    shuffleTiles() {
        if (!this.gameActive) return;

        this.playSound('shuffle');

        // Shuffle letters while keeping vowels
        const vowels = this.gridLetters.filter(letter => this.VOWELS.includes(letter));
        const consonants = this.gridLetters.filter(letter => !this.VOWELS.includes(letter));

        // Shuffle consonants
        const shuffledConsonants = consonants.sort(() => Math.random() - 0.5);

        // Combine and shuffle all while maintaining vowel presence
        this.gridLetters = [...vowels, ...shuffledConsonants].sort(() => Math.random() - 0.5);

        // Reset tiles and clear selection
        this.resetTiles();

        // Reinitialize grid with new letter arrangement
        this.initializeGrid();
    }

    initializeScreens() {
        // Get screen elements
        this.screens = {
            lobby: document.querySelector('.lobby-screen'),
            game: document.querySelector('.game-screen'),
            end: document.querySelector('.end-screen')
        };

        // Initialize countdown displays
        this.lobbyCountdown = document.querySelector('.lobby-screen .radial-progress');
        this.endCountdown = document.querySelector('.end-screen .radial-progress');

        // Verify all required elements exist
        if (!this.screens.lobby || !this.screens.game || !this.screens.end) {
            console.error('Required screen elements not found');
            return;
        }

        // Hide all screens initially
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.style.display = 'none';
        });
    }

    showScreen(screenName) {
        if (!this.screens || !this.screens[screenName]) {
            console.error(`Screen ${screenName} not found`);
            return;
        }

        // Hide all screens
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.style.display = 'none';
        });

        // Show requested screen
        this.screens[screenName].style.display = screenName === 'game' ? 'flex' : 'block';
        this.currentScreen = screenName;
    }

    showLobbyScreen() {
        // Clear ALL intervals before showing lobby
        this.cleanup();
        this.showScreen('lobby');

        const lobbyCountdown = document.querySelector('.lobby-screen .radial-progress');
        if (lobbyCountdown) {
            // Initial render, but updates come from server
            const progress = (this.timeLeft / 10) * 360;
            lobbyCountdown.textContent = this.timeLeft;
            lobbyCountdown.style.setProperty('--progress', `${progress}deg`);
        }

        this.updateLobbyScreenPlayers();
    }

    showGameScreen() {
        this.showScreen('game');
        this.startGame();

        this.updateLeaderboard();
    }

    showEndScreen() {
        // Clear ALL intervals before showing end screen
        this.cleanup();
        this.gameActive = false;
        this.updateEndScreenStats();
        this.showScreen('end');

        // End screen countdown is driven by server timeSync (no local timer)
        // Just set initial display
        const endCountdown = document.querySelector('.end-screen .radial-progress');
        if (endCountdown) {
            endCountdown.textContent = this.timeLeft || 10;
            const progress = ((this.timeLeft || 10) / 10) * 360;
            endCountdown.style.setProperty('--progress', `${progress}deg`);
        }

        this.updateFinalStandings();
    }

    startGame() {
        console.log('🎮 Starting new game...');

        // Clear any existing timers first
        this.cleanup();

        // Reset game state
        this.gameActive = true;
        this.score = 0;
        this.wordsFound = 0;
        this.usedWords.clear();
        this.displayedWords = new Set(); // Track words shown in Words Found list
        this.currentWord = '';
        this.selectedTiles = [];

        // Use server timeLeft if available, only default to gameTime as fallback
        if (!this.timeLeft || this.timeLeft <= 0 || this.timeLeft > this.gameTime) {
            this.timeLeft = this.gameTime;
        }

        // Update displays
        if (this.scoreDisplay) {
            this.scoreDisplay.textContent = '0';
        }
        if (this.wordsFoundDisplay) {
            this.wordsFoundDisplay.textContent = '0';
        }
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
        }

        // Clear words list
        const wordsList = document.querySelector('.words-list');
        if (wordsList) {
            wordsList.innerHTML = '';
        }

        // Force re-enable buttons and tiles (fix: unresponsive after previous game end)
        if (this.submitBtn) this.submitBtn.disabled = false;
        if (this.clearBtn) this.clearBtn.disabled = false;
        if (this.shuffleBtn) this.shuffleBtn.disabled = false;
        if (this.tiles) {
            this.tiles.forEach(tile => {
                tile.style.pointerEvents = '';
                tile.classList.remove('active');
            });
        }

        // Use SERVER letters if available, only generate locally as fallback
        if (!this.gridLetters || this.gridLetters.length === 0) {
            this.gridLetters = this.generateGridLetters();
        }
        this.initializeGrid();

        // Request fresh leaderboard to avoid stale scores from previous game
        if (this.multiplayer && this.multiplayer.isMultiplayer()) {
            this.multiplayer.sendToDevvit({ type: 'getLeaderboard' });
        }

        // Start timer (single timer, not duplicate)
        this.startTimer();
        this.updateTimeDisplay();
    }

    updateTimeDisplay() {
        const timeDisplay = document.querySelector('.time-left');
        const progressBar = document.querySelector('.mini-progress-bar');

        if (timeDisplay && progressBar) {
            // Update time text
            if (this.timeLeft <= 10) {
                timeDisplay.style.color = '#d93900'; // Warning color
                progressBar.classList.add('warning');
            } else {
                timeDisplay.style.color = '#eac548'; // Normal color
                progressBar.classList.remove('warning');
            }
            timeDisplay.textContent = `Time Left: ${this.timeLeft}s`;

            // Update progress bar
            const progress = (this.timeLeft / this.gameTime) * 100;
            progressBar.style.width = `${progress}%`;
        }
    }

    endGame() {
        console.log('🏁 Game over!');
        // Clear the countdown interval
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.gameActive = false;
        clearInterval(this.timer);

        // Safely play sound
        this.playSound('gameOver');

        // Disable interactions
        if (this.tiles) {
            this.tiles.forEach(tile => {
                tile.style.pointerEvents = 'none';
            });
        }

        if (this.submitBtn) this.submitBtn.disabled = true;
        if (this.clearBtn) this.clearBtn.disabled = true;
        if (this.shuffleBtn) this.shuffleBtn.disabled = true;

        // Show end screen after a brief delay
        setTimeout(() => {
            this.showEndScreen();
        }, 1500);
    }

    initializeAudio() {
        try {
            this.audio = new AudioManager();
            this.audioInitialized = false;

            // Initialize audio on first user interaction
            const initAudioOnInteraction = () => {
                if (!this.audioInitialized) {
                    this.audioInitialized = true;
                    this.audio.context.resume().catch(console.error);
                }
                document.removeEventListener('click', initAudioOnInteraction);
            };

            document.addEventListener('click', initAudioOnInteraction);
        } catch (error) {
            console.warn('Audio initialization failed:', error);
            // Create dummy audio methods to prevent errors
            this.audio = {
                playSound: () => { } // No-op function
            };
        }
    }

    playSound(soundName) {
        if (this.audio && this.audioInitialized && this.soundEnabled) {
            try {
                this.audio.playSound(soundName);
            } catch (error) {
                console.warn('Failed to play sound:', error);
            }
        }
    }

    showMessage(message, type = 'error') {
        if (this.wordDisplay) {
            // Clear any existing text first
            this.wordDisplay.textContent = '';

            // Add the message with appropriate styling
            requestAnimationFrame(() => {
                this.wordDisplay.textContent = message;
                this.wordDisplay.classList.add('feedback');
                this.wordDisplay.setAttribute('data-type', type);

                // Add flash animation only for error messages
                if (type === 'error') {
                    this.wordDisplay.classList.add('flash');
                }
            });

            // Set timeout based on message type
            const timeout = type === 'error' ? 600 : 1000;

            setTimeout(() => {
                // Clear the message state
                this.wordDisplay.classList.remove('feedback', 'flash');
                this.wordDisplay.removeAttribute('data-type');

                // Set back to default state
                if (this.gameActive) {
                    requestAnimationFrame(() => {
                        this.wordDisplay.textContent = 'ENTER YOUR WORD';
                    });
                }
            }, timeout);
        }
    }

    async submitWord() {
        if (!this.gameActive) return;

        const word = this.currentWord.toLowerCase();
        console.log(`📝 Attempting to submit word: ${word}`);

        // Check minimum word length
        if (word.length < this.MIN_WORD_LENGTH) {
            this.playSound('error');
            this.showMessage('TOO SHORT', 'error');
            this.resetTiles();
            return;
        }

        // Validate against dictionary
        if (!this.dictionary.has(word)) {
            this.playSound('error');
            this.showMessage('NOT IN DICTIONARY', 'error');
            this.resetTiles();
            return;
        }

        // Check if word has already been used (by self OR opponent)
        if (this.usedWords.has(word)) {
            this.playSound('error');
            this.showMessage('ALREADY FOUND', 'warning');
            this.resetTiles();
            return;
        }

        // Word is valid - process it (no error message before this!)
        this.processValidWord(word.toUpperCase());
    }

    processValidWord(word) {
        // Play success sound
        this.playSound('success');

        // Show success feedback with the word itself
        this.showMessage(`${word} +${this.calculateWordScore(word)}`, 'success');

        // Add to used words set
        this.usedWords.add(word.toLowerCase());

        // Update score
        const wordScore = this.calculateWordScore(word);
        this.score += wordScore;

        // Submit to multiplayer server if available
        if (this.multiplayer && this.multiplayer.isMultiplayer()) {
            this.multiplayer.submitWord(word, wordScore);
        }

        // Track player stats for end screen
        this.updatePlayerStats(word, wordScore);

        // Update score display
        const scoreDisplay = document.querySelector('.header-column:last-child span');
        if (scoreDisplay) {
            scoreDisplay.textContent = this.score;
        }

        // Increment words found counter
        this.wordsFound++;

        // Update words found display
        const wordsFoundDisplay = document.querySelector('.header-column:first-child span');
        if (wordsFoundDisplay) {
            wordsFoundDisplay.textContent = this.wordsFound;
        }

        // Update words found column header
        const wordsHeader = document.querySelector('.game-screen .column:last-child h2 span');
        if (wordsHeader) {
            wordsHeader.textContent = `| ${this.wordsFound} Words`;
        }

        // Add word to list (with dedup guard)
        this.addWordToList(word, wordScore);

        // Show score animation
        this.showScoreAnimation(wordScore);

        // Reset tiles for next word
        this.resetTiles();
    }

    resetTiles() {
        // Just remove active class, don't disable tiles
        if (this.tiles) {
            this.tiles.forEach(tile => {
                tile.classList.remove('active');
                // Remove pointer-events style to ensure tiles are clickable
                tile.style.pointerEvents = '';
            });
        }

        // Clear selection arrays
        this.selectedTiles = [];
        this.currentWord = '';

        // Reset word display
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
            this.wordDisplay.classList.remove('error');
        }
    }

    handleTileClick(tile) {
        if (!this.gameActive) return;

        this.playSound('tileClick');

        // Get the letter
        const letter = tile.textContent.charAt(0);

        // Add to current word
        this.currentWord += letter;

        // Update display
        if (this.wordDisplay) {
            this.wordDisplay.textContent = this.currentWord;
            this.wordDisplay.classList.remove('error');
        }

        // Add visual feedback only
        tile.classList.add('active');
        this.selectedTiles.push(tile);

        // Don't disable the tile - allow multiple clicks
    }

    displayTopWords() {
        const topWordsContainer = document.querySelector('.top-words');
        const sortedWords = Array.from(this.usedWords)
            .map(word => ({
                word,
                score: this.calculateWordScore(word)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        topWordsContainer.innerHTML = sortedWords
            .map(({ word, score }) => `
                <div class="top-word">
                    <span>${word}</span>
                    <span class="score">${score} pts</span>
                </div>
            `).join('');
    }

    startEndGameCountdown() {
        let countdown = 10;
        const countdownElement = document.querySelector('.countdown');

        const countdownInterval = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;

            if (countdown <= 0) {
                clearInterval(countdownInterval);
                this.startGame();
            }
        }, 1000);
    }

    async loadDictionary() {
        console.log('📖 Loading dictionary...');
        try {
            // Race fetch against a 5s timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Dictionary load timeout')), 5000)
            );

            const response = await Promise.race([
                fetch('dictionary.json'),
                timeoutPromise
            ]);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data && Array.isArray(data.words)) {
                this.dictionary = new Set(data.words.map(word => word.toLowerCase()));
                console.log(`📚 Dictionary loaded with ${this.dictionary.size} words`);
            } else {
                throw new Error('Invalid dictionary format');
            }
        } catch (error) {
            console.error('❌ Dictionary loading error:', error);
            this.useFallbackDictionary();
        }
    }

    useFallbackDictionary() {
        // Fallback dictionary with common words (all lowercase)
        const fallbackWords = [
            'word', 'words', 'sword', 'world', 'row', 'door',
            'wood', 'lord', 'low', 'rod', 'owl', 'wild', 'wind',
            'down', 'worn', 'draw', 'ward', 'road', 'wide', 'grow'
        ];
        this.dictionary = new Set(fallbackWords);
        console.log('Using fallback dictionary with', this.dictionary.size, 'words');
    }

    initializeDOM() {
        try {
            // Create game area if it doesn't exist
            const gameArea = document.querySelector('.game-area');
            if (!gameArea) {
                const centerColumn = document.querySelector('.column.center');
                if (centerColumn) {
                    const newGameArea = document.createElement('div');
                    newGameArea.className = 'game-area';
                    centerColumn.appendChild(newGameArea);
                }
            }

            // Initialize word display if it doesn't exist
            if (!document.querySelector('.word-display')) {
                const gameArea = document.querySelector('.game-area');
                const wordDisplay = document.createElement('div');
                wordDisplay.className = 'word-display';
                wordDisplay.textContent = 'ENTER YOUR WORD';
                gameArea.insertBefore(wordDisplay, gameArea.firstChild);
            }

            // Store DOM elements
            this.wordDisplay = document.querySelector('.word-display');
            this.clearBtn = document.querySelector('button.clear');
            this.submitBtn = document.querySelector('button.submit');
            this.shuffleBtn = document.querySelector('button.shuffle');
            this.progressBar = document.querySelector('.progress-bar');
            this.scoreDisplay = document.querySelector('.header-column:last-child span');
            this.wordsFoundDisplay = document.querySelector('.header-column:first-child span');

            // Initialize the grid
            this.initializeGrid();

            // Initialize game controls
            this.init();
        } catch (error) {
            console.error('DOM initialization failed:', error);
        }
    }

    init() {
        // Initialize grid with letters
        this.initializeGrid();

        // Add button event listeners
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clearSelection());
        }
        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', () => this.submitWord());
        }
        if (this.shuffleBtn) {
            this.shuffleBtn.addEventListener('click', () => this.shuffleTiles());
        }

        // Initialize word display
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
        }
    }



    // Cache DOM elements in constructor

    // ... (inside class)

    handleTimeSync(data) {
        if (data.timeLeft !== undefined) {
            this.timeLeft = data.timeLeft;
        }

        // Detect phase transitions from server
        if (data.phase && data.phase !== this.phase) {
            const oldPhase = this.phase;
            this.phase = data.phase;

            if (this.phase === 'game' && oldPhase !== 'game') {
                this.showGameScreen();
            } else if (this.phase === 'end' && oldPhase !== 'end') {
                this.showEndScreen();
            } else if (this.phase === 'lobby' && oldPhase !== 'lobby') {
                this._hasJoined = false; // Allow re-join on new lobby cycle
                this.resetGameState();
                this.showLobbyScreen();
            }
        }

        // Always update displays
        this.updateTimeDisplay();
        this.updateLobbyTimer();

        // Update end screen countdown if on end screen
        if (this.phase === 'end') {
            const endCountdown = document.querySelector('.end-screen .radial-progress');
            if (endCountdown) {
                endCountdown.textContent = this.timeLeft;
                const progress = (this.timeLeft / 10) * 360;
                endCountdown.style.setProperty('--progress', `${progress}deg`);
            }
        }
    }

    updateLobbyTimer() {
        const lobbyCountdown = document.querySelector('.lobby-screen .radial-progress');
        if (lobbyCountdown) {
            const progress = (this.timeLeft / 10) * 360;
            lobbyCountdown.textContent = this.timeLeft;
            lobbyCountdown.style.setProperty('--progress', `${progress}deg`);
        }
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);

        // Use CURRENT timeLeft, not full duration
        let duration = this.timeLeft * 1000;
        const startTime = Date.now();

        this.timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = duration - elapsed;

            // Actually, simple decrement is safer if we get external updates
            this.timeLeft = Math.max(0, Math.ceil(remaining / 1000));

            // Update time display and progress bar
            this.updateTimeDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                // Don't auto-end game on client? Wait for server phase change?
                // Better safe:
                this.endGame();
            }
        }, 100);
    }

    calculateWordScore(word) {
        if (!word) return 0;

        // Calculate base score (sum of letter scores)
        const baseScore = word.split('').reduce((score, letter) => {
            return score + (this.LETTER_SCORES[letter.toUpperCase()] || 0);
        }, 0);

        // Apply length multiplier
        const length = Math.min(word.length, 8); // Cap at 8+ letters
        const multiplier = this.WORD_MULTIPLIERS[length] || this.WORD_MULTIPLIERS[8];

        return Math.floor(baseScore * multiplier);
    }

    updateWordDisplay() {
        if (this.domElements.wordDisplay) {
            this.domElements.wordDisplay.textContent = this.currentWord || '';
        }
    }

    clearSelection() {
        // Remove active class from all selected tiles
        this.selectedTiles.forEach(tile => {
            tile.classList.remove('active');
            // Re-enable tile
            tile.style.pointerEvents = 'auto';
        });

        // Clear arrays and current word
        this.selectedTiles = [];
        this.currentWord = '';

        // Reset word display
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
        }
    }

    resetWordDisplay() {
        // Clear current selection
        this.selectedTiles.forEach(tile => {
            tile.classList.remove('active');
        });
        this.selectedTiles = [];
        this.currentWord = '';

        // Reset word display after a short delay (after feedback message)
        setTimeout(() => {
            if (!this.wordDisplay.classList.contains('feedback')) {
                this.wordDisplay.textContent = 'ENTER YOUR WORD';
            }
        }, 1100); // Slightly longer than the feedback message duration
    }

    shakeTiles() {
        this.selectedTiles.forEach(tile => {
            tile.classList.add('shake');
            setTimeout(() => tile.classList.remove('shake'), 500);
        });
    }

    addWordToList(word, score) {
        const wordKey = word.toLowerCase();
        // Dedup guard: skip if already displayed
        if (!this.displayedWords) this.displayedWords = new Set();
        if (this.displayedWords.has(wordKey)) return;
        this.displayedWords.add(wordKey);

        const wordsList = document.querySelector('.words-list');
        if (!wordsList) return;

        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';
        wordItem.innerHTML = `
            <span class="word">${word}</span>
            <span class="score">${score}</span>
        `;

        if (wordsList.firstChild) {
            wordsList.insertBefore(wordItem, wordsList.firstChild);
        } else {
            wordsList.appendChild(wordItem);
        }
    }

    updateWordsFound() {
        // Update header counter
        const wordsFoundSpan = document.querySelector('.header-column:first-child span');
        if (wordsFoundSpan) {
            wordsFoundSpan.textContent = this.wordsFound;
        }

        // Update words found title
        const wordsFoundTitle = document.querySelector('.column:last-child h2 span');
        if (wordsFoundTitle) {
            wordsFoundTitle.textContent = `| ${this.wordsFound} Words`;
        }
    }

    updateScore(word) {
        const wordScore = this.calculateWordScore(word);
        this.score += wordScore;

        // Update score display
        const scoreDisplay = document.querySelector('.header-column:last-child span');
        if (scoreDisplay) {
            scoreDisplay.textContent = this.score;
        }

        // Show score animation
        this.showScoreAnimation(wordScore);
    }

    initializeGrid() {
        if (!this.domElements.grid) {
            console.error('❌ Grid element not found');
            return;
        }

        this.domElements.grid.innerHTML = '';

        this.gridLetters.forEach(letter => {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `${letter}<span class="points">${this.LETTER_SCORES[letter]}</span>`;
            tile.addEventListener('click', () => this.handleTileClick(tile));
            this.domElements.grid.appendChild(tile);
        });

        this.tiles = Array.from(document.querySelectorAll('.tile'));
    }

    handleScoreUpdate(data) {
        // Update local leaderboard from live score updates
        if (data.leaderboard) {
            this.leaderboardData = data.leaderboard;
            this.updateLeaderboard();
        }

        // Add opponent word to usedWords so it gets rejected locally (fix: 1d)
        if (data.word) {
            this.usedWords.add(data.word.toLowerCase());
        }

        // Add opponent word to Words Found list (skip self-echo)
        if (data.username && data.word && data.username !== this.username) {
            this.addOpponentWordToList(data.username, data.word, data.score);
        }
    }

    addOpponentWordToList(playerName, word, score) {
        const wordKey = word.toLowerCase();
        if (!this.displayedWords) this.displayedWords = new Set();
        if (this.displayedWords.has(wordKey)) return;
        this.displayedWords.add(wordKey);

        const wordsList = document.querySelector('.words-list');
        if (!wordsList) return;

        const wordItem = document.createElement('div');
        wordItem.className = 'word-item opponent-word';
        wordItem.innerHTML = `
            <span class="word"><small class="opponent-label">${playerName}:</small> ${word}</span>
            <span class="score">${score}</span>
        `;

        if (wordsList.firstChild) {
            wordsList.insertBefore(wordItem, wordsList.firstChild);
        } else {
            wordsList.appendChild(wordItem);
        }
    }

    // NOTE: handleScoreUpdate is defined ONCE above. Do NOT duplicate.

    handleLeaderboard(data) {
        this.leaderboardData = data;
        // Render directly — do NOT call updateFinalStandings (that would re-request)
        this.renderFinalStandings();
    }

    // Reset only game state, no navigation
    resetGameState() {
        this.selectedTiles = [];
        this.currentWord = '';
        this.score = 0;
        this.wordsFound = 0;
        this.usedWords.clear();
        this.displayedWords = new Set();
        this.timeLeft = this.gameTime;
        this.gameActive = false;

        // Clear ALL multiplayer data for new session
        this.leaderboardData = null;
        this.leaderboard = [];
        this.gridLetters = [];
        this.recentPlayers = [];
        this.foundWords = [];
        this.playerStats = { wordsFound: 0, longestWord: '', highestScoringWord: '', highestScore: 0 };

        // Reset UI elements
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
        }

        const wordsList = document.querySelector('.words-list');
        if (wordsList) wordsList.innerHTML = '';

        if (this.scoreDisplay) this.scoreDisplay.textContent = '0';
        if (this.wordsFoundDisplay) this.wordsFoundDisplay.textContent = '0';

        if (this.progressBar) this.progressBar.style.width = '100%';

        // Re-enable buttons and tiles
        if (this.submitBtn) this.submitBtn.disabled = false;
        if (this.clearBtn) this.clearBtn.disabled = false;
        if (this.shuffleBtn) this.shuffleBtn.disabled = false;

        if (this.tiles) {
            this.tiles.forEach(tile => {
                tile.style.pointerEvents = '';
                tile.classList.remove('active');
            });
        }
    }

    // Full reset with navigation to lobby
    resetGame() {
        this.resetGameState();
        this.showLobbyScreen();
    }

    showScoreAnimation(points) {
        if (!points || points <= 0) return;

        requestAnimationFrame(() => {
            const scorePopup = document.createElement('div');
            scorePopup.className = 'score-popup';
            scorePopup.textContent = `+${points}`;

            if (this.domElements.wordDisplay) {
                this.domElements.wordDisplay.appendChild(scorePopup);
                setTimeout(() => scorePopup.remove(), 1000);
            }
        });
    }

    handleInit(data) {
        this.username = data.username;
        this.phase = data.phase;
        this.timeLeft = data.timeLeft;

        // Display player name in header
        const nameEl = document.getElementById('player-name');
        if (nameEl && data.username) {
            nameEl.textContent = data.username;
        }

        // Show syncing indicator if joining mid-game
        if (data.phase === 'game') {
            const timeDisplay = document.querySelector('.time-left');
            if (timeDisplay) {
                timeDisplay.textContent = 'Syncing...';
                setTimeout(() => this.updateTimeDisplay(), 1500);
            }
        }

        const isNewGame = data.gameId && data.gameId !== this.gameId;
        this.gameId = data.gameId;

        if (data.letters && data.letters.length > 0) {
            this.gridLetters = data.letters;
        }

        if (data.players && Array.isArray(data.players)) {
            const seen = new Set();
            this.recentPlayers = data.players.filter(p => {
                if (seen.has(p.name)) return false;
                seen.add(p.name);
                return true;
            }).map(p => ({ name: p.name, status: 'online' }));
            this.playerCount = this.recentPlayers.length;
        }

        if (this.phase === 'lobby') {
            this.showLobbyScreen();
        } else if (this.phase === 'game') {
            this.showGameScreen();
        } else if (this.phase === 'end') {
            this.showEndScreen();
        }

        if (isNewGame || !this._hasJoined) {
            this.multiplayer.joinGame();
            this._hasJoined = true;
        }
    }

    handlePlayerJoined(data) {
        this.playerCount = data.playerCount;

        // Add to recent players list (deduplicate by name)
        if (!this.recentPlayers) this.recentPlayers = [];
        const alreadyExists = this.recentPlayers.some(p => p.name === data.username);
        if (!alreadyExists) {
            this.recentPlayers.unshift({ name: data.username, status: 'joining' });
            if (this.recentPlayers.length > 7) this.recentPlayers.pop();
        }

        this.updateLobbyScreenPlayers();
    }

    handlePhaseChange(data) {
        const oldPhase = this.phase;
        this.phase = data.phase;
        this.timeLeft = data.newState?.timeLeft || data.timeLeft;

        if (this.phase === 'game' && oldPhase !== 'game') {
            // Game starting!
            this.letters = data.newState?.letters || this.letters;
            if (this.letters && this.letters.length > 0) {
                this.gridLetters = this.letters;
                this.initializeDOM();
            }
            this.showGameScreen();
        } else if (this.phase === 'end' && oldPhase !== 'end') {
            // Game ended
            this.showEndScreen();
        } else if (this.phase === 'lobby' && oldPhase !== 'lobby') {
            // Back to lobby
            this.showLobbyScreen();
        }
    }

    // REMOVED: duplicate handleScoreUpdate was here — using the one defined earlier (line ~1099)

    updateLobbyScreenPlayers() {
        const joiningList = document.querySelector('.joining-list');
        const playerCountSpan = document.querySelector('.column h2 span');

        if (!joiningList) return;

        // Update player count
        if (playerCountSpan) {
            // Use real player count if available, fallback to dummy for layout testing if needed
            const count = this.playerCount || 1;
            playerCountSpan.textContent = `${count} Players`;
        }

        // Update joining players list
        // Use recentPlayers if we have them, otherwise show empty or "Waiting..."
        const playersToShow = this.recentPlayers || [{ name: this.username || 'You', status: 'ready' }];

        joiningList.innerHTML = playersToShow
            .map(player => `
                <div class="joining-player">
                    <span class="player-name">${player.name}</span>
                    <span class="status" status="${player.status || 'ready'}">${player.status || 'ready'}</span>
                </div>
            `).join('');
    }

    updateLeaderboard() {
        const leaderboard = document.querySelector('.leaderboard-table');
        if (!leaderboard) return;

        // Use REAL leaderboard data from server
        const data = this.leaderboardData || [];

        // Update leaderboard header with player count
        const lbHeader = document.querySelector('.game-screen .column:first-child h2 span');
        if (lbHeader) {
            lbHeader.textContent = `| ${this.playerCount || data.length} Players`;
        }

        if (data.length === 0) {
            leaderboard.innerHTML = '<div class="table-row"><div class="player-name" style="opacity:0.5">Waiting for scores...</div></div>';
            return;
        }

        leaderboard.innerHTML = data
            .map(player => {
                const displayName = player.member.includes(':') ? player.member.split(':')[0] : player.member;
                return `
                    <div class="table-row">
                        <div class="player-name">${displayName}</div>
                        <div class="word-count"></div>
                        <div class="score">${player.score}</div>
                    </div>
                `;
            }).join('');
    }

    updateFinalStandings() {
        // Request fresh leaderboard if we don't have data yet
        if (!this.leaderboardData || this.leaderboardData.length === 0) {
            if (this.multiplayer && this.multiplayer.isMultiplayer()) {
                this.multiplayer.sendToDevvit({ type: 'getLeaderboard' });
            }
        }
        this.renderFinalStandings();
    }

    renderFinalStandings() {
        const finalStandings = document.querySelector('.final-standings');
        if (!finalStandings) return;

        // Use real data if available
        const standingsData = this.leaderboardData || [];

        if (standingsData.length === 0) {
            finalStandings.innerHTML = '<div class="loading">Loading results...</div>';
            return;
        }

        finalStandings.innerHTML = standingsData
            .map((player, index) => {
                // Strip session suffix
                const displayName = player.member.includes(':') ? player.member.split(':')[0] : player.member;
                return `
                    <div class="standings-row">
                        <div class="rank">${index + 1}</div>
                        <div class="player-content">
                            <div class="player-info">
                                <div class="player-name">${displayName}</div>
                                <span class="words-found">Score: ${player.score}</span> 
                            </div>
                            <div class="final-score">${player.score}</div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    // Clear ALL intervals when switching screens or resetting
    cleanup() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.lobbyTimer) {
            clearInterval(this.lobbyTimer);
            this.lobbyTimer = null;
        }
        if (this.endTimer) {
            clearInterval(this.endTimer);
            this.endTimer = null;
        }
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateEndScreenStats() {
        const gameStats = document.querySelector('.game-stats');
        if (gameStats) {
            const wordsArr = Array.from(this.usedWords);
            const longestWord = wordsArr.length > 0
                ? wordsArr.reduce((a, b) => a.length > b.length ? a : b, '')
                : '-';
            const bestScore = wordsArr.length > 0
                ? Math.max(...wordsArr.map(w => this.calculateWordScore(w)))
                : 0;

            const stats = {
                'Total Score': this.score,
                'Words Found': this.usedWords.size,
                'Longest Word': longestWord.toUpperCase() || '-',
                'Best Word Score': bestScore || '-'
            };

            gameStats.innerHTML = Object.entries(stats)
                .map(([label, value]) => `
                    <div class="stat-item">
                        <span class="stat-label">${label}</span>
                        <span class="stat-value">${value}</span>
                    </div>
                `).join('');
        }

        // Update top words (no duplicate <h3> — HTML already has <h2>Top Words</h2>)
        const topWordsContainer = document.querySelector('.top-words');
        if (topWordsContainer) {
            const wordsArr = Array.from(this.usedWords);
            const topWords = wordsArr
                .map(word => ({
                    word: word.toUpperCase(),
                    score: this.calculateWordScore(word)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            if (topWords.length === 0) {
                topWordsContainer.innerHTML = '<div style="opacity:0.5;padding:8px">No words found</div>';
            } else {
                topWordsContainer.innerHTML = topWords.map(({ word, score }) => `
                    <div class="word-row">
                        <span class="word">${word}</span>
                        <span class="points">${score} pts</span>
                    </div>
                `).join('');
            }
        }
    }

    calculateWordPoints(word) {
        // Basic scoring: 1 point per letter
        return word.length;
    }

    updatePlayerStats(word, points) {
        this.playerStats.wordsFound++;

        // Update longest word
        if (word.length > (this.playerStats.longestWord?.length || 0)) {
            this.playerStats.longestWord = word;
        }

        // Update highest scoring word
        if (points > (this.playerStats.highestScore || 0)) {
            this.playerStats.highestScore = points;
            this.playerStats.highestScoringWord = word;
        }
    }
}

// Initialize game when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        const game = new WordMaestro();
    } catch (error) {
        console.error('Failed to create game instance:', error);
    }
});
