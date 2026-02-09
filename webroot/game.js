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

// Dummy Players Data Structure
const DUMMY_PLAYERS = {
    // All players (for total count)
    totalPlayers: 50,

    // Players in joining state (for lobby screen) - keep most recent 7
    joiningPlayers: [
        { id: 44, name: "WordNinja", status: "ready" },
        { id: 45, name: "Wordsworth", status: "ready" },
        { id: 46, name: "SpellSeeker", status: "ready" },
        { id: 47, name: "LexiQuest", status: "joining" },
        { id: 48, name: "WordWeaver", status: "joining" },
        { id: 49, name: "AlphaKing", status: "joining" },
        { id: 50, name: "VocabVirtuoso", status: "joining" }
    ],

    // Active players for main game screen leaderboard - top 6
    activePlayers: [
        { id: 1, name: "WordMaster", wordsFound: 12, score: 345 },
        { id: 2, name: "LexiconPro", wordsFound: 10, score: 298 },
        { id: 3, name: "WordSmith", wordsFound: 9, score: 276 },
        { id: 4, name: "Spellbound", wordsFound: 8, score: 245 },
        { id: 5, name: "WordWizard", wordsFound: 7, score: 234 },
        { id: 6, name: "LetterLord", wordsFound: 7, score: 212 }
    ],

    // Final standings (for end screen) - top 5 only
    finalStandings: [
        { id: 1, name: "WordMaster", wordsFound: 12, score: 345, rank: 1 },
        { id: 2, name: "LexiconPro", wordsFound: 10, score: 298, rank: 2 },
        { id: 3, name: "WordSmith", wordsFound: 9, score: 276, rank: 3 },
        { id: 4, name: "Spellbound", wordsFound: 8, score: 245, rank: 4 },
        { id: 5, name: "WordWizard", wordsFound: 7, score: 234, rank: 5 }
    ]
};

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

class WordBlitz {
    constructor() {
        console.log('🎮 Initializing WordBlitz game...');

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

        // Initialize grid letters
        this.gridLetters = this.generateGridLetters();

        // Initialize screens and DOM elements
        this.initializeScreens();
        this.initializeDOM();

        // Load dictionary and prepare game
        this.loadDictionary()
            .then(() => {
                console.log('📚 Dictionary loaded successfully');
                this.showLobbyScreen();
            })
            .catch(error => {
                console.error('❌ Failed to initialize game:', error);
                this.showLobbyScreen();
            });

        // Initialize audio with safety checks
        this.initializeAudio();

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
            let countdown = 10;
            let progress = 360;

            lobbyCountdown.textContent = countdown;
            lobbyCountdown.style.setProperty('--progress', `${progress}deg`);

            this.lobbyTimer = setInterval(() => {
                countdown--;
                progress = (countdown / 10) * 360;

                if (lobbyCountdown) {
                    lobbyCountdown.textContent = countdown;
                    lobbyCountdown.style.setProperty('--progress', `${progress}deg`);
                }

                if (countdown <= 0) {
                    clearInterval(this.lobbyTimer);
                    this.lobbyTimer = null;
                    this.showGameScreen();
                }
            }, 1000);
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
        this.updateEndScreenStats();
        this.showScreen('end');

        const endCountdown = document.querySelector('.end-screen .radial-progress');
        if (endCountdown) {
            let countdown = 10;
            let progress = 360;

            endCountdown.textContent = countdown;
            endCountdown.style.setProperty('--progress', `${progress}deg`);

            this.endTimer = setInterval(() => {
                countdown--;
                progress = (countdown / 10) * 360;

                if (endCountdown) {
                    endCountdown.textContent = countdown;
                    endCountdown.style.setProperty('--progress', `${progress}deg`);
                }

                if (countdown <= 0) {
                    clearInterval(this.endTimer);
                    this.endTimer = null;
                    this.resetGameState();  // Only reset state, don't call showLobbyScreen
                    this.showLobbyScreen(); // Let this handle its own timer
                }
            }, 1000);
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
        this.timeLeft = this.gameTime;
        this.currentWord = '';
        this.selectedTiles = [];

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

        // Initialize grid
        this.gridLetters = this.generateGridLetters();
        this.initializeGrid();

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
        if (this.audio && this.audioInitialized) {
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
            this.showMessage('INVALID WORD', 'error');
            this.resetTiles();
            return;
        }

        // Validate against dictionary
        if (!this.dictionary.has(word)) {
            this.playSound('error');
            this.showMessage('INVALID WORD', 'error');
            this.resetTiles();
            return;
        }

        // Check if word has already been used
        if (this.usedWords.has(word)) {
            this.playSound('error');
            this.showMessage('WORD FOUND', 'warning');
            this.resetTiles();
            return;
        }

        // Word is valid - process it
        this.processValidWord(word.toUpperCase());
    }

    processValidWord(word) {
        // Play success sound
        this.playSound('success');

        // Show success message
        this.showMessage(word, 'success');

        // Add to used words set
        this.usedWords.add(word.toLowerCase());

        // Update score
        const wordScore = this.calculateWordScore(word);
        this.score += wordScore;

        // Submit to multiplayer server if available
        if (window.multiplayerHelper && window.multiplayerHelper.isMultiplayer()) {
            window.multiplayerHelper.submitWord(word, wordScore);
        }

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

        // Add word to list
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
            const response = await fetch('dictionary.json');
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

    startTimer() {
        const startTime = Date.now();
        const duration = this.gameTime * 1000; // Convert to milliseconds

        this.timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = duration - elapsed;
            this.timeLeft = Math.max(0, Math.ceil(remaining / 1000));

            // Update time display and progress bar
            this.updateTimeDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                this.endGame();
            }
        }, 100); // Update frequently for smooth progress bar
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
        // Find the words-list container
        const wordsList = document.querySelector('.words-list');
        if (!wordsList) {
            console.error('Words list container not found');
            return;
        }

        // Create new word item
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';

        // Add word and score
        wordItem.innerHTML = `
            <span class="word">${word}</span>
            <span class="score">${score}</span>
        `;

        // Add to beginning of list
        if (wordsList.firstChild) {
            wordsList.insertBefore(wordItem, wordsList.firstChild);
        } else {
            wordsList.appendChild(wordItem);
        }

        // Update the words found counter in title
        const wordsFoundTitle = document.querySelector('.column:last-child h2 span');
        if (wordsFoundTitle) {
            wordsFoundTitle.textContent = `| ${this.wordsFound} Words`;
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

    // Reset only game state, no navigation
    resetGameState() {
        // Reset game state
        this.selectedTiles = [];
        this.currentWord = '';
        this.score = 0;
        this.wordsFound = 0;
        this.usedWords.clear();
        this.timeLeft = this.gameTime;
        this.gameActive = false;

        // Reset UI elements
        if (this.wordDisplay) {
            this.wordDisplay.textContent = 'ENTER YOUR WORD';
        }

        // Clear words list
        const wordsList = document.querySelector('.words-list');
        if (wordsList) {
            wordsList.innerHTML = '';
        }

        // Reset score displays
        if (this.scoreDisplay) {
            this.scoreDisplay.textContent = '0';
        }
        if (this.wordsFoundDisplay) {
            this.wordsFoundDisplay.textContent = '0';
        }

        // Reset progress bar
        if (this.progressBar) {
            this.progressBar.style.width = '100%';
        }

        // Re-enable buttons and tiles
        if (this.submitBtn) this.submitBtn.disabled = false;
        if (this.clearBtn) this.clearBtn.disabled = false;
        if (this.shuffleBtn) this.shuffleBtn.disabled = false;

        if (this.tiles) {
            this.tiles.forEach(tile => {
                tile.style.pointerEvents = 'auto';
                tile.classList.remove('active');
            });
        }

        // Generate new grid letters
        this.gridLetters = this.generateGridLetters();
        this.initializeGrid();
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

    updateLobbyScreenPlayers() {
        const joiningList = document.querySelector('.joining-list');
        const playerCountSpan = document.querySelector('.column h2 span');

        if (!joiningList) return;

        // Update player count
        if (playerCountSpan) {
            playerCountSpan.textContent = `${DUMMY_PLAYERS.totalPlayers} Players`;
        }

        // Update joining players list
        joiningList.innerHTML = DUMMY_PLAYERS.joiningPlayers
            .map(player => `
                <div class="joining-player">
                    <span class="player-name">${player.name}</span>
                    <span class="status" status="${player.status}">${player.status}</span>
                </div>
            `).join('');
    }

    updateLeaderboard() {
        const leaderboard = document.querySelector('.leaderboard-table');
        if (!leaderboard) return;

        leaderboard.innerHTML = DUMMY_PLAYERS.activePlayers
            .map(player => `
                <div class="table-row">
                    <div class="player-name">${player.name}</div>
                    <div class="word-count">${player.wordsFound}</div>
                    <div class="score">${player.score}</div>
                </div>
            `).join('');
    }

    updateFinalStandings() {
        const finalStandings = document.querySelector('.final-standings');
        if (!finalStandings) return;

        finalStandings.innerHTML = DUMMY_PLAYERS.finalStandings
            .map(player => `
                <div class="standings-row">
                    <div class="rank">${player.rank}</div>
                    <div class="player-content">
                        <div class="player-info">
                            <div class="player-name">${player.name}</div>
                            <span class="words-found">${player.wordsFound} words</span>
                        </div>
                        <div class="final-score">${player.score}</div>
                    </div>
                </div>
            `).join('');
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
        // Update game stats
        const gameStats = document.querySelector('.game-stats');
        if (gameStats) {
            const stats = {
                'Total Score': this.score,
                'Words Found': this.usedWords.size,
                'Longest Word': Array.from(this.usedWords).reduce((a, b) => a.length > b.length ? a : b, ''),
                'Best Word Score': Math.max(...Array.from(this.usedWords).map(word => this.calculateWordScore(word)))
            };

            gameStats.innerHTML = Object.entries(stats)
                .map(([label, value]) => `
                    <div class="stat-item">
                        <span class="stat-label">${label}</span>
                        <span class="stat-value">${value}</span>
                    </div>
                `).join('');
        }

        // Update top words
        const topWordsContainer = document.querySelector('.top-words');
        if (topWordsContainer) {
            const topWords = Array.from(this.usedWords)
                .map(word => ({
                    word: word.toUpperCase(),
                    score: this.calculateWordScore(word)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            topWordsContainer.innerHTML = `
                <h3>Top Words</h3>
                ${topWords.map(({ word, score }) => `
                    <div class="word-row">
                        <span class="word">${word}</span>
                        <span class="points">${score} pts</span>
                    </div>
                `).join('')}
            `;
        }
        // Note: Next game countdown is handled in showEndScreen(), not here
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
        const game = new WordBlitz();
    } catch (error) {
        console.error('Failed to create game instance:', error);
    }
});
