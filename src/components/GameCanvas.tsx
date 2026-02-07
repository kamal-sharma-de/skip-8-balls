import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, PlayerStats, SurfaceNumber, Particle } from '../types';
import { GRAVITY, AIR_RESISTANCE, SURFACE_Y_OFFSET, generateSurfaceNumber, randomRange } from '../utils/gameUtils';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const POWER_SCALE = 0.15; // Define globally

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Game State
  const [gameState, setGameState] = useState<GameState['status']>('MENU');
  const [stats, setStats] = useState({ distance: 0, skips: 0, score: 0, currency: 0, combo: 0 });
  const [, forceUpdate] = useState(0);
  const [debugInfo, setDebugInfo] = useState('');
  const [liveDebug, setLiveDebug] = useState(''); // New live debug
  const [showTutorial, setShowTutorial] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [diveEffect, setDiveEffect] = useState<{x: number, y: number, id: number} | null>(null);

  // Mutable Game Objects (Refs for performance in loop)
  const playerRef = useRef({
    x: 100,
    y: CANVAS_HEIGHT - SURFACE_Y_OFFSET - 30,
    vx: 0,
    vy: 0,
    radius: 25,
    rotation: 0,
    vr: 0, // rotational velocity
  });

  const playerStatsRef = useRef<PlayerStats>({
    value: 10,
    weight: 1.0,
    bounciness: 0.7,
    aerodynamics: 0.99,
    maxPower: 25,
  });

  const surfaceRef = useRef<SurfaceNumber[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cameraRef = useRef({ x: 0, y: 0, shake: 0 });
  const inputRef = useRef({ isDragging: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const timeRef = useRef(0);
  const stoppedFramesRef = useRef(0);

  // Initialize Surface
  const initSurface = useCallback(() => {
    const numbers: SurfaceNumber[] = [];
    for (let i = 0; i < 20; i++) {
      numbers.push(generateSurfaceNumber(300 + i * 80, 1));
    }
    surfaceRef.current = numbers;
  }, []);

  // Reset Run
  const resetRun = () => {
    playerRef.current = {
      x: 100,
      y: CANVAS_HEIGHT - SURFACE_Y_OFFSET - 30,
      vx: 0,
      vy: 0,
      radius: 25,
      rotation: 0,
      vr: 0,
    };
    cameraRef.current.x = 0;
    cameraRef.current.y = 0;
    cameraRef.current.shake = 0;
    setStats(prev => ({ ...prev, distance: 0, skips: 0, score: 0, combo: 0 }));
    initSurface();
    setGameState('AIMING');
  };

  // Initialize Surface on Mount
  useEffect(() => {
      initSurface();
  }, [initSurface]);

  // Game Loop
  const update = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    timeRef.current += 0.05;

    // --- PHYSICS ---
    if (gameState === 'FLYING' || gameState === 'SINKING') {
      const p = playerRef.current;
      
      // Gravity
      if (gameState === 'FLYING') {
        const LOCAL_GRAVITY = 0.8; // Force local gravity to ensure it's not 0
        p.vy += LOCAL_GRAVITY * (playerStatsRef.current.weight || 1.0);
        
        p.vx *= AIR_RESISTANCE * playerStatsRef.current.aerodynamics;
        p.vy *= AIR_RESISTANCE; // Simple air drag
        p.rotation += p.vr;
        p.vr *= 0.98; // Rotational drag to stop infinite spinning
        
        // Safety check for NaN
        if (isNaN(p.vx)) p.vx = 0;
        if (isNaN(p.vy)) p.vy = 0;
        if (isNaN(p.x)) p.x = 100;
        if (isNaN(p.y)) p.y = CANVAS_HEIGHT - SURFACE_Y_OFFSET - 30;
        
        // Cap vertical velocity to prevent shooting into space
        if (p.vy < -25) p.vy = -25;

        // Check if stopped moving (stuck on target or water)
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed < 1.0) { // Increased threshold slightly
            stoppedFramesRef.current++;
            if (stoppedFramesRef.current > 30) { // 0.5 second of stillness (faster reaction)
                // If we are here, we are resting on a target (otherwise we would have sunk)
                // Allow the player to shoot again!
                setGameState('AIMING'); 
                stoppedFramesRef.current = 0;
                
                // Reset velocity completely to prevent drift
                p.vx = 0;
                p.vy = 0;
                p.vr = 0;
            }
        } else {
            stoppedFramesRef.current = 0;
        }
      }

      // Movement
      p.x += p.vx;
      p.y += p.vy;

      // Camera Follow X
      const targetCamX = p.x - 200;
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
      if (cameraRef.current.x < 0) cameraRef.current.x = 0;

      // Camera Follow Y (Aggressive Tracking)
      // If player goes above the top 30% of screen, move camera up immediately
      const screenY = p.y - cameraRef.current.y;
      const topMargin = CANVAS_HEIGHT * 0.3;
      
      if (screenY < topMargin) {
          // Player is too high, move camera up
          cameraRef.current.y += (screenY - topMargin) * 0.2;
      } else if (screenY > CANVAS_HEIGHT * 0.6 && cameraRef.current.y < 0) {
          // Player is low and camera is high, move camera down (but not past 0)
          cameraRef.current.y += (screenY - CANVAS_HEIGHT * 0.6) * 0.1;
          if (cameraRef.current.y > 0) cameraRef.current.y = 0;
      }

      // Shake Decay
      if (cameraRef.current.shake > 0) {
          cameraRef.current.shake *= 0.9;
          if (cameraRef.current.shake < 0.5) cameraRef.current.shake = 0;
      }

      // Surface Collision / Generation
      const surfaceY = CANVAS_HEIGHT - SURFACE_Y_OFFSET;
      
      // Generate new surface numbers if needed
      const rightmost = surfaceRef.current[surfaceRef.current.length - 1];
      if (rightmost.x < cameraRef.current.x + CANVAS_WIDTH + 200) {
        const difficulty = 1 + (p.x / 5000); // Difficulty scales with distance
        // Closer together (was 60-100)
        surfaceRef.current.push(generateSurfaceNumber(rightmost.x + randomRange(50, 80), difficulty));
      }

      // Cleanup old surface numbers
      if (surfaceRef.current.length > 50) {
        surfaceRef.current.shift();
      }

      // Check Collisions
      if (gameState === 'FLYING') {
        const surfaceY = CANVAS_HEIGHT - SURFACE_Y_OFFSET;
        let hitTarget = false;

        // Check Target Collisions
        for (const num of surfaceRef.current) {
            if (num.sunk) continue;
            // Optimization: only check nearby
            if (num.x < p.x - 100 || num.x > p.x + 100) continue;

            // Calculate target position (including bobbing)
            const numY = surfaceY + Math.sin(timeRef.current + num.x) * 3;
            
            const dx = p.x - num.x;
            const dy = p.y - numY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const minDist = p.radius + num.radius;

            if (dist < minDist) {
                hitTarget = true;
                
                // Collision Logic
                const impactVelocity = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                const impactForce = impactVelocity * playerStatsRef.current.weight * playerStatsRef.current.value;
                const resistance = num.value * num.weight;

                if (impactForce > resistance || num.type === 'COIN') {
                    // SKIP!
                    // Bounce off the target
                    // Simple bounce: invert Y and add some lift
                    p.vy = -Math.abs(p.vy) * playerStatsRef.current.bounciness;
                    p.vy -= 2; // Extra pop
                    
                    // Prevent sinking into the ball
                    const overlap = minDist - dist;
                    p.y -= overlap; // Push out

                    // Friction
                    // Reduced friction to keep momentum (was max(0.5, ...))
                    const friction = Math.max(0.8, 1 - (resistance / (impactForce * 5)));
                    p.vx *= friction;
                    p.vr = p.vx * 0.1;

                    // Effects
                    createParticles(p.x, numY, 10, num.color);
                    cameraRef.current.shake = Math.min(impactForce / 5, 20);

                    // Stats
                    setStats(prev => {
                        const newCombo = prev.combo + 1;
                        const comboMultiplier = 1 + (newCombo * 0.1);
                        return {
                            ...prev,
                            skips: prev.skips + 1,
                            combo: newCombo,
                            score: Math.floor(prev.score + (num.value * 10 * comboMultiplier)),
                            currency: prev.currency + (num.type === 'COIN' ? 10 : 1)
                        };
                    });

                    // Special Types
                    if (num.type === 'BOOST') {
                        p.vx *= 1.5;
                        p.vy -= 5; 
                    }

                    num.sunk = true;
                } else {
                    // SINK (Hit target but too weak)
                    setGameState('SINKING');
                    p.vx *= 0.1;
                    p.vy = 2;
                    createParticles(p.x, numY, 20, '#fff');
                    cameraRef.current.shake = 10;
                    setStats(prev => ({ ...prev, combo: 0 }));
                }
                break; // Only hit one target per frame
            }
        }

        // Check Water Collision (Only if we didn't hit a target)
        if (!hitTarget && p.y + p.radius >= surfaceY) {
             // WATER SKIPPING LOGIC
             // If we are moving fast enough, we can skip on the water itself!
             const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
             const isMovingDown = p.vy > 0;
             
             // Lower threshold to 5 (was 10) to make it more forgiving
             if (speed > 5 && isMovingDown) {
                 // SKIP ON WATER
                 p.y = surfaceY - p.radius;
                 p.vy = -Math.abs(p.vy) * 0.6; // Bouncier water (was 0.5)
                 p.vx *= 0.9; // Less friction (was 0.8)
                 p.vr = p.vx * 0.2;
                 
                 createParticles(p.x, surfaceY, 15, '#3b82f6'); // Blue splash
                 cameraRef.current.shake = 5;
                 
                 // Reset combo on water hit (penalty)
                 setStats(prev => ({ ...prev, combo: 0 }));
             } else if (Math.abs(p.vy) < 4) {
                 // SOFT LANDING (FLOAT)
                 // If we hit the water gently, we float instead of sinking!
                 p.y = surfaceY - p.radius;
                 p.vy = 0;
                 p.vx *= 0.85; // Water drag slows us down
                 p.vr *= 0.8;

                 // Visuals
                 if (Math.random() > 0.8) {
                    createParticles(p.x, surfaceY, 1, '#fff');
                 }

                 // If we stop moving, we can shoot again
                 if (Math.abs(p.vx) < 0.5) {
                     setGameState('AIMING');
                     p.vx = 0;
                     p.vr = 0;
                 }
             } else {
                 // SINK (Too slow AND falling fast = Splash)
                 setGameState('SINKING');
                 p.vx *= 0.5;
                 p.vy = 2;
                 setStats(prev => ({ ...prev, combo: 0 }));
             }
        }
      }

      // Sinking Logic
      if (gameState === 'SINKING') {
          p.vy += 0.1; // Slow gravity underwater
          p.vx *= 0.9;
          if (p.y > CANVAS_HEIGHT + 100 || Math.abs(p.vx) < 0.1) {
              setGameState('GAME_OVER');
          }
      }

      // Update Stats
      if (gameState === 'FLYING') {
          setStats(prev => ({ ...prev, distance: Math.floor(p.x / 10) }));
          // Live Debug
          setLiveDebug(`Pos: ${Math.round(p.x)},${Math.round(p.y)} Vel: ${p.vx.toFixed(2)},${p.vy.toFixed(2)} G: ${gameState} W: ${playerStatsRef.current.weight}`);
      }
    }

    // --- PARTICLES ---
    particlesRef.current.forEach(part => {
        part.x += part.vx;
        part.y += part.vy;
        part.vy += 0.2; // Gravity
        part.life -= 0.02;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);


    // --- RENDER ---
    // Background (Infinite)
    ctx.fillStyle = '#1e1b4b'; // Indigo-950
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid/Stars (Parallax)
    ctx.fillStyle = '#312e81';
    for(let i=0; i<CANVAS_WIDTH; i+=100) {
        ctx.fillRect((i - (cameraRef.current.x * 0.5) % 100), 0, 1, CANVAS_HEIGHT);
    }

    ctx.save();
    // Apply Shake and Camera
    const shakeX = (Math.random() - 0.5) * cameraRef.current.shake;
    const shakeY = (Math.random() - 0.5) * cameraRef.current.shake;
    
    // Smooth camera Y
    const camY = Math.min(0, cameraRef.current.y); // Ensure it never goes positive (below water)
    
    ctx.translate(-cameraRef.current.x + shakeX, -camY + shakeY);

    // Water/Surface Line (Wavy)
    const surfaceY = CANVAS_HEIGHT - SURFACE_Y_OFFSET;
    
    // Draw Water Block (Extend infinitely down)
    ctx.beginPath();
    ctx.moveTo(cameraRef.current.x, surfaceY);
    
    // Draw waves
    for (let x = cameraRef.current.x; x < cameraRef.current.x + CANVAS_WIDTH; x += 20) {
        const waveY = surfaceY + Math.sin((x * 0.01) + timeRef.current) * 5;
        ctx.lineTo(x, waveY);
    }
    
    // Extend way down to cover any camera movement
    ctx.lineTo(cameraRef.current.x + CANVAS_WIDTH, CANVAS_HEIGHT + 2000); 
    ctx.lineTo(cameraRef.current.x, CANVAS_HEIGHT + 2000);
    ctx.closePath();
    
    // Water gradient
    const grad = ctx.createLinearGradient(0, surfaceY, 0, CANVAS_HEIGHT + 500);
    grad.addColorStop(0, 'rgba(79, 70, 229, 0.4)');
    grad.addColorStop(1, 'rgba(79, 70, 229, 0.9)');
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Water Top Line
    ctx.beginPath();
    for (let x = cameraRef.current.x; x < cameraRef.current.x + CANVAS_WIDTH; x += 20) {
        const waveY = surfaceY + Math.sin((x * 0.01) + timeRef.current) * 5;
        if (x === cameraRef.current.x) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
    }
    ctx.strokeStyle = '#818cf8'; // Indigo-400
    ctx.lineWidth = 2;
    ctx.stroke();

    // Surface Numbers
    surfaceRef.current.forEach(num => {
        if (num.x < cameraRef.current.x - 100 || num.x > cameraRef.current.x + CANVAS_WIDTH + 100) return;
        
        ctx.beginPath();
        // Bobbing effect
        const bobY = Math.sin(timeRef.current + num.x) * 3;
        const drawY = num.sunk ? surfaceY + 40 : surfaceY + bobY; 
        
        ctx.arc(num.x, drawY, num.radius, 0, Math.PI * 2);
        ctx.fillStyle = num.sunk ? '#475569' : num.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!num.sunk) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${12 + (num.radius/3)}px "JetBrains Mono"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num.value.toString(), num.x, drawY);

            // DEBUG: Draw Hitbox
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(num.x, drawY, (num.radius + 25) * 0.8, 0, Math.PI * 2); // 25 is player radius
            ctx.stroke();
        }
    });

    // Player
    const p = playerRef.current;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#6366f1'; // Indigo-500
    ctx.lineWidth = 4;
    ctx.stroke();

    // DEBUG: Player Hitbox
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Player Label (only when aiming)
    if (gameState === 'AIMING') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Inter"';
        ctx.textAlign = 'center';
        ctx.fillText("YOU", 0, -35);
    }

    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 20px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerStatsRef.current.value.toString(), 0, 0);
    
    ctx.restore();

    // Particles
    particlesRef.current.forEach(part => {
        ctx.globalAlpha = part.life;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Aim Line (Arrow)
    if (gameState === 'AIMING' && inputRef.current.isDragging) {
        const dx = inputRef.current.startX - inputRef.current.currentX;
        const dy = inputRef.current.startY - inputRef.current.currentY;
        
        // Check for wrong direction
        if (dx < 0) {
            ctx.fillStyle = '#ef4444'; // Red
            ctx.font = 'bold 16px "Inter"';
            ctx.textAlign = 'center';
            ctx.fillText("PULL BACK TO SHOOT!", p.x, p.y - 40);
            
            // Draw X
            ctx.beginPath();
            ctx.moveTo(p.x - 10, p.y - 10);
            ctx.lineTo(p.x + 10, p.y + 10);
            ctx.moveTo(p.x + 10, p.y - 10);
            ctx.lineTo(p.x - 10, p.y + 10);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            // Clamp power
            const dist = Math.sqrt(dx*dx + dy*dy);
            const maxDist = 200;
            const scale = Math.min(dist, maxDist) / dist;
            const aimX = p.x + dx * scale;
            const aimY = p.y + dy * scale;
            
            const isPerfect = dist >= maxDist * 0.95;

            // Draw Arrow
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(aimX, aimY);
            ctx.strokeStyle = isPerfect ? '#fbbf24' : 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = isPerfect ? 4 : 3;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw Trajectory
            // Calculate predicted launch velocity
            let pVx = dx * POWER_SCALE;
            let pVy = dy * POWER_SCALE;
            
            // Force a minimum upward angle for horizontal-ish drags
            // REMOVED: Let the user shoot straight/down if they want. Physics will handle it.
            // if (Math.abs(dy) < dx * 0.2) {
            //     pVy = -Math.abs(dx * 0.1); 
            // }

            const pSpeed = Math.sqrt(pVx*pVx + pVy*pVy);
            const currentMaxPower = playerStatsRef.current.maxPower;
            if (pSpeed > currentMaxPower) {
                const s = currentMaxPower / pSpeed;
                pVx *= s;
                pVy *= s;
            }
            if (isPerfect) {
                pVx *= 1.2;
                pVy *= 1.2;
            }
            drawTrajectory(ctx, p.x, p.y, pVx, pVy);
            
            // Arrow Head
            const angle = Math.atan2(aimY - p.y, aimX - p.x);
            const headLen = 15;
            ctx.beginPath();
            ctx.moveTo(aimX, aimY);
            ctx.lineTo(aimX - headLen * Math.cos(angle - Math.PI / 6), aimY - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(aimX - headLen * Math.cos(angle + Math.PI / 6), aimY - headLen * Math.sin(angle + Math.PI / 6));
            ctx.fillStyle = isPerfect ? '#fbbf24' : '#fff';
            ctx.fill();

            if (isPerfect) {
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold 14px "Inter"';
                ctx.fillText("PERFECT!", aimX, aimY - 20);
            }
        }
    }

    // Draw Dive Effect
    if (diveEffect) {
        ctx.save();
        ctx.translate(diveEffect.x, diveEffect.y);
        const scale = 1 + (Date.now() - diveEffect.id) / 200;
        const alpha = 1 - (Date.now() - diveEffect.id) / 500;
        
        if (alpha > 0) {
            ctx.scale(scale, scale);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = 'bold italic 24px "Inter"';
            ctx.textAlign = 'center';
            ctx.fillText("DIVE!", 0, 0);
        }
        ctx.restore();
    }

    ctx.restore();

    // Off-screen Indicator
    const pScreenY = p.y - cameraRef.current.y;
    if (pScreenY < -50) {
        // Player is above screen
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, 40);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, 15);
        ctx.lineTo(10, 15);
        ctx.fill();
        ctx.font = '12px "Inter"';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(Math.abs(pScreenY/10))}m UP`, 0, 30);
        ctx.restore();
    }

    requestRef.current = requestAnimationFrame(update);
  }, [gameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  // Input Handlers
  // Removed duplicate declarations

  // Trajectory Prediction
  const drawTrajectory = (ctx: CanvasRenderingContext2D, startX: number, startY: number, vx: number, vy: number) => {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      
      let x = startX;
      let y = startY;
      let vX = vx;
      let vY = vy;
      
      // Simulate 30 frames
      for(let i=0; i<30; i++) {
          vY += GRAVITY * playerStatsRef.current.weight;
          vX *= AIR_RESISTANCE * playerStatsRef.current.aerodynamics;
          vY *= AIR_RESISTANCE;
          x += vX;
          y += vY;
          ctx.lineTo(x, y);
      }
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
  };

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!inputRef.current.isDragging || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    inputRef.current.currentX = (e.clientX - rect.left) * scaleX;
    inputRef.current.currentY = (e.clientY - rect.top) * scaleY;
  }, []);

  const handleWindowTouchMove = useCallback((e: TouchEvent) => {
    if (!inputRef.current.isDragging || !canvasRef.current) return;
    e.preventDefault(); 
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    inputRef.current.currentX = (e.touches[0].clientX - rect.left) * scaleX;
    inputRef.current.currentY = (e.touches[0].clientY - rect.top) * scaleY;
  }, []);

  const handleWindowMouseUp = useCallback(() => {
    if (!inputRef.current.isDragging) return;
    inputRef.current.isDragging = false;
    
    // Remove global listeners
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
    window.removeEventListener('touchmove', handleWindowTouchMove);
    window.removeEventListener('touchend', handleWindowMouseUp);

    // Launch Logic
    const dx = inputRef.current.startX - inputRef.current.currentX;
    const dy = inputRef.current.startY - inputRef.current.currentY;
    
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist < 10) return;

    if (dx < 0) {
        setGameState('AIMING');
        setShowTutorial(true);
        return;
    }

    if (gameState === 'AIMING') {
        setShowTutorial(false);
    }

    const maxDist = 200;
    const isPerfect = dist >= maxDist * 0.95;
    const maxPower = playerStatsRef.current.maxPower;
    
    // Calculate Velocity
    let vx = dx * POWER_SCALE;
    let vy = dy * POWER_SCALE;
    
    // Force a minimum upward angle for horizontal-ish drags
    if (Math.abs(dy) < dx * 0.2) {
        vy = -Math.abs(dx * 0.1); 
    }
    
    const speed = Math.sqrt(vx*vx + vy*vy);
    if (speed > maxPower) {
        const scale = maxPower / speed;
        vx *= scale;
        vy *= scale;
    }
    
    if (isPerfect) {
        vx *= 1.2;
        vy *= 1.2;
        createParticles(playerRef.current.x, playerRef.current.y, 20, '#fbbf24');
    }
    
    playerRef.current.vx = vx;
    playerRef.current.vy = vy;
    
    // Debug
    setDebugInfo(`Launch: dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)}, vx=${vx.toFixed(1)}, vy=${vy.toFixed(1)}`);
    
    if (playerRef.current.vx < 2) playerRef.current.vx = 2;
    
    setGameState('FLYING');
  }, []);

  // Input Handlers
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState === 'FLYING') {
        // DIVE MECHANIC
        playerRef.current.vy += 15; // Smash down
        createParticles(playerRef.current.x, playerRef.current.y, 10, '#fff');
        setDiveEffect({ x: playerRef.current.x, y: playerRef.current.y, id: Date.now() });
        setTimeout(() => setDiveEffect(null), 500);
        return;
    }

    if (gameState !== 'AIMING') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    inputRef.current.isDragging = true;
    inputRef.current.startX = x;
    inputRef.current.startY = y;
    inputRef.current.currentX = x;
    inputRef.current.currentY = y;

    // Attach global listeners
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowMouseUp);
  };

  // Cleanup listeners on unmount
  useEffect(() => {
      return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
        window.removeEventListener('touchmove', handleWindowTouchMove);
        window.removeEventListener('touchend', handleWindowMouseUp);
      };
  }, [handleWindowMouseMove, handleWindowTouchMove, handleWindowMouseUp]);

  const createParticles = (x: number, y: number, count: number, color: string) => {
      for(let i=0; i<count; i++) {
          particlesRef.current.push({
              id: Math.random().toString(),
              x,
              y,
              vx: randomRange(-5, 5),
              vy: randomRange(-5, -1),
              life: 1,
              color,
              size: randomRange(2, 5)
          });
      }
  };

  const buyUpgrade = (type: keyof PlayerStats, cost: number, increment: number) => {
      if (stats.currency >= cost) {
          setStats(prev => ({ ...prev, currency: prev.currency - cost }));
          playerStatsRef.current = {
              ...playerStatsRef.current,
              [type]: playerStatsRef.current[type] + increment
          };
          forceUpdate(n => n + 1);
      }
  };

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center bg-slate-900 overflow-hidden">
      
      {/* Debug Overlay */}
      <div className="absolute bottom-4 left-4 text-xs text-slate-500 font-mono pointer-events-none z-50">
          <div>{debugInfo}</div>
          <div className="text-indigo-400">{liveDebug}</div>
          <div className="pointer-events-auto mt-2 flex gap-2">
            <button onClick={() => initSurface()} className="bg-slate-700 px-2 py-1 rounded text-white">Reset Targets</button>
            <button onClick={() => {
                const p = playerRef.current;
                surfaceRef.current.push(generateSurfaceNumber(p.x + 300, 1));
            }} className="bg-slate-700 px-2 py-1 rounded text-white">Spawn Target</button>
          </div>
      </div>

      {/* HUD */}
      <div className="absolute top-4 left-4 flex gap-4 text-white font-mono z-10 pointer-events-none select-none">
          <div className="bg-slate-800/80 backdrop-blur p-2 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400 tracking-wider">DISTANCE</div>
              <div className="text-xl font-bold">{stats.distance}m</div>
          </div>
          <div className="bg-slate-800/80 backdrop-blur p-2 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400 tracking-wider">SKIPS</div>
              <div className="text-xl font-bold">{stats.skips}</div>
          </div>
          <div className="bg-slate-800/80 backdrop-blur p-2 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400 tracking-wider">SCORE</div>
              <div className="text-xl font-bold">{stats.score}</div>
          </div>
          {stats.combo > 1 && (
            <div className="bg-indigo-600/90 backdrop-blur p-2 rounded border border-indigo-400 animate-pulse">
                <div className="text-[10px] text-indigo-200 tracking-wider">COMBO</div>
                <div className="text-xl font-bold text-white">x{stats.combo}</div>
            </div>
          )}
          <div className="bg-slate-800/80 backdrop-blur p-2 rounded border border-amber-500/50">
              <div className="text-[10px] text-amber-400 tracking-wider">CURRENCY</div>
              <div className="text-xl font-bold text-amber-300">${stats.currency}</div>
          </div>
      </div>

      {/* Speedometer / Danger Warning */}
      {gameState === 'FLYING' && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
            {/* Speed Bar */}
            <div className="w-64 h-4 bg-slate-900/80 rounded-full border border-slate-700 overflow-hidden relative">
                <div 
                    className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-100"
                    style={{ 
                        width: `${Math.min(100, (Math.sqrt(playerRef.current.vx**2 + playerRef.current.vy**2) / 30) * 100)}%` 
                    }}
                />
                {/* Threshold Marker */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/50 left-[16%]" /> 
            </div>
            
            {/* Text */}
            <div className="mt-2 font-mono font-bold text-sm text-white drop-shadow-md flex items-center gap-2">
                <span>SPEED</span>
                {Math.sqrt(playerRef.current.vx**2 + playerRef.current.vy**2) < 6 ? (
                    <span className="text-red-500 animate-pulse">⚠ SINK DANGER</span>
                ) : (
                    <span className="text-green-400">GOOD</span>
                )}
            </div>
        </div>
      )}

      {/* Reset Button */}
      <button 
        onClick={resetRun}
        className="absolute top-4 right-4 z-10 p-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-lg border border-slate-600 transition-colors shadow-lg"
        title="Reset Run"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
        </svg>
      </button>

      {/* Tutorial Overlay */}
      {gameState === 'AIMING' && showTutorial && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 flex flex-col items-center animate-pulse">
              <div className="text-white font-bold text-xl mb-2 drop-shadow-md bg-black/50 px-4 py-1 rounded text-center">
                  {stats.distance === 0 ? "PULL BACK TO LAUNCH" : "SHOOT AGAIN!"}
                  {stats.distance > 0 && <div className="text-xs font-normal text-emerald-300 mt-1">Safe Landing!</div>}
              </div>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-bounce drop-shadow-md">
                  <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
          </div>
      )}

      {/* Dive Effect */}
      {diveEffect && (
          <div 
            className="absolute text-white font-black text-2xl italic tracking-tighter animate-ping pointer-events-none"
            style={{ 
                left: diveEffect.x - cameraRef.current.x + (window.innerWidth/2 - 200), // Approximate screen pos correction if needed, but we are using canvas coords. 
                // Actually, we need to map canvas coords to screen coords for HTML overlay.
                // Simpler: Draw it in Canvas or just center it for now.
                // Let's just draw it in Canvas for accuracy.
            }}
          >
              DIVE!
          </div>
      )}

      {/* Rules Button */}
      <button 
        onClick={() => setShowRules(true)}
        className="absolute top-4 right-16 z-10 p-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-lg border border-slate-600 transition-colors shadow-lg"
        title="How to Play"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <path d="M12 17h.01"/>
        </svg>
      </button>

      {/* Rules Modal */}
      {showRules && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50" onClick={() => setShowRules(false)}>
              <div className="bg-slate-900 p-8 rounded-2xl border border-indigo-500/30 shadow-2xl max-w-2xl animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[80vh]" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-white">GAME GUIDE</h2>
                      <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-white">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300">
                      <div className="space-y-4">
                          <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-sm border-b border-slate-700 pb-2">Basics</h3>
                          
                          <div className="flex gap-3">
                              <div className="bg-indigo-900/50 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">LAUNCH</div>
                                  <div className="text-xs text-slate-400">Drag back and release. Angle matters! Low angle = speed. High angle = distance.</div>
                              </div>
                          </div>

                          <div className="flex gap-3">
                              <div className="bg-indigo-900/50 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">SKIP</div>
                                  <div className="text-xs text-slate-400">Hit targets to bounce and gain speed. Green targets give a BOOST. Avoid Red blocks early on!</div>
                              </div>
                          </div>

                          <div className="flex gap-3">
                              <div className="bg-indigo-900/50 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">DIVE</div>
                                  <div className="text-xs text-slate-400">Click mid-air to smash down. Use this to hit a target you might fly over.</div>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-sm border-b border-slate-700 pb-2">Advanced</h3>

                          <div className="flex gap-3">
                              <div className="bg-blue-900/30 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M2 12h20"/><path d="M2 16c5-5 15 5 20 0"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">WATER SKIMMING</div>
                                  <div className="text-xs text-slate-400">If your SPEED is high (Green Zone), you can skip on water! If you are too slow (Red Zone), you will sink.</div>
                              </div>
                          </div>

                          <div className="flex gap-3">
                              <div className="bg-emerald-900/30 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">REST & RELAUNCH</div>
                                  <div className="text-xs text-slate-400">If you land safely on a target and stop, you can shoot again from there!</div>
                              </div>
                          </div>

                          <div className="flex gap-3">
                              <div className="bg-amber-900/30 p-2 rounded h-fit shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">STRATEGY</div>
                                  <div className="text-xs text-slate-400">Upgrade <b>AERO</b> for distance, <b>BOUNCE</b> for speed retention. Use <b>MASS</b> to crush Red blocks.</div>
                              </div>
                          </div>
                      </div>
                  </div>

                  <button 
                      onClick={() => setShowRules(false)}
                      className="w-full mt-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors"
                  >
                      GOT IT
                  </button>
              </div>
          </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="bg-slate-950 rounded-xl shadow-2xl cursor-crosshair max-w-full touch-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      />

      {/* Main Menu */}
      {gameState === 'MENU' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="bg-slate-900 p-8 rounded-2xl border border-indigo-500/30 shadow-2xl text-center max-w-md animate-in fade-in zoom-in duration-300">
                  <h1 className="text-6xl font-black text-white mb-2 font-sans tracking-tighter italic transform -skew-x-6">
                      NUMBER<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">SKIPPER</span>
                  </h1>
                  <p className="text-slate-400 mb-8 text-lg">Drag, aim, and skip your way to infinity.</p>
                  <button 
                    onClick={resetRun}
                    className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:shadow-[0_0_30px_rgba(79,70,229,0.7)] hover:-translate-y-1"
                  >
                      START SKIPPING
                      <div className="absolute inset-0 rounded-xl ring-2 ring-white/20 group-hover:ring-white/40 transition-all" />
                  </button>
              </div>
          </div>
      )}

      {/* Game Over / Shop */}
      {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-3xl w-full animate-in fade-in slide-in-from-bottom-8 duration-300">
                  <div className="text-center mb-8">
                      <h2 className="text-3xl font-bold text-white mb-2">RUN COMPLETE</h2>
                      <p className="text-slate-400 mb-6">
                          {stats.distance < 50 ? "Too slow! Upgrade your POWER." : 
                           stats.skips < 5 ? "Aim for the numbers to keep going!" : 
                           "Great run! Buy upgrades to go further."}
                      </p>
                      <div className="flex justify-center gap-12 mt-6">
                          <div className="text-center">
                              <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Distance</div>
                              <div className="text-4xl font-mono font-bold text-white">{stats.distance}m</div>
                          </div>
                          <div className="text-center">
                              <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Total Skips</div>
                              <div className="text-4xl font-mono font-bold text-indigo-400">{stats.skips}</div>
                          </div>
                          <div className="text-center">
                              <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Earnings</div>
                              <div className="text-4xl font-mono font-bold text-amber-400">+${stats.score > 0 ? Math.floor(stats.score/100) : 0}</div>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <UpgradeCard 
                        title="MASS" 
                        desc="Increases impact force to crush numbers."
                        value={playerStatsRef.current.value} 
                        cost={Math.floor(playerStatsRef.current.value * 10)} 
                        canAfford={stats.currency >= Math.floor(playerStatsRef.current.value * 10)}
                        onBuy={() => buyUpgrade('value', Math.floor(playerStatsRef.current.value * 10), 5)}
                      />
                      <UpgradeCard 
                        title="AERO" 
                        desc="Reduces air resistance for longer flights."
                        value={Math.round(playerStatsRef.current.aerodynamics * 1000)} 
                        cost={500} 
                        canAfford={stats.currency >= 500 && playerStatsRef.current.aerodynamics < 0.999}
                        onBuy={() => buyUpgrade('aerodynamics', 500, 0.001)}
                        maxed={playerStatsRef.current.aerodynamics >= 0.999}
                      />
                      <UpgradeCard 
                        title="BOUNCE" 
                        desc="Retain more velocity after skipping."
                        value={Math.round(playerStatsRef.current.bounciness * 100)} 
                        cost={250} 
                        canAfford={stats.currency >= 250 && playerStatsRef.current.bounciness < 0.95}
                        onBuy={() => buyUpgrade('bounciness', 250, 0.05)}
                        maxed={playerStatsRef.current.bounciness >= 0.95}
                      />
                      <UpgradeCard 
                        title="POWER" 
                        desc="Maximum launch velocity."
                        value={playerStatsRef.current.maxPower} 
                        cost={Math.floor(playerStatsRef.current.maxPower * 5)} 
                        canAfford={stats.currency >= Math.floor(playerStatsRef.current.maxPower * 5)}
                        onBuy={() => buyUpgrade('maxPower', Math.floor(playerStatsRef.current.maxPower * 5), 2)}
                      />
                  </div>

                  <div className="flex justify-center">
                    <button 
                        onClick={resetRun}
                        className="px-12 py-4 bg-white text-slate-900 hover:bg-indigo-50 rounded-xl font-bold text-xl transition-colors shadow-lg"
                    >
                        PLAY AGAIN
                    </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

interface UpgradeCardProps {
    title: string;
    desc: string;
    value: number;
    cost: number;
    canAfford: boolean;
    onBuy: () => void;
    maxed?: boolean;
}

function UpgradeCard({ title, desc, value, cost, canAfford, onBuy, maxed = false }: UpgradeCardProps) {
    return (
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col justify-between group hover:border-slate-600 transition-colors">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-white font-mono">{title}</h3>
                    <span className="text-[10px] font-mono bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">LVL {value}</span>
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed h-10">{desc}</p>
            </div>
            <button 
                onClick={onBuy}
                disabled={!canAfford || maxed}
                className={`w-full py-3 rounded-lg font-bold text-sm flex justify-center items-center gap-2 transition-all
                    ${maxed 
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                        : canAfford 
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 active:scale-95' 
                            : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
                    }`}
            >
                {maxed ? 'MAXED' : <>{cost} <span className="text-amber-400">$</span></>}
            </button>
        </div>
    );
}
