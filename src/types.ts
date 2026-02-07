export interface Vector2 {
  x: number;
  y: number;
}

export interface GameState {
  status: 'MENU' | 'AIMING' | 'FLYING' | 'SINKING' | 'GAME_OVER' | 'SHOP';
  score: number;
  distance: number;
  skips: number;
  currency: number;
}

export interface PlayerStats {
  value: number;
  weight: number;
  bounciness: number; // 0-1, how much energy is conserved on bounce
  aerodynamics: number; // 0-1, how little air resistance there is
  maxPower: number;
}

export interface SurfaceNumber {
  id: string;
  x: number;
  y: number; // Usually fixed, but maybe waves?
  value: number;
  weight: number;
  radius: number;
  color: string;
  type: 'NORMAL' | 'BOOST' | 'BLOCK' | 'COIN';
  sunk: boolean;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
