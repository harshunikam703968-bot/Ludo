import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, RefreshCw, Trophy, User, Info } from 'lucide-react';

/**
 * Ludo Master
 * A full-featured Ludo game built with React, Tailwind CSS, and Framer Motion.
 * 
 * Features:
 * - 2-4 Players local multiplayer
 * - Dice roll with 1-6 values
 * - Logical movement including start requirement (6)
 * - Capturing opponent tokens
 * - Safe zones and home stretch
 * - Victory celebration
 */

// Types
type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

interface Token {
  id: number;
  playerIndex: number;
  color: PlayerColor;
  position: number; // -1: base, 0-51: path, 52-57: home stretch, 58: finished
  indexInBase: number;
}

interface GameState {
  playersCount: number;
  currentPlayerIndex: number;
  diceValue: number;
  diceRolling: boolean;
  canRoll: boolean;
  tokens: Token[];
  winner: number | null;
  logs: string[];
}

// Constants
const GRID_SIZE = 15;
const COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

// Pre-calculate the main loop path (52 cells)
const BOARD_PATH: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 0-4
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8], // 5-12
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 13-17
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23
  [7, 14], // 24
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 25-30
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6], // 31-38
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 39-43
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // 44-49
  [7, 0], // 50
  [6, 0] // 51
];

// Re-adjust start indices
const START_INDICES = [1, 14, 27, 40]; // [Red, Green, Yellow, Blue]
const HOME_STRETCH_ENTRIES = [50, 11, 24, 37]; // Cell before entering home stretch

// Home stretches (6 cells each)
const HOME_STRETCHES: Record<PlayerColor, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

// Base positions (4 tokens each)
const BASE_POSITIONS: Record<PlayerColor, [number, number][]> = {
  red: [[1, 1], [1, 4], [4, 1], [4, 4]],
  green: [[1, 10], [1, 13], [4, 10], [4, 13]],
  yellow: [[10, 10], [10, 13], [13, 10], [13, 13]],
  blue: [[10, 1], [10, 4], [13, 1], [13, 4]],
};

const SAFE_ZONES = [1, 9, 14, 22, 27, 35, 40, 48];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    playersCount: 4,
    currentPlayerIndex: 0,
    diceValue: 0,
    diceRolling: false,
    canRoll: true,
    tokens: COLORS.flatMap((color, pIdx) => 
      Array.from({ length: 4 }).map((_, tIdx) => ({
        id: pIdx * 4 + tIdx,
        playerIndex: pIdx,
        color,
        position: -1,
        indexInBase: tIdx
      }))
    ),
    winner: null,
    logs: ['Game started! Red turn.'],
  });

  const [setupMode, setSetupMode] = useState(true);

  // Helper: Get [row, col] for a token
  const getTokenCoords = (token: Token): [number, number] => {
    if (token.position === -1) return BASE_POSITIONS[token.color][token.indexInBase];
    if (token.position >= 0 && token.position <= 51) return BOARD_PATH[token.position];
    if (token.position >= 52 && token.position <= 57) return HOME_STRETCHES[token.color][token.position - 52];
    return [7, 7]; // Center (Finished)
  };

  // Helper: Get background color for a cell
  const getCellType = (r: number, c: number) => {
    // Bases
    if (r < 6 && c < 6) return 'red-base';
    if (r < 6 && c > 8) return 'green-base';
    if (r > 8 && c > 8) return 'yellow-base';
    if (r > 8 && c < 6) return 'blue-base';

    // Home Stretch
    if (r === 7 && c >= 1 && c <= 6) return 'red-stretch';
    if (c === 7 && r >= 1 && r <= 6) return 'green-stretch';
    if (r === 7 && c >= 8 && c <= 13) return 'yellow-stretch';
    if (c === 7 && r >= 8 && r <= 13) return 'blue-stretch';

    // Start Squares
    if (r === 6 && c === 1) return 'red-start';
    if (r === 1 && c === 8) return 'green-start';
    if (r === 8 && c === 13) return 'yellow-start';
    if (r === 13 && c === 6) return 'blue-start';

    // Center
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';

    return 'white';
  };

  const addLog = (msg: string) => {
    setGameState(prev => ({ ...prev, logs: [msg, ...prev.logs].slice(0, 5) }));
  };

  const nextTurn = useCallback((repeat: boolean = false) => {
    setGameState(prev => {
      let nextIdx = prev.currentPlayerIndex;
      if (!repeat) {
        nextIdx = (prev.currentPlayerIndex + 1) % prev.playersCount;
      }
      return {
        ...prev,
        currentPlayerIndex: nextIdx,
        diceValue: 0,
        canRoll: true,
      };
    });
  }, []);

  const rollDice = () => {
    if (!gameState.canRoll || gameState.diceRolling) return;

    setGameState(prev => ({ ...prev, diceRolling: true, canRoll: false }));

    // Animation delay
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      
      setGameState(prev => {
        const movableTokens = prev.tokens.filter(t => 
          t.playerIndex === prev.currentPlayerIndex && canMoveToken(t, roll, prev.tokens)
        );

        if (movableTokens.length === 0) {
          setTimeout(() => nextTurn(roll === 6), 1000);
          return { ...prev, diceValue: roll, diceRolling: false, canRoll: false };
        }

        return { ...prev, diceValue: roll, diceRolling: false, canRoll: false };
      });
    }, 600);
  };

  const canMoveToken = (token: Token, roll: number, allTokens: Token[]): boolean => {
    // Not their turn?
    if (token.playerIndex !== gameState.currentPlayerIndex) return false;
    
    // In base? Only if roll is 6
    if (token.position === -1) return roll === 6;

    // Already finished?
    if (token.position === 58) return false;

    // In home stretch?
    if (token.position >= 52) {
      return (token.position + roll) <= 58;
    }

    // Default path movement is always allowed (looping or entering home stretch)
    return true;
  };

  const moveToken = (token: Token) => {
    if (gameState.diceRolling || gameState.diceValue === 0) return;
    if (!canMoveToken(token, gameState.diceValue, gameState.tokens)) return;

    let newPos = token.position;
    const roll = gameState.diceValue;

    if (newPos === -1) {
      newPos = START_INDICES[token.playerIndex];
    } else if (newPos >= 52) {
      newPos += roll;
    } else {
      // Logic for loop and entering home stretch
      const entryPoint = HOME_STRETCH_ENTRIES[token.playerIndex];
      const stepsToEntry = (entryPoint - token.position + 52) % 52;
      
      if (roll > stepsToEntry && stepsToEntry < 6) {
        // Enters home stretch
        newPos = 52 + (roll - stepsToEntry - 1);
      } else {
        // Stays on loop
        newPos = (newPos + roll) % 52;
      }
    }

    // Apply move
    setGameState(prev => {
      const newTokens = [...prev.tokens];
      const tokenIdx = newTokens.findIndex(t => t.id === token.id);
      
      // Update token position
      const movedToken = { ...newTokens[tokenIdx], position: newPos };
      newTokens[tokenIdx] = movedToken;

      // Handle Capturing
      let capturedMsg = '';
      if (newPos >= 0 && newPos <= 51 && !SAFE_ZONES.includes(newPos)) {
        for (let i = 0; i < newTokens.length; i++) {
          if (newTokens[i].playerIndex !== movedToken.playerIndex && 
              newTokens[i].position === newPos) {
            newTokens[i] = { ...newTokens[i], position: -1 };
            capturedMsg = `Captured ${COLORS[newTokens[i].playerIndex]} token!`;
          }
        }
      }

      // Check for winner
      const playerTokens = newTokens.filter(t => t.playerIndex === movedToken.playerIndex);
      const hasWon = playerTokens.every(t => t.position === 58);
      
      const winner = hasWon ? movedToken.playerIndex : prev.winner;
      
      if (capturedMsg) addLog(capturedMsg);

      return {
        ...prev,
        tokens: newTokens,
        winner,
      };
    });

    // Check if player gets another turn (roll 6)
    const getsAnother = gameState.diceValue === 6;
    setTimeout(() => nextTurn(getsAnother), 300);
  };

  const resetGame = () => {
    setSetupMode(true);
    setGameState(prev => ({
      ...prev,
      currentPlayerIndex: 0,
      diceValue: 0,
      diceRolling: false,
      canRoll: true,
      tokens: COLORS.flatMap((color, pIdx) => 
        Array.from({ length: 4 }).map((_, tIdx) => ({
          id: pIdx * 4 + tIdx,
          playerIndex: pIdx,
          color,
          position: -1,
          indexInBase: tIdx
        }))
      ),
      winner: null,
      logs: ['Game reset! Red turn.'],
    }));
  };

  if (setupMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="mb-8">
            <h1 className="text-5xl font-black tracking-tighter text-slate-900 mb-1">LUDO.</h1>
            <p className="text-slate-400 font-medium tracking-wide">Premium Board Experience</p>
          </div>
          
          <div className="space-y-6 mb-10">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Select Players</label>
            <div className="grid grid-cols-3 gap-3">
              {[2, 3, 4].map(num => (
                <button
                  key={num}
                  onClick={() => setGameState(prev => ({ ...prev, playersCount: num }))}
                  className={`py-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                    gameState.playersCount === num 
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' 
                      : 'border-slate-100 hover:border-slate-200 text-slate-400'
                  }`}
                >
                  {num}P
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSetupMode(false)}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 rounded-2xl shadow-xl shadow-slate-200 transition-all transform active:scale-95 uppercase tracking-widest text-sm"
          >
            Start Match
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-center min-h-screen bg-slate-50 p-4 lg:p-12 gap-8 font-sans transition-colors duration-500">
      
      {/* Sidebar: Game Info & Controls */}
      <div className="w-full lg:w-1/4 flex flex-col justify-between gap-8 order-2 lg:order-1">
        <div className="space-y-8">
          <header>
            <h1 className="text-5xl font-black tracking-tighter text-slate-900 leading-none">LUDO.</h1>
            <p className="text-slate-400 font-medium mt-1">Classic Board Game</p>
          </header>

          <div className={`p-5 rounded-3xl bg-white shadow-sm border transition-shadow duration-300 ${
            gameState.currentPlayerIndex === 0 ? 'border-rose-200 shadow-rose-100/50' : 
            gameState.currentPlayerIndex === 1 ? 'border-emerald-200 shadow-emerald-100/50' : 
            gameState.currentPlayerIndex === 2 ? 'border-amber-200 shadow-amber-100/50' : 
            'border-sky-200 shadow-sky-100/50'
          }`}>
            <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-3">Current Turn</p>
            <div className="flex items-center gap-4">
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className={`w-5 h-5 rounded-full ${
                  gameState.currentPlayerIndex === 0 ? 'bg-rose-500' : 
                  gameState.currentPlayerIndex === 1 ? 'bg-emerald-500' : 
                  gameState.currentPlayerIndex === 2 ? 'bg-amber-500' : 
                  'bg-sky-500'
                } shadow-sm`} 
              />
              <span className={`font-black text-xl capitalize ${
                  gameState.currentPlayerIndex === 0 ? 'text-rose-600' : 
                  gameState.currentPlayerIndex === 1 ? 'text-emerald-600' : 
                  gameState.currentPlayerIndex === 2 ? 'text-amber-600' : 
                  'text-sky-600'
              }`}>
                {COLORS[gameState.currentPlayerIndex]} Player
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {COLORS.slice(0, gameState.playersCount).map((color, idx) => {
              const finishedCount = gameState.tokens.filter(t => t.playerIndex === idx && t.position === 58).length;
              return (
                <div key={color} className={`p-4 rounded-2xl border text-center transition-colors ${
                  color === 'red' ? 'bg-rose-50 border-rose-100 text-rose-600' : 
                  color === 'green' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 
                  color === 'yellow' ? 'bg-amber-50 border-amber-100 text-amber-600' : 
                  'bg-sky-50 border-sky-100 text-sky-600'
                }`}>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{color}</div>
                  <div className="text-2xl font-black">{finishedCount}/4</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-5 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Dice Value</div>
            <motion.div
              animate={gameState.diceRolling ? {
                rotate: [0, 90, 180, 270, 360],
                scale: [1, 1.1, 1],
              } : {}}
              transition={{ duration: 0.6, repeat: gameState.diceRolling ? Infinity : 0 }}
              className={`
                w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-4xl font-black shadow-xl
                ${gameState.diceRolling ? 'opacity-90' : ''}
              `}
            >
              {gameState.diceValue || '?'}
            </motion.div>
            
            <button
              disabled={!gameState.canRoll || gameState.diceRolling}
              onClick={rollDice}
              className={`
                w-full py-4 rounded-2xl font-black transition-all uppercase tracking-widest text-xs
                ${!gameState.canRoll || gameState.diceRolling 
                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                  : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-200'}
              `}
            >
              Roll Dice
            </button>
          </div>
          <button 
            onClick={resetGame}
            className="w-full text-slate-400 hover:text-slate-600 font-bold py-2 text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} />
            Reset Match
          </button>
        </div>
      </div>

      {/* Main Board */}
      <div className="relative order-1 lg:order-2 flex items-center justify-center">
        <div 
          className="bg-white p-1 rounded-sm shadow-2xl border-[12px] border-white ring-1 ring-slate-200"
          style={{ width: 'min(90vw, 650px)', height: 'min(90vw, 650px)' }}
        >
          <div className="grid grid-cols-15 grid-rows-15 w-full h-full border border-slate-100 relative bg-slate-100 gap-[1px]">
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
              const r = Math.floor(i / GRID_SIZE);
              const c = i % GRID_SIZE;
              const type = getCellType(r, c);
              
              let bgColor = 'bg-white';
              
              if (type === 'red-base') bgColor = 'bg-rose-500';
              if (type === 'green-base') bgColor = 'bg-emerald-500';
              if (type === 'yellow-base') bgColor = 'bg-amber-500';
              if (type === 'blue-base') bgColor = 'bg-sky-500';

              if (type.includes('stretch') || type.includes('start')) {
                if (type.includes('red')) bgColor = 'bg-rose-100';
                if (type.includes('green')) bgColor = 'bg-emerald-100';
                if (type.includes('yellow')) bgColor = 'bg-amber-100';
                if (type.includes('blue')) bgColor = 'bg-sky-100';
              }

              // Special highlight for home stretch and start
              const isPathSpecial = (r === 6 && c === 1) || (r === 1 && c === 8) || (r === 8 && c === 13) || (r === 13 && c === 6) || (type.includes('stretch'));
              if (isPathSpecial) {
                if (type.includes('red')) bgColor = 'bg-rose-500';
                if (type.includes('green')) bgColor = 'bg-emerald-500';
                if (type.includes('yellow')) bgColor = 'bg-amber-500';
                if (type.includes('blue')) bgColor = 'bg-sky-500';
              }

              if (type === 'center') bgColor = 'bg-slate-50';

              return (
                <div 
                  key={i} 
                  className={`${bgColor} flex items-center justify-center relative border border-slate-50`}
                >
                  {type === 'center' && (
                    <div className="w-full h-full flex flex-wrap">
                      <div className="w-1/2 h-1/2 bg-rose-400 opacity-20"></div>
                      <div className="w-1/2 h-1/2 bg-emerald-400 opacity-20"></div>
                      <div className="w-1/2 h-1/2 bg-sky-400 opacity-20"></div>
                      <div className="w-1/2 h-1/2 bg-amber-400 opacity-20"></div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Tokens */}
            <AnimatePresence>
              {gameState.tokens.slice(0, gameState.playersCount * 4).map(token => {
                const [r, c] = getTokenCoords(token);
                const tokensOnSamePos = gameState.tokens.filter(t => t.id !== token.id && t.position === token.position && t.position !== -1 && t.position !== 58);
                const offsetIdx = tokensOnSamePos.findIndex(t => t.id < token.id) + 1;
                const offset = tokensOnSamePos.length > 0 ? (offsetIdx * 2 - 2) : 0;

                const isMovable = !gameState.diceRolling && gameState.diceValue > 0 && canMoveToken(token, gameState.diceValue, gameState.tokens);

                return (
                  <motion.div
                    key={token.id}
                    layout
                    initial={{ scale: 0 }}
                    animate={{ 
                      scale: 1,
                      x: offset,
                      y: offset,
                      top: `${(r / 15) * 100}%`,
                      left: `${(c / 15) * 100}%`,
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    onClick={() => moveToken(token)}
                    className={`absolute z-10 w-[6.6%] h-[6.6%] flex items-center justify-center cursor-pointer`}
                    style={{ top: `${(r / 15) * 100}%`, left: `${(c / 15) * 100}%` }}
                  >
                    <div className={`
                      w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-lg border-2 border-white/80
                      ${token.color === 'red' ? 'bg-rose-600 shadow-rose-200' : 
                        token.color === 'green' ? 'bg-emerald-600 shadow-emerald-200' : 
                        token.color === 'yellow' ? 'bg-amber-500 shadow-amber-200' : 
                        'bg-sky-600 shadow-sky-200'}
                      ${isMovable ? 'animate-pulse scale-110 z-20 brightness-110 ring-4 ring-black/10' : ''}
                      transition-all hover:scale-110
                    `}>
                      <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Activity Log column */}
      <div className="w-full lg:w-1/4 bg-white rounded-3xl p-8 border border-slate-200 flex flex-col gap-6 shadow-sm order-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Activity Log</h3>
        <div className="flex-1 space-y-4 overflow-hidden" id="game-logs">
          <AnimatePresence>
            {gameState.logs.map((log, i) => (
              <motion.div 
                key={`${log}-${i}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1 - (i * 0.2), x: 0 }}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-medium text-slate-600"
              >
                {log}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="pt-6 border-t border-slate-100">
           <div className="flex items-center gap-3 text-slate-300">
              <Info size={14} />
              <p className="text-[9px] font-bold uppercase tracking-widest leading-loose">
                Roll a 6 to enter the board. Safe squares are marked with solid colors.
              </p>
           </div>
        </div>
      </div>

      {/* Win Modal */}
      {gameState.winner !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-900/40 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full text-center border-8 border-indigo-50"
          >
            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
              <Trophy size={48} />
            </div>
            <h2 className="text-4xl font-black mb-2 text-neutral-900">Victory!</h2>
            <p className="text-neutral-500 mb-10 text-lg leading-relaxed">
              The <span className="font-bold text-indigo-600 uppercase tracking-widest">{COLORS[gameState.winner]}</span> player has dominated the board.
            </p>
            <button
              onClick={resetGame}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-[2rem] shadow-xl shadow-indigo-200 transition-all transform active:scale-95 text-lg"
            >
              New Journey
            </button>
          </motion.div>
        </div>
      )}

      {/* Helper Tips */}
      <div className="fixed bottom-6 right-6 z-40 hidden md:block">
        <div className="bg-white/80 backdrop-blur px-5 py-3 rounded-2xl border border-neutral-200 shadow-sm text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.15em] flex gap-6">
           <div>• Roll a 6 to start</div>
           <div>• Land on enemy to capture</div>
           <div>• Safe zones are dotted/colored</div>
        </div>
      </div>

    </div>
  );
}
