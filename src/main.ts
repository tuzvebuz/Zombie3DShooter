import { Game } from './Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Handy for poking at the game from the browser console in debug mode.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = game;
