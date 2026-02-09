import { useState, useEffect, useRef } from 'react'
import './App.css'

// Constants
const LETTER_SCORES: { [key: string]: number } = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10
}

const WORD_MULTIPLIERS: { [key: number]: number } = {
  3: 1,    // 3 letters
  4: 1,    // 4 letters
  5: 1.5,  // 5 letters
  6: 2,    // 6 letters
  7: 2.5,  // 7 letters
  8: 3     // 8+ letters
}

const REQUIRED_VOWELS = ['A', 'E', 'I', 'O', 'U']
const CONSONANTS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z']

const DUMMY_PLAYERS = {
  totalPlayers: 50,
  joiningPlayers: [
    { id: 44, name: "WordNinja", status: "ready" },
    { id: 45, name: "Wordsworth", status: "ready" },
    { id: 46, name: "SpellSeeker", status: "ready" },
    { id: 47, name: "LexiQuest", status: "joining" },
    { id: 48, name: "WordWeaver", status: "joining" },
    { id: 49, name: "AlphaKing", status: "joining" },
    { id: 50, name: "VocabVirtuoso", status: "joining" }
  ],
  activePlayers: [
    { id: 1, name: "WordMaster", wordsFound: 12, score: 345 },
    { id: 2, name: "LexiconPro", wordsFound: 10, score: 298 },
    { id: 3, name: "WordSmith", wordsFound: 9, score: 276 },
    { id: 4, name: "Spellbound", wordsFound: 8, score: 245 },
    { id: 5, name: "WordWizard", wordsFound: 7, score: 234 },
    { id: 6, name: "LetterLord", wordsFound: 7, score: 212 }
  ],
  finalStandings: [
    { id: 1, name: "WordMaster", wordsFound: 12, score: 345, rank: 1 },
    { id: 2, name: "LexiconPro", wordsFound: 10, score: 298, rank: 2 },
    { id: 3, name: "WordSmith", wordsFound: 9, score: 276, rank: 3 },
    { id: 4, name: "Spellbound", wordsFound: 8, score: 245, rank: 4 },
    { id: 5, name: "WordWizard", wordsFound: 7, score: 234, rank: 5 }
  ]
}

// Types
interface Tile {
  letter: string
  points: number
  isActive: boolean
  id: string
}

interface AudioContextType extends AudioContext {
  webkitAudioContext?: typeof AudioContext
}

interface Sound {
  (): void
}

interface Sounds {
  tileClick: () => void
  wordSuccess: () => void
  wordError: () => void
  gameOver: () => void
  shuffle: () => void
}

// Screen Component Types
interface LobbyScreenProps {
  players: typeof DUMMY_PLAYERS.joiningPlayers
  onStart: () => void
}

interface GameScreenProps {
  score: number
  wordsFound: number
  timeLeft: number
  currentWord: string
  tiles: Tile[]
  selectedTiles: number[]
  usedWords: Set<string>
  activePlayers: typeof DUMMY_PLAYERS.activePlayers
  onTileClick: (index: number) => void
  onSubmitWord: () => void
  onClear: () => void
  onShuffle: () => void
  calculateWordScore: (word: string) => number
  feedback: GameFeedback | null
}

interface EndScreenProps {
  finalScore: number
  wordsFound: number
  onReturnToLobby: () => void
  finalStandings: typeof DUMMY_PLAYERS.finalStandings
  topWords: Array<{ word: string; score: number }>
}

interface Dictionary {
  words: string[]
}

// Dictionary validation (you would typically load this from an API)
const DICTIONARY = new Set([
  'cat', 'dog', 'bird', 'house', 'tree', 'flower', 'book', 'table', 'chair',
  'computer', 'phone', 'water', 'food', 'sleep', 'walk', 'run', 'jump', 'play',
  // ... add more words as needed
])

// Define window.AudioContext
declare global {
  interface Window {
    AudioContext: typeof AudioContext
    webkitAudioContext: typeof AudioContext
  }
}

// Calculate word score function
const calculateWordScore = (word: string): number => {
  const baseScore = word
    .toUpperCase()
    .split('')
    .reduce((score, letter) => score + (LETTER_SCORES[letter] || 0), 0)
  
  const length = word.length
  const multiplier = WORD_MULTIPLIERS[Math.min(length, 8)] || 1
  
  return Math.floor(baseScore * multiplier)
}

interface GameFeedback {
  message: string
  type: 'success' | 'error'
  timestamp: number
}

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<'lobby' | 'game' | 'end'>('lobby')
  const [timeLeft, setTimeLeft] = useState(60)
  const [score, setScore] = useState(0)
  const [wordsFound, setWordsFound] = useState(0)
  const [currentWord, setCurrentWord] = useState('')
  const [selectedTiles, setSelectedTiles] = useState<number[]>([])
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set())
  const [tiles, setTiles] = useState<Tile[]>([])
  const [audioInitialized, setAudioInitialized] = useState(false)
  const [dictionary, setDictionary] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [feedback, setFeedback] = useState<GameFeedback | null>(null)
  
  const audioContext = useRef<AudioContext | null>(null)
  const sounds = useRef<{[key: string]: () => void}>({})
  const gameTimer = useRef<NodeJS.Timeout | null>(null)

  // Generate initial tiles with unique letters and all vowels
  const generateInitialTiles = () => {
    const newTiles: Tile[] = []
    const usedLetters = new Set<string>()

    // First, add all vowels
    REQUIRED_VOWELS.forEach(vowel => {
      newTiles.push({
        letter: vowel,
        points: LETTER_SCORES[vowel],
        isActive: false,
        id: `tile-${vowel}-${Math.random()}`
      })
      usedLetters.add(vowel)
    })

    // Then add unique consonants until we have 16 tiles
    while (newTiles.length < 16) {
      const consonant = CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]
      if (!usedLetters.has(consonant)) {
        newTiles.push({
          letter: consonant,
          points: LETTER_SCORES[consonant],
          isActive: false,
          id: `tile-${consonant}-${Math.random()}`
        })
        usedLetters.add(consonant)
      }
    }

    // Shuffle the tiles
    for (let i = newTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newTiles[i], newTiles[j]] = [newTiles[j], newTiles[i]]
    }

    setTiles(newTiles)
  }

  // Initialize game
  useEffect(() => {
    generateInitialTiles()
  }, [])

  // Handle tile click without adjacency requirement
  const handleTileClick = (index: number) => {
    playSound('tileClick')
    
    const newSelectedTiles = [...selectedTiles, index]
    setSelectedTiles(newSelectedTiles)
    
    setTiles(prev => prev.map((tile, i) => ({
      ...tile,
      isActive: newSelectedTiles.includes(i)
    })))
    
    setCurrentWord(newSelectedTiles.map(i => tiles[i].letter).join(''))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedTiles([])
    setCurrentWord('')
    setTiles(prev => prev.map(tile => ({ ...tile, isActive: false })))
  }

  // Handle word submit with score calculation
  const handleWordSubmit = () => {
    if (currentWord.length < 3) {
      setFeedback({
        message: 'Word must be at least 3 letters long',
        type: 'error',
        timestamp: Date.now()
      })
      playSound('wordError')
      clearSelection()
      return
    }
    
    const wordLower = currentWord.toLowerCase()
    
    if (usedWords.has(wordLower)) {
      setFeedback({
        message: 'Word already found!',
        type: 'error',
        timestamp: Date.now()
      })
      playSound('wordError')
      clearSelection()
      return
    }

    if (!dictionary.has(wordLower)) {
      setFeedback({
        message: 'Word not in dictionary!',
        type: 'error',
        timestamp: Date.now()
      })
      playSound('wordError')
      clearSelection()
      return
    }

    const wordScore = calculateWordScore(currentWord)
    setScore(prev => prev + wordScore)
    setWordsFound(prev => prev + 1)
    setUsedWords(prev => new Set([...prev, wordLower]))
    setFeedback({
      message: `+${wordScore} points!`,
      type: 'success',
      timestamp: Date.now()
    })
    playSound('wordSuccess')
    clearSelection()
  }

  // Reset game state
  const resetGame = () => {
    setScore(0)
    setWordsFound(0)
    setTimeLeft(60)
    setCurrentWord('')
    setSelectedTiles([])
    setUsedWords(new Set())
    generateInitialTiles()
    playSound('gameOver')
  }

  // Start game handler
  const handleStartGame = () => {
    resetGame()
    setCurrentScreen('game')
    playSound('wordSuccess')
  }

  // Return to lobby handler
  const handleReturnToLobby = () => {
    resetGame()
    setCurrentScreen('lobby')
    playSound('shuffle')
  }

  // Audio cleanup
  useEffect(() => {
    return () => {
      if (gameTimer.current) {
        clearInterval(gameTimer.current)
      }
      if (audioContext.current?.state === 'running') {
        audioContext.current.close()
      }
    }
  }, [])

  // Game timer effect
  useEffect(() => {
    if (currentScreen === 'game' && timeLeft > 0) {
      gameTimer.current = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1
          if (newTime <= 0) {
            if (gameTimer.current) clearInterval(gameTimer.current)
            setCurrentScreen('end')
          }
          return newTime
        })
      }, 1000)

      return () => {
        if (gameTimer.current) clearInterval(gameTimer.current)
      }
    }
  }, [currentScreen])

  // Initialize audio only after user interaction
  const initializeAudio = () => {
    try {
      if (!audioContext.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        audioContext.current = new AudioContextClass()
      }

      const ctx = audioContext.current
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const createSound = (freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) => {
        return () => {
          if (!ctx || ctx.state !== 'running') return
          
          const oscillator = ctx.createOscillator()
          const gain = ctx.createGain()
          
          oscillator.type = type
          oscillator.frequency.setValueAtTime(freq, ctx.currentTime)
          
          gain.gain.setValueAtTime(volume, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
          
          oscillator.connect(gain)
          gain.connect(ctx.destination)
          
          oscillator.start(ctx.currentTime)
          oscillator.stop(ctx.currentTime + duration)
        }
      }

      sounds.current = {
        tileClick: createSound(800, 0.1, 'sine', 0.05),
        wordSuccess: createSound(440, 0.2, 'sine', 0.1),
        wordError: createSound(200, 0.3, 'square', 0.1),
        gameOver: createSound(300, 0.5, 'sawtooth', 0.1),
        shuffle: createSound(600, 0.2, 'triangle', 0.05)
      }

      setAudioInitialized(true)
    } catch (error) {
      console.error('Failed to initialize audio:', error)
    }
  }

  // Handle user interaction for audio
  useEffect(() => {
    const handleInteraction = () => {
      if (!audioInitialized) {
        initializeAudio()
        document.removeEventListener('click', handleInteraction)
        document.removeEventListener('keydown', handleInteraction)
      }
    }

    document.addEventListener('click', handleInteraction)
    document.addEventListener('keydown', handleInteraction)

    return () => {
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('keydown', handleInteraction)
      if (audioContext.current) {
        audioContext.current.close()
      }
    }
  }, [audioInitialized])

  // Safe sound playing function
  const playSound = (soundName: string) => {
    if (audioInitialized && sounds.current[soundName]) {
      sounds.current[soundName]()
    }
  }

  // Shuffle tiles while maintaining letter properties
  const shuffleTiles = () => {
    setTiles(prev => {
      const newTiles = [...prev]
      for (let i = newTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newTiles[i], newTiles[j]] = [newTiles[j], newTiles[i]]
      }
      return newTiles.map(tile => ({ ...tile, isActive: false }))
    })
    clearSelection()
    playSound('shuffle')
  }

  // Word List Management
  const addWordToList = (word: string, points: number) => {
    const wordsList = document.querySelector('.words-list')
    if (!wordsList) return

    const wordItem = document.createElement('div')
    wordItem.className = 'word-item'
    wordItem.innerHTML = `
      <span class="word">${word.toUpperCase()}</span>
      <span class="score">${points}</span>
    `

    if (wordsList.firstChild) {
      wordsList.insertBefore(wordItem, wordsList.firstChild)
    } else {
      wordsList.appendChild(wordItem)
    }
  }

  // Update Top Words
  const updateTopWords = () => {
    const topWords = Array.from(usedWords)
      .map(word => ({
        word: word.toUpperCase(),
        score: calculateWordScore(word)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    const container = document.querySelector('.top-words')
    if (container) {
      container.innerHTML = `
        <h3>Top Words</h3>
        ${topWords.map(({word, score}) => `
          <div class="word-row">
            <span class="word">${word}</span>
            <span class="points">${score} pts</span>
          </div>
        `).join('')}
      `
    }
  }

  // Feedback Display
  const showFeedback = (type: 'success' | 'error' | 'warning', message: string) => {
    const wordDisplay = document.querySelector('.word-display')
    if (!wordDisplay) return

    wordDisplay.textContent = message
    wordDisplay.className = `word-display feedback`
    wordDisplay.setAttribute('data-type', type)

    setTimeout(() => {
      wordDisplay.className = 'word-display'
      wordDisplay.textContent = currentWord || 'ENTER YOUR WORD'
    }, 1000)
  }

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (currentScreen !== 'game') return

      if (e.key === 'Enter') {
        handleWordSubmit()
      } else if (e.key === 'Escape') {
        clearSelection()
      } else if (e.key === ' ') { // Spacebar
        e.preventDefault()
        shuffleTiles()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentScreen, currentWord])

  // Load dictionary on mount
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        // Try to get dictionary from cache first
        const cachedDictionary = localStorage.getItem('wordblitz_dictionary')
        
        if (cachedDictionary) {
          setDictionary(new Set(JSON.parse(cachedDictionary)))
          setIsLoading(false)
          return
        }

        // If not in cache, fetch from file
        const response = await fetch('/dictionary.json')
        const data: Dictionary = await response.json()
        
        // Convert to Set for O(1) lookups and store in lowercase
        const wordSet = new Set(data.words)
        
        // Cache the dictionary
        localStorage.setItem('wordblitz_dictionary', JSON.stringify(Array.from(wordSet)))
        
        setDictionary(wordSet)
        setIsLoading(false)
      } catch (error) {
        console.error('Error loading dictionary:', error)
        setIsLoading(false)
      }
    }

    loadDictionary()
  }, [])

  // Show loading state while dictionary is being loaded
  if (isLoading) {
    return (
      <div className="loading-screen">
        <h1>WORDBLITZ</h1>
        <div className="loading-spinner">Loading Dictionary...</div>
      </div>
    )
  }

  // Update screen components with new props
  return (
    <div className="container">
      {currentScreen === 'lobby' && (
        <LobbyScreen 
          players={DUMMY_PLAYERS.joiningPlayers}
          onStart={handleStartGame}
        />
      )}
      {currentScreen === 'game' && (
        <GameScreen 
          score={score}
          wordsFound={wordsFound}
          timeLeft={timeLeft}
          currentWord={currentWord}
          tiles={tiles}
          selectedTiles={selectedTiles}
          usedWords={usedWords}
          activePlayers={DUMMY_PLAYERS.activePlayers}
          onTileClick={handleTileClick}
          onSubmitWord={handleWordSubmit}
          onClear={clearSelection}
          onShuffle={shuffleTiles}
          calculateWordScore={calculateWordScore}
          feedback={feedback}
        />
      )}
      {currentScreen === 'end' && (
        <EndScreen 
          finalScore={score}
          wordsFound={wordsFound}
          onReturnToLobby={handleReturnToLobby}
          finalStandings={DUMMY_PLAYERS.finalStandings}
          topWords={Array.from(usedWords)
            .map(word => ({
              word: word.toUpperCase(),
              score: calculateWordScore(word)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)}
        />
      )}
    </div>
  )
}

const LobbyScreen: React.FC<{
  players: typeof DUMMY_PLAYERS.joiningPlayers
  onStart: () => void
}> = ({ players, onStart }) => {
  return (
    <div className="screen lobby-screen active">
      <div className="header">
        <div className="header-column title">
          <h1>WORDBLITZ</h1>
        </div>
      </div>
      <div className="game-columns">
        <div className="column">
          <h2>Players Joining <span>{players.length}</span></h2>
          <div className="joining-list">
            {players.map((player) => (
              <div key={player.id} className="joining-player">
                <span className="player-name">{player.name}</span>
                <span className={`status ${player.status}`}>{player.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="column center">
          <div className="start-game-container">
            <button 
              className="start-game-button"
              onClick={onStart}
            >
              Start Game
            </button>
          </div>
          <h2>How To Play</h2>
          <div className="instructions">
            <p>• Create words using the letter tiles</p>
            <p>• All words must be in the dictionary</p>
            <p>• Longer words score more points</p>
            <p>• Beat the clock and other players!</p>
          </div>
        </div>
        <div className="column">
          <h2>Scoring</h2>
          <div className="multipliers">
            <p>1-4 letters: 1× points</p>
            <p>5 letters: 1.5× points</p>
            <p>6 letters: 2× points</p>
            <p>7 letters: 2.5× points</p>
            <p>8+ letters: 3× points</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const GameScreen: React.FC<GameScreenProps> = ({
  score,
  wordsFound,
  timeLeft,
  currentWord,
  tiles,
  selectedTiles,
  usedWords,
  activePlayers,
  onTileClick,
  onSubmitWord,
  onClear,
  onShuffle,
  calculateWordScore,
  feedback
}) => {
  return (
    <div className="screen game-screen active">
      <div className="header">
        <div className="header-column">
          <p>Words Found</p>
          <span className="counter">{wordsFound}</span>
        </div>
        <div className="header-column title">
          <h1>WORDBLITZ</h1>
          <div className="time-container">
            <span className={`time-left ${timeLeft <= 10 ? 'warning' : ''}`}>
              {timeLeft}s
            </span>
          </div>
        </div>
        <div className="header-column">
          <p>Score</p>
          <span className="counter">{score}</span>
        </div>
      </div>

      <div className="game-columns">
        <div className="column">
          <h2>LEADERBOARD</h2>
          <div className="leaderboard">
            {activePlayers.map((player, index) => (
              <div key={player.id} className="player-row">
                <span className="player-name">{player.name}</span>
                <span className="player-score">{player.score}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="column center">
          <div className="game-area">
            <div className="word-display">
              <span className="current-word">{currentWord}</span>
              {feedback && (
                <div 
                  className={`feedback ${feedback.type}`}
                  key={feedback.timestamp}
                >
                  {feedback.message}
                </div>
              )}
            </div>
            
            <div className="tile-grid">
              {tiles.map((tile, index) => (
                <button
                  key={tile.id}
                  className={`tile ${tile.isActive ? 'active' : ''}`}
                  onClick={() => onTileClick(index)}
                >
                  <span className="letter">{tile.letter}</span>
                  <span className="points">{tile.points}</span>
                </button>
              ))}
            </div>

            <div className="controls">
              <button 
                className="control-button clear"
                onClick={onClear}
                disabled={!currentWord}
              >
                <span className="icon">↺</span>
                Clear
                <span className="shortcut">ESC</span>
              </button>

              <button
                className="control-button submit"
                onClick={onSubmitWord}
                disabled={currentWord.length < 3}
              >
                <span className="icon">✓</span>
                Submit
                <span className="shortcut">↵</span>
              </button>

              <button 
                className="control-button shuffle"
                onClick={onShuffle}
              >
                <span className="icon">⟲</span>
                Shuffle
                <span className="shortcut">Space</span>
              </button>
            </div>
          </div>
        </div>

        <div className="column">
          <h2>WORDS FOUND</h2>
          <div className="words-list">
            {Array.from(usedWords).map((word, index) => (
              <div key={index} className="word-item">
                <span className="word">{word.toUpperCase()}</span>
                <span className="score">{calculateWordScore(word)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function to check if tiles are adjacent
const isAdjacent = (index1: number, index2: number) => {
  const row1 = Math.floor(index1 / 4)
  const col1 = index1 % 4
  const row2 = Math.floor(index2 / 4)
  const col2 = index2 % 4
  
  return Math.abs(row1 - row2) <= 1 && Math.abs(col1 - col2) <= 1
}

const EndScreen: React.FC<{
  finalScore: number
  wordsFound: number
  onReturnToLobby: () => void
  finalStandings: typeof DUMMY_PLAYERS.finalStandings
  topWords: Array<{ word: string; score: number }>
}> = ({ finalScore, wordsFound, onReturnToLobby, finalStandings, topWords }) => {
  return (
    <div className="screen end-screen active">
      <div className="header">
        <div className="header-column title">
          <h1>WORDBLITZ</h1>
        </div>
      </div>
      <div className="game-columns">
        <div className="column">
          <h2>Final Standings</h2>
          <div className="final-standings">
            {finalStandings.map((player) => (
              <div key={player.id} className="standings-row">
                <div className="rank">{player.rank}</div>
                <div className="player-content">
                  <div className="player-info">
                    <div className="player-name">{player.name}</div>
                    <span className="words-found">{player.wordsFound} words</span>
                  </div>
                  <div className="final-score">{player.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="column center">
          <h2>Game Statistics</h2>
          <div className="game-stats">
            <div className="stat-item">
              <span className="stat-label">Total Score</span>
              <span className="stat-value">{finalScore}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Words Found</span>
              <span className="stat-value">{wordsFound}</span>
            </div>
            {/* Additional stats can be added here */}
          </div>
          <div className="return-lobby-container">
            <button 
              className="return-lobby-button"
              onClick={onReturnToLobby}
            >
              Return to Lobby
            </button>
          </div>
        </div>
        <div className="column">
          <h2>Top Words</h2>
          <div className="top-words">
            {topWords.map(({word, score}) => (
              <div key={word} className="word-row">
                <span className="word">{word}</span>
                <span className="points">{score} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Add animations CSS
const gameAnimations = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes scorePopup {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-20px) scale(1.2); opacity: 0; }
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`

// Add the animations to the document
const style = document.createElement('style')
style.textContent = gameAnimations
document.head.appendChild(style)

export default App 