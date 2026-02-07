import { Vector2 } from '../types';

export const GRAVITY = 0.8; // Was 0.5
export const AIR_RESISTANCE = 0.99; // Was 0.995 (more drag)
export const SURFACE_Y_OFFSET = 150; // Raise surface so we have more room to fall

export const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const generateSurfaceNumber = (x: number, difficultyMultiplier: number): any => {
  const types = ['NORMAL', 'NORMAL', 'NORMAL', 'BOOST', 'BLOCK', 'COIN'];
  
  // Add advanced types based on difficulty
  if (difficultyMultiplier > 1.2) {
      types.push('MOVING'); // Simple moving targets
  }
  if (difficultyMultiplier > 1.5) {
      types.push('MULTI_HIT'); // Tough targets
  }
  if (difficultyMultiplier > 2.0) {
      types.push('GHOST'); // Tricky targets
  }

  // Early game help
  if (difficultyMultiplier < 1.5) {
      types.push('BOOST', 'BOOST');
  }
  
  const type = types[Math.floor(Math.random() * types.length)];
  
  let value = Math.floor(randomRange(1, 10) * difficultyMultiplier);
  let weight = 1;
  let color = '#a5b4fc'; // Indigo-300 (Default)
  let hitsRequired = 1;
  let isMoving = false;
  let moveSpeed = 0;
  let moveRange = 0;
  let opacity = 1;

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
    case 'MULTI_HIT':
      value = Math.floor(value * 2); // High value
      hitsRequired = 3;
      weight = 1.5;
      color = '#d97706'; // Amber-600 (Tough look)
      break;
    case 'MOVING':
      value = Math.floor(value * 1.2);
      isMoving = true;
      moveSpeed = randomRange(0.02, 0.05);
      moveRange = randomRange(30, 80);
      color = '#c084fc'; // Purple-400
      break;
    case 'GHOST':
      value = Math.floor(value * 1.5);
      opacity = 0.5; // Starts semi-transparent
      color = '#22d3ee'; // Cyan-400
      break;
    default:
      // Normal
      break;
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    x,
    y: 0, // Relative to surface level
    initialY: 0,
    value: Math.max(1, value),
    weight,
    radius: 35 + (value % 10), // Bigger targets (was 20)
    color,
    type,
    sunk: false,
    hitsRequired,
    maxHits: hitsRequired,
    isMoving,
    moveSpeed,
    moveRange,
    opacity
  };
};
