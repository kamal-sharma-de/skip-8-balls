import { Vector2 } from '../types';

export const GRAVITY = 0.8; // Was 0.5
export const AIR_RESISTANCE = 0.99; // Was 0.995 (more drag)
export const SURFACE_Y_OFFSET = 150; // Raise surface so we have more room to fall

export const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const generateSurfaceNumber = (x: number, difficultyMultiplier: number): any => {
  const types = ['NORMAL', 'NORMAL', 'NORMAL', 'BOOST', 'BLOCK', 'COIN'];
  // Early game help
  if (difficultyMultiplier < 1.5) {
      types.push('BOOST', 'BOOST');
  }
  const type = types[Math.floor(Math.random() * types.length)];
  
  let value = Math.floor(randomRange(1, 10) * difficultyMultiplier);
  let weight = 1;
  let color = '#a5b4fc'; // Indigo-300

  switch (type) {
    case 'BOOST':
      value = Math.floor(value * 0.5);
      color = '#4ade80'; // Green-400
      break;
    case 'BLOCK':
      value = Math.floor(value * 1.5);
      weight = 2;
      color = '#f87171'; // Red-400
      break;
    case 'COIN':
      value = 1;
      weight = 0.1;
      color = '#fbbf24'; // Amber-400
      break;
    default:
      // Normal
      break;
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    x,
    y: 0, // Relative to surface level
    value: Math.max(1, value),
    weight,
    radius: 35 + (value % 10), // Bigger targets (was 20)
    color,
    type,
    sunk: false,
  };
};
