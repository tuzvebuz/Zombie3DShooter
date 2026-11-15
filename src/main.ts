import { Game } from './Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Console access for testing (?debug only).
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = game;
