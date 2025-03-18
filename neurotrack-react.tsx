import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCw, RotateCcw, Info } from 'lucide-react';

const NeuroTrackApp = () => {
  // Game state
  const [gameState, setGameState] = useState({
    trackType: 'circle',
    direction: 1, // 1 for clockwise, -1 for counter-clockwise
    level: 1,
    isRunning: false,
    sessionDuration: 30, // seconds
    trackSizePercent: 75, // Track size as percentage of available space
    cars: [], // Will be initialized in useEffect
    circleActive: false,
    reactionTimes: [],
    avgReactionTime: 0
  });

  // Additional state variables
  const [sessionTime, setSessionTime] = useState(0);
  const [timerDisplay, setTimerDisplay] = useState('00:30');
  const [progress, setProgress] = useState(0);
  const [currentReactionTime, setCurrentReactionTime] = useState(0);
  const [showReactionTimer, setShowReactionTimer] = useState(false);
  const [reactionTimerColor, setReactionTimerColor] = useState('rgba(255, 0, 0, 0.8)');
  const [countdown, setCountdown] = useState(null);

  // Refs
  const gameCanvasRef = useRef(null);
  const circlePreviewRef = useRef(null);
  const figure8PreviewRef = useRef(null);
  const zigzagPreviewRef = useRef(null);
  const spiralPreviewRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const trackDataRef = useRef({});
  const particlesRef = useRef([]);
  const nextCircleTimeRef = useRef(0);
  const circleStartTimeRef = useRef(0);

  // Colors
  const colors = {
    trackGradient: ['#5e60ce', '#6930c3', '#5390d9', '#64dfdf'],
    objectGradient: ['#80ffdb', '#72efdd', '#64dfdf'],
    particleColors: ['#80ffdb', '#72efdd', '#64dfdf', '#5390d9', '#6930c3']
  };

  // Initialize canvas and track data
  useEffect(() => {
    setupCanvas();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update preview canvases when track type changes
  useEffect(() => {
    drawTrackPreviews();
  }, [gameState.trackType]);

  // Effect for updating the session timer
  useEffect(() => {
    if (gameState.isRunning) {
      const remainingTime = gameState.sessionDuration - sessionTime;
      setTimerDisplay(formatTime(remainingTime));
      setProgress((sessionTime / gameState.sessionDuration) * 100);

      if (remainingTime <= 0) {
        completeSession();
      }
    }
  }, [sessionTime, gameState.isRunning, gameState.sessionDuration]);

  // Function to set up canvas dimensions and initialize track data
  const setupCanvas = () => {
    if (gameCanvasRef.current) {
      const canvas = gameCanvasRef.current;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      // Set preview canvas dimensions
      [circlePreviewRef, figure8PreviewRef, zigzagPreviewRef, spiralPreviewRef].forEach(ref => {
        if (ref.current) {
          const previewCanvas = ref.current;
          previewCanvas.width = 80;
          previewCanvas.height = 80;
        }
      });

      // Generate track data
      generateTrackData();
      
      // Draw game track and previews
      drawGameTrack();
      drawTrackPreviews();
      
      // Initialize cars
      initCars();
    }
  };

  // Function to generate track path data
  const generateTrackData = () => {
    if (!gameCanvasRef.current) return;

    const canvas = gameCanvasRef.current;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    // Calculate size factor based on track size percentage
    const sizeFactor = gameState.trackSizePercent / 100;
    const trackWidth = 100; // Width of the track in pixels

    // Circle track
    trackDataRef.current.circle = {
      radius: Math.min(canvasWidth, canvasHeight) * 0.38 * sizeFactor,
      centerX: centerX,
      centerY: centerY,
      getPosition: (t, laneOffset = 0) => {
        const angle = t * gameState.direction;
        // Adjust radius based on lane offset
        const adjustedRadius = trackDataRef.current.circle.radius + laneOffset;
        return {
          x: centerX + Math.cos(angle) * adjustedRadius,
          y: centerY + Math.sin(angle) * adjustedRadius
        };
      }
    };
    
    // Figure 8 track
    trackDataRef.current.figure8 = {
      width: canvasWidth * 0.7 * sizeFactor,
      height: canvasHeight * 0.5 * sizeFactor,
      centerX: centerX,
      centerY: centerY,
      getPosition: (t, laneOffset = 0) => {
        const angle = t * gameState.direction;
        
        const baseWidthMultiplier = 0.5 * (1 + (sizeFactor - 0.75) * 0.5);
        const baseHeightMultiplier = 0.4 * (1 + (sizeFactor - 0.75) * 0.5);
        
        const baseX = centerX + Math.sin(angle) * trackDataRef.current.figure8.width * baseWidthMultiplier;
        const baseY = centerY + Math.sin(angle * 2) * trackDataRef.current.figure8.height * baseHeightMultiplier;
        
        if (laneOffset === 0) {
          return { x: baseX, y: baseY };
        }
        
        const tangentX = Math.cos(angle) * trackDataRef.current.figure8.width * baseWidthMultiplier;
        const tangentY = 2 * Math.cos(angle * 2) * trackDataRef.current.figure8.height * baseHeightMultiplier;
        
        const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
        if (tangentLength === 0) return { x: baseX, y: baseY };
        
        const normalizedTangentX = tangentX / tangentLength;
        const normalizedTangentY = tangentY / tangentLength;
        
        const normalX = -normalizedTangentY;
        const normalY = normalizedTangentX;
        
        return {
          x: baseX + normalX * laneOffset,
          y: baseY + normalY * laneOffset
        };
      }
    };
    
    // Zigzag track
    trackDataRef.current.zigzag = {
      width: canvasWidth * 0.8 * sizeFactor,
      height: canvasHeight * 0.6 * sizeFactor,
      points: 6,
      centerX: centerX,
      centerY: centerY,
      getPosition: (t, laneOffset = 0) => {
        const modAngle = (t % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const finalAngle = gameState.direction === 1 ? modAngle : (2 * Math.PI - modAngle);

        const segmentT = (finalAngle / (2 * Math.PI)) * trackDataRef.current.zigzag.points;
        const segmentIndex = Math.floor(segmentT);
        const segmentProgress = segmentT - segmentIndex;
        
        const segmentWidth = trackDataRef.current.zigzag.width / (trackDataRef.current.zigzag.points - 1);
        const startX = centerX - trackDataRef.current.zigzag.width / 2 + segmentIndex * segmentWidth;
        const endX = startX + segmentWidth;
        
        const isVertical = segmentIndex % 2 === 0;
        const laneOffsetY = isVertical ? 0 : laneOffset;
        const laneOffsetX = isVertical ? laneOffset : 0;
        
        const startY = centerY + ((segmentIndex % 2 === 0) ? -1 : 1) * (trackDataRef.current.zigzag.height / 2);
        const endY = centerY + ((segmentIndex % 2 === 0) ? 1 : -1) * (trackDataRef.current.zigzag.height / 2);
        
        return {
          x: startX + (endX - startX) * segmentProgress + laneOffsetX,
          y: startY + (endY - startY) * segmentProgress + laneOffsetY
        };
      }
    };
    
    // Spiral track
    trackDataRef.current.spiral = {
      revolve: 0,
      centerX: centerX,
      centerY: centerY,
      getPosition: function(t, laneOffset = 0) {
        const baseRadius = Math.min(canvasWidth, canvasHeight) * 0.3 * sizeFactor;
        const modT = t % 1;
        const angle = 4 * Math.PI * t + this.revolve;
        const radius = baseRadius * modT;
        return {
          x: this.centerX + (radius + laneOffset) * Math.cos(angle),
          y: this.centerY + (radius + laneOffset) * Math.sin(angle)
        };
      }
    };
  };

  // Initialize cars with different colors and numbers
  const initCars = () => {
    const trackWidth = 100; // Width of the track in pixels
    const cars = [];
    
    // Car colors - different for each car
    const carColors = [
      ['#FF5252', '#FF1744', '#D50000'], // Red
      ['#80ffdb', '#72efdd', '#64dfdf'], // Original blue/teal
      ['#FFEB3B', '#FDD835', '#F9A825'], // Yellow
      ['#4CAF50', '#43A047', '#2E7D32'], // Green
      ['#9C27B0', '#8E24AA', '#6A1B9A']  // Purple
    ];
    
    // Car numbers
    const carNumbers = [1, 3, 5, 7, 9];
    
    // Create 5 cars with different positions, speeds, colors, and numbers
    for (let i = 0; i < 5; i++) {
      // Calculate lane offset for different track positions
      const laneOffset = -trackWidth/2 * 0.8 + (i * trackWidth/4 * 0.8);
      
      // Random speed multiplier between 0.7 and 1.3
      // Car #3 will always be at index 1 with a predictable speed
      const speedMultiplier = (i === 1) ? 1.0 : 0.7 + Math.random() * 0.6;
      
      cars.push({
        number: carNumbers[i],
        colors: carColors[i],
        laneOffset: laneOffset,
        speedMultiplier: speedMultiplier,
        position: { x: 0, y: 0 },
        prevPosition: null,
        isMainCar: i === 1, // Car #3 is the main car to track
        travelt: 0.2 * i
      });
    }
    
    setGameState(prev => ({...prev, cars}));
  };

  // Create particle effect
  const createParticle = (x, y) => {
    return {
      x,
      y,
      size: 2 + Math.random() * 3,
      speedX: (Math.random() - 0.5) * 2,
      speedY: (Math.random() - 0.5) * 2,
      color: colors.particleColors[Math.floor(Math.random() * colors.particleColors.length)],
      life: 30 + Math.random() * 20
    };
  };

  // Update particles
  const updateParticles = () => {
    const particles = [...particlesRef.current];
    
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.speedX;
      p.y += p.speedY;
      p.life--;
      
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
    
    // Add new particles at the object position
    if (gameState.isRunning && Math.random() > 0.7 && gameState.cars.length > 0) {
      particles.push(createParticle(
        gameState.cars[1].position.x,
        gameState.cars[1].position.y
      ));
    }
    
    particlesRef.current = particles;
  };

  // Draw particles
  const drawParticles = (ctx) => {
    for (const p of particlesRef.current) {
      ctx.globalAlpha = p.life / 50;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Draw racing car
  const drawRacingCar = (ctx, x, y, size, angle, carConfig) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    const carColors = carConfig.colors || colors.objectGradient;
    const number = carConfig.number || 3;
    const isMainCar = carConfig.isMainCar;
    
    // Draw car body (pointed shape)
    ctx.beginPath();
    ctx.moveTo(size, 0); // Front of car
    ctx.lineTo(size * 0.5, -size * 0.6); // Top right
    ctx.lineTo(-size * 0.7, -size * 0.6); // Top left
    ctx.lineTo(-size, 0); // Rear
    ctx.lineTo(-size * 0.7, size * 0.6); // Bottom left
    ctx.lineTo(size * 0.5, size * 0.6); // Bottom right
    ctx.closePath();
    
    // Add gradient to car body
    const carGradient = ctx.createLinearGradient(-size, 0, size, 0);
    carGradient.addColorStop(0, carColors[2]);
    carGradient.addColorStop(0.5, carColors[0]);
    carGradient.addColorStop(1, carColors[1]);
    ctx.fillStyle = carGradient;
    
    // Add glow effect to the main car to help track it
    if (isMainCar) {
      ctx.shadowColor = carColors[0];
      ctx.shadowBlur = 15;
    }
    
    ctx.fill();
    
    // Draw wheels
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#333';
    // Front-left wheel
    ctx.beginPath();
    ctx.ellipse(size * 0.5, -size * 0.7, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Front-right wheel
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.7, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rear-left wheel
    ctx.beginPath();
    ctx.ellipse(-size * 0.5, -size * 0.7, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rear-right wheel
    ctx.beginPath();
    ctx.ellipse(-size * 0.5, size * 0.7, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Add cockpit
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.ellipse(size * 0.1, 0, size * 0.3, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Add number
    ctx.fillStyle = '#333';
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), size * 0.1, 0);
    
    // Add highlight for main car to track
    if (isMainCar) {
      ctx.lineWidth = size * 0.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(size * 0.1, 0, size * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw the random circle around car #3 if active
    if (carConfig.isMainCar && gameState.circleActive) {
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.0, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.restore();
  };

  // Draw main game track
  const drawGameTrack = () => {
    if (!gameCanvasRef.current) return;
    
    const canvas = gameCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const trackWidth = 100; // Width of the track in pixels
    
    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#f0f4fd');
    bgGradient.addColorStop(1, '#e6e9f0');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Draw track based on selected type
    const trackGradient = ctx.createLinearGradient(0, 0, width, height);
    for (let i = 0; i < colors.trackGradient.length; i++) {
      trackGradient.addColorStop(i / (colors.trackGradient.length - 1), colors.trackGradient[i]);
    }
    ctx.strokeStyle = trackGradient;
    ctx.lineWidth = trackWidth;
    
    const currentTrack = trackDataRef.current[gameState.trackType];
    if (!currentTrack) return;
    
    if (gameState.trackType === 'circle') {
      // Draw glow effect
      ctx.save();
      ctx.shadowColor = 'rgba(94, 96, 206, 0.3)';
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      ctx.arc(currentTrack.centerX, currentTrack.centerY, currentTrack.radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
      
      // Draw inner thinner track for visual effect
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(currentTrack.centerX, currentTrack.centerY, currentTrack.radius - trackWidth/2 + 5, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Draw outer thinner track for visual effect
      ctx.beginPath();
      ctx.arc(currentTrack.centerX, currentTrack.centerY, currentTrack.radius + trackWidth/2 - 5, 0, 2 * Math.PI);
      ctx.stroke();
    } 
    else if (gameState.trackType === 'figure8') {
      // Draw glow effect
      ctx.save();
      ctx.shadowColor = 'rgba(94, 96, 206, 0.3)';
      ctx.shadowBlur = 15;
      
      // Draw the main track with proper width
      ctx.lineWidth = trackWidth;
      ctx.beginPath();
      
      // Draw the center of the track
      for (let t = 0; t <= 2 * Math.PI; t += 0.05) {
        const pos = currentTrack.getPosition(t, 0);
        if (t === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();
      ctx.restore();
      
      // Draw inner and outer track borders for visual clarity
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      
      // Draw inner border
      ctx.beginPath();
      for (let t = 0; t <= 2 * Math.PI; t += 0.05) {
        const pos = currentTrack.getPosition(t, -trackWidth/2 + 5);
        if (t === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();
      
      // Draw outer border
      ctx.beginPath();
      for (let t = 0; t <= 2 * Math.PI; t += 0.05) {
        const pos = currentTrack.getPosition(t, trackWidth/2 - 5);
        if (t === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();
    }
    else if (gameState.trackType === 'zigzag') {
      // Draw glow effect
      ctx.save();
      ctx.shadowColor = 'rgba(94, 96, 206, 0.3)';
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      for (let i = 0; i < currentTrack.points; i++) {
        const x = currentTrack.centerX - currentTrack.width / 2 + (currentTrack.width / (currentTrack.points - 1)) * i;
        const y = currentTrack.centerY + ((i % 2 === 0) ? -1 : 1) * (currentTrack.height / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
      
      // Draw inner thinner track for visual effect
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < currentTrack.points; i++) {
        const x = currentTrack.centerX - currentTrack.width / 2 + (currentTrack.width / (currentTrack.points - 1)) * i;
        const y = currentTrack.centerY + ((i % 2 === 0) ? -1 : 1) * (currentTrack.height / 2 - 3);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    else if (gameState.trackType === 'spiral') {
      ctx.save();
      ctx.shadowColor = 'rgba(94, 96, 206, 0.3)';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const tStep = i / steps;
        const pos = currentTrack.getPosition(tStep, 0);
        if (i === 0) ctx.moveTo(pos.x, pos.y);
        else ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
      ctx.restore();
    }
    
    // Update and draw particles
    updateParticles();
    drawParticles(ctx);
    
    // Draw all cars
    if (gameState.isRunning && gameState.cars.length > 0) {
      gameState.cars.forEach(car => {
        const pos = car.position;
        const objSize = 14;
        
        // Calculate angle based on movement direction
        let angle = 0;
        if (car.prevPosition) {
          const dx = pos.x - car.prevPosition.x;
          const dy = pos.y - car.prevPosition.y;
          if (dx !== 0 || dy !== 0) {
            angle = Math.atan2(dy, dx);
          }
        }
        
        // Draw the racing car
        drawRacingCar(ctx, pos.x, pos.y, objSize, angle, car);
      });
    }
  };

  // Draw track preview
  const drawTrackPreview = (ctx, trackType) => {
    if (!ctx) return;
    
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Create gradient for track
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.trackGradient[0]);
    gradient.addColorStop(1, colors.trackGradient[3]);
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    
    if (trackType === 'circle') {
      const radius = width * 0.35;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } 
    else if (trackType === 'figure8') {
      ctx.beginPath();
      for (let t = 0; t <= 2 * Math.PI; t += 0.1) {
        const x = centerX + Math.sin(t) * width * 0.4;
        const y = centerY + Math.sin(t * 2) * height * 0.3;
        if (t === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } 
    else if (trackType === 'zigzag') {
      const zigWidth = width * 0.8;
      const zigHeight = height * 0.6;
      const points = 4;
      
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = centerX - zigWidth / 2 + (zigWidth / (points - 1)) * i;
        const y = centerY + ((i % 2 === 0) ? -1 : 1) * (zigHeight / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } 
    else if (trackType === 'spiral') {
      ctx.beginPath();
      let steps = 50;
      for (let i = 0; i <= steps; i++) {
        const tStep = i / steps;
        const angle = 2 * Math.PI * 2 * tStep;
        const r = (width * 0.3) * tStep;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    // Draw a small racing car representing the moving target
    const previewX = centerX;
    const previewY = centerY - width * 0.25;
    const carSize = 4;
    const carAngle = Math.PI / 2; // Pointing upward
    
    // Draw car #3 as the main car in the preview
    drawRacingCar(ctx, previewX, previewY, carSize, carAngle, {
      colors: ['#80ffdb', '#72efdd', '#64dfdf'],
      number: 3,
      isMainCar: true
    });
  };

  // Draw all track previews
  const drawTrackPreviews = () => {
    if (circlePreviewRef.current) {
      drawTrackPreview(circlePreviewRef.current.getContext('2d'), 'circle');
    }
    if (figure8PreviewRef.current) {
      drawTrackPreview(figure8PreviewRef.current.getContext('2d'), 'figure8');
    }
    if (zigzagPreviewRef.current) {
      drawTrackPreview(zigzagPreviewRef.current.getContext('2d'), 'zigzag');
    }
    if (spiralPreviewRef.current) {
      drawTrackPreview(spiralPreviewRef.current.getContext('2d'), 'spiral');
    }
  };

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle track option click
  const handleTrackOptionClick = (trackType) => {
    setGameState(prev => ({...prev, trackType}));
  };

  // Handle direction button click
  const handleDirectionButtonClick = () => {
    setGameState(prev => ({...prev, direction: prev.direction * -1}));
  };

  // Handle level button click
  const handleLevelButtonClick = (level) => {
    setGameState(prev => {
      const newState = {...prev, level};
      
      // Update speed if the game is running
      if (prev.isRunning) {
        // This would need to be done in the game loop as well
      }
      
      return newState;
    });
  };

  // Handle session button click
  const handleSessionButtonClick = (duration) => {
    setGameState(prev => ({...prev, sessionDuration: duration}));
    setTimerDisplay(formatTime(duration));
  };

  // Handle track size slider change
  const handleTrackSizeChange = (e) => {
    const size = parseInt(e.target.value);
    setGameState(prev => ({...prev, trackSizePercent: size}));
    generateTrackData();
    drawGameTrack();
  };

  // Show random circle around car #3
  const showRandomCircle = () => {
    setGameState(prev => ({...prev, circleActive: true}));
    circleStartTimeRef.current = performance.now();
    setCurrentReactionTime(0);
    setShowReactionTimer(true);
  };

  // Hide circle and schedule next appearance
  const hideCircle = () => {
    if (gameState.circleActive) {
      const reactionTime = (performance.now() - circleStartTimeRef.current) / 1000;
      const updatedReactionTimes = [...gameState.reactionTimes, reactionTime];
      
      setCurrentReactionTime(reactionTime);
      
      // Change color based on reaction time
      let color = 'rgba(255, 0, 0, 0.8)'; // Default red
      if (reactionTime < 0.5) {
        color = 'rgba(76, 175, 80, 0.8)'; // Green for fast
      } else if (reactionTime < 1.0) {
        color = 'rgba(255, 193, 7, 0.8)'; // Yellow for medium
      }
      setReactionTimerColor(color);
      
      // Calculate average reaction time
      let avgTime = 0;
      if (updatedReactionTimes.length > 0) {
        const sum = updatedReactionTimes.reduce((a, b) => a + b, 0);
        avgTime = sum / updatedReactionTimes.length;
      }
      
      setGameState(prev => ({
        ...prev, 
        circleActive: false,
        reactionTimes: updatedReactionTimes,
        avgReactionTime: avgTime
      }));
      
      // Schedule next circle appearance (random between 3-9 seconds)
      const nextDelay = 3000 + Math.random() * 6000;
      nextCircleTimeRef.current = performance.now() + nextDelay;
      
      // Hide reaction timer after 1.5 seconds
      setTimeout(() => {
        setShowReactionTimer(false);
        setReactionTimerColor('rgba(255, 0, 0, 0.8)'); // Reset color
      }, 1500);
    }
  };

  // Start game animation loop
  const startGameLoop = () => {
    const gameLoop = (timestamp) => {
      if (!lastTimestampRef.current) {
        lastTimestampRef.current = timestamp;
      }
      
      const deltaTime = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      
      if (gameState.isRunning) {
        // Update session time
        setSessionTime(prev => {
          const newTime = prev + deltaTime * 0.001;
          return newTime;
        });
        
        const speed = 0.2 * gameState.level;
        
        // Update all cars
        const track = trackDataRef.current[gameState.trackType];
        if (track) {
          setGameState(prev => {
            const updatedCars = prev.cars.map(car => {
              // Store previous position for angle calculation
              const prevPosition = { ...car.position };
              
              // Increment the car's travel parameter over time using the game's speed and car's speed multiplier
              const travelt = car.travelt + (speed * car.speedMultiplier) * (deltaTime * 0.001);
              
              // Update position based on track type and lane offset
              const position = track.getPosition(travelt, car.laneOffset);
              
              return {
                ...car,
                travelt,
                prevPosition,
                position
              };
            });
            
            return { ...prev, cars: updatedCars };
          });
        }
        
        // Check if it's time to show the random circle
        if (!gameState.circleActive && timestamp >= nextCircleTimeRef.current) {
          showRandomCircle();
        }
        
        // Draw game
        drawGameTrack();
        
        // Continue animation
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  // Start game
  const startGame = () => {
    if (gameState.isRunning) return;
    
    // Reset time
    setSessionTime(0);
    lastTimestampRef.current = null;
    
    // Set initial positions for all cars
    const track = trackDataRef.current[gameState.trackType];
    const updatedCars = gameState.cars.map((car, index) => {
      // Stagger starting positions slightly
      const staggerAngle = (index / gameState.cars.length) * Math.PI * 0.5;
      const position = track.getPosition(staggerAngle, car.laneOffset);
      return {
        ...car,
        position,
        travelt: staggerAngle
      };
    });
    
    setGameState(prev => ({
      ...prev,
      isRunning: true,
      cars: updatedCars,
      circleActive: false,
      reactionTimes: []
    }));
    
    // Schedule first circle to appear between 3-9 seconds from start
    const firstDelay = 3000 + Math.random() * 6000;
    nextCircleTimeRef.current = performance.now() + firstDelay;
    
    // Start animation
    startGameLoop();
  };

  // Stop game
  const stopGame = () => {
    setGameState(prev => ({...prev, isRunning: false}));
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Reset session time
    setProgress(0);
    
    // Reset circle state
    setGameState(prev => ({...prev, circleActive: false}));
    
    // Hide reaction timer
    setShowReactionTimer(false);
  };

  // Complete session
  const completeSession = () => {
    stopGame();
    
    // Show completion effect
    showCompletionEffect();
  };

  // Show completion effect
  const showCompletionEffect = () => {
    // Generate celebratory particles
    const particles = [];
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * gameCanvasRef.current.width;
      const y = Math.random() * gameCanvasRef.current.height;
      particles.push(createParticle(x, y));
    }
    particlesRef.current = particles;
    
    // Animation to fade out particles
    const fadeOutParticles = () => {
      if (particlesRef.current.length > 0) {
        updateParticles();
        drawGameTrack();
        requestAnimationFrame(fadeOutParticles);
      }
    };
    
    fadeOutParticles();
  };

  // Handle start button click
  const handleStartButtonClick = () => {
    if (gameState.isRunning) {
      stopGame();
    } else {
      initiateRaceStart();
    }
  };

  // Race start sequence with countdown
  const initiateRaceStart = () => {
    // Start countdown
    setCountdown(3);
    
    // Countdown timer
    const countdownTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          setTimeout(() => {
            setCountdown(null);
            startGame();
          }, 500);
          return "GO!";
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle canvas click (for reaction test)
  const handleCanvasClick = () => {
    if (gameState.isRunning && gameState.circleActive) {
      hideCircle();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-400">
          NeuroTrack Vision Therapy
        </h1>
        <p className="text-gray-600 text-lg mt-2">
          Advanced visual tracking exercise for improved neural processing
        </p>
      </div>
      
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Track Selector */}
        <div className="flex justify-between flex-wrap p-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
          <div 
            className={`w-24 h-24 rounded-xl shadow-md cursor-pointer transition-all flex flex-col items-center justify-center overflow-hidden m-2 ${gameState.trackType === 'circle' ? 'border-3 border-indigo-600 transform -translate-y-1' : ''}`}
            onClick={() => handleTrackOptionClick('circle')}
          >
            <canvas ref={circlePreviewRef} width="80" height="80"></canvas>
            <div className="mt-1 text-xs font-semibold text-indigo-600">Circle</div>
          </div>
          
          <div 
            className={`w-24 h-24 rounded-xl shadow-md cursor-pointer transition-all flex flex-col items-center justify-center overflow-hidden m-2 ${gameState.trackType === 'figure8' ? 'border-3 border-indigo-600 transform -translate-y-1' : ''}`}
            onClick={() => handleTrackOptionClick('figure8')}
          >
            <canvas ref={figure8PreviewRef} width="80" height="80"></canvas>
            <div className="mt-1 text-xs font-semibold text-indigo-600">Figure 8</div>
          </div>
          
          <div 
            className={`w-24 h-24 rounded-xl shadow-md cursor-pointer transition-all flex flex-col items-center justify-center overflow-hidden m-2 ${gameState.trackType === 'zigzag' ? 'border-3 border-indigo-600 transform -translate-y-1' : ''}`}
            onClick={() => handleTrackOptionClick('zigzag')}
          >
            <canvas ref={zigzagPreviewRef} width="80" height="80"></canvas>
            <div className="mt-1 text-xs font-semibold text-indigo-600">Zigzag</div>
          </div>
          
          <div 
            className={`w-24 h-24 rounded-xl shadow-md cursor-pointer transition-all flex flex-col items-center justify-center overflow-hidden m-2 ${gameState.trackType === 'spiral' ? 'border-3 border-indigo-600 transform -translate-y-1' : ''}`}
            onClick={() => handleTrackOptionClick('spiral')}
          >
            <canvas ref={spiralPreviewRef} width="80" height="80"></canvas>
            <div className="mt-1 text-xs font-semibold text-indigo-600">Spiral</div>
          </div>
        </div>
        
        {/* Controls Panel */}
        <div className="flex flex-wrap justify-between items-center p-5 bg-white">
          {/* Direction Control */}
          <div className="flex items-center m-2">
            <span className="font-semibold mr-3 text-gray-800">Direction:</span>
            <button 
              className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 text-white flex justify-center items-center shadow-md transition-all hover:scale-110"
              onClick={handleDirectionButtonClick}
            >
              {gameState.direction > 0 ? <RotateCw size={20} /> : <RotateCcw size={20} />}
            </button>
          </div>
          
          {/* Speed Level Control */}
          <div className="flex items-center m-2">
            <span className="font-semibold mr-3 text-gray-800">Speed Level:</span>
            <div className="flex bg-gray-100 rounded-xl p-1 shadow-inner">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  className={`w-10 h-10 rounded-lg border-none font-semibold flex justify-center items-center transition-all ${gameState.level === level ? 'bg-white text-indigo-600 shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => handleLevelButtonClick(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          
          {/* Session Duration Control */}
          <div className="flex items-center m-2">
            <span className="font-semibold mr-3 text-gray-800">Session:</span>
            <div className="flex bg-gray-100 rounded-xl p-1 shadow-inner">
              {[
                { value: 30, label: '30s' },
                { value: 60, label: '60s' },
                { value: 120, label: '2m' }
              ].map((session) => (
                <button
                  key={session.value}
                  className={`px-3 h-10 rounded-lg border-none font-semibold flex justify-center items-center transition-all ${gameState.sessionDuration === session.value ? 'bg-white text-indigo-600 shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => handleSessionButtonClick(session.value)}
                >
                  {session.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Track Size Control */}
          <div className="flex items-center m-2 w-full mt-4">
            <span className="font-semibold mr-3 text-gray-800">Track Size:</span>
            <div className="flex items-center flex-1">
              <input
                type="range"
                min="40"
                max="95"
                value={gameState.trackSizePercent}
                onChange={handleTrackSizeChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-semibold ml-3 text-indigo-600 w-12 text-center">
                {gameState.trackSizePercent}%
              </span>
            </div>
          </div>
        </div>
        
        {/* Game Canvas Container */}
        <div className="relative w-full h-[600px] bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
          <canvas 
            ref={gameCanvasRef} 
            className="w-full h-full block"
            onClick={handleCanvasClick}
          ></canvas>
          
          {gameState.isRunning && (
            <div className="absolute top-5 right-5 bg-white/80 py-2 px-5 rounded-full font-semibold shadow-md">
              {timerDisplay}
            </div>
          )}
          
          {showReactionTimer && (
            <div 
              className="absolute top-20 right-5 py-2 px-4 rounded-full font-semibold shadow-md" 
              style={{ backgroundColor: reactionTimerColor, color: 'white' }}
            >
              {currentReactionTime.toFixed(2)}s
            </div>
          )}
          
          {gameState.isRunning && (
            <div 
              className="absolute bottom-0 left-0 h-1 bg-cyan-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          )}
          
          {gameState.isRunning && (
            <div className="absolute top-5 left-5 bg-white/80 p-4 rounded-xl shadow-md text-sm">
              <div className="mb-1"><span className="font-semibold text-indigo-600">Track:</span> {gameState.trackType.charAt(0).toUpperCase() + gameState.trackType.slice(1)}</div>
              <div className="mb-1"><span className="font-semibold text-indigo-600">Speed:</span> Level {gameState.level}</div>
              <div><span className="font-semibold text-indigo-600">Direction:</span> {gameState.direction > 0 ? 'Clockwise' : 'Counter-Clockwise'}</div>
            </div>
          )}
          
          {countdown !== null && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-8xl font-bold text-indigo-600/80 shadow-text">
              {countdown}
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-center mt-8">
        <button
          className={`py-3 px-8 rounded-full text-lg font-semibold shadow-lg transition-all flex items-center ${gameState.isRunning ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:translate-y-1 text-white'}`}
          onClick={handleStartButtonClick}
        >
          {gameState.isRunning ? (
            <>
              <span className="mr-2">Stop Session</span>
            </>
          ) : (
            <>
              <Play className="mr-2" size={20} />
              <span>Start Session</span>
            </>
          )}
        </button>
      </div>
      
      {/* Instructions Card */}
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mt-8">
        <div className="flex items-center mb-4 text-indigo-600">
          <Info className="mr-2" size={24} />
          <h3 className="text-xl font-semibold">How to Use</h3>
        </div>
        
        <div className="text-gray-700">
          {[
            "Select a track pattern based on your therapy needs (Circle, Figure-8, Zigzag, or Spiral)",
            "Choose direction (clockwise or counter-clockwise) and adjust the speed level to match your ability",
            "Select a session duration that works for you",
            "Focus only on car #3 (highlighted with a glow) as it moves around the track. Try to ignore the other cars.",
            "Follow car #3 with your eyes only - try not to move your head. This increases the challenge and effectiveness."
          ].map((step, index) => (
            <div key={index} className="flex my-4 items-start">
              <div className="bg-indigo-600 text-white w-6 h-6 rounded-full flex justify-center items-center flex-shrink-0 mr-3">
                {index + 1}
              </div>
              <div className="flex-grow">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NeuroTrackApp;
