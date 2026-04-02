// utils/gcodeGenerator.js

import { normalizeColor, getStrokeColor } from './svgProcessing';
import { 
    PLOTTER_MIN_X, 
    PLOTTER_MAX_X, 
    PLOTTER_MIN_Y, 
    PLOTTER_MAX_Y, 
    PLOTTER_WIDTH, 
    PLOTTER_HEIGHT 
  } from '../constants/plotterConfig';

/**
 * Transforme des coordonnées SVG en coordonnées plotter
 */
export function transformCoord({ x, y, scale, drawingArea, svgViewBox, paperConfig, machineConfig }) {
  const scaledX = (x - svgViewBox.minX) * scale;
  const scaledY = (y - svgViewBox.minY) * scale;
  
  const paperOffsetX = -paperConfig.width / 2;
  const paperOffsetY = -paperConfig.height / 2;
  
  const xInPaper = paperOffsetX + paperConfig.marginLeft + 
    (drawingArea.width - svgViewBox.width * scale) / 2 + scaledX;
  const yInPaper = paperOffsetY + paperConfig.marginTop + 
    (drawingArea.height - svgViewBox.height * scale) / 2 + scaledY;

  const machineRatioX = machineConfig.width / PLOTTER_WIDTH;
  const machineRatioY = machineConfig.height / PLOTTER_HEIGHT;

  return {
    x: xInPaper / (machineConfig.width / machineRatioX) * PLOTTER_WIDTH,
    y: -yInPaper / (machineConfig.height / machineRatioY) * PLOTTER_HEIGHT
  };
}

/**
 * Simplifie une série de points en éliminant ceux trop proches
 */
export function simplifyPoints(points, minDistance) {
  if (points.length < 2 || minDistance <= 0) return points;
  
  const simplified = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const last = simplified[simplified.length - 1];
    const current = points[i];
    const dist = Math.hypot(current.x - last.x, current.y - last.y);
    
    if (dist >= minDistance) {
      simplified.push(current);
    }
  }
  
  if (simplified[simplified.length - 1] !== points[points.length - 1]) {
    simplified.push(points[points.length - 1]);
  }
  
  return simplified;
}

/**
 * Calcule le temps estimé pour exécuter un GCode
 * 
 * MODIF: accepte maintenant travelSpeedMmMin ET drawSpeedMmMin
 * pour refléter la séparation des vitesses travel/draw
 */
export function calculateDrawTime(gcodeContent, travelSpeedMmMin, drawSpeedMmMin, penUpDelay = 80, penDownDelay = 60) {
  // Si drawSpeedMmMin n'est pas fourni, on utilise travelSpeedMmMin (rétrocompat)
  const travelMmPerSec = travelSpeedMmMin / 60;
  const drawMmPerSec = (drawSpeedMmMin || travelSpeedMmMin) / 60;
  
  let travelDistance = 0;
  let drawDistance = 0;
  let lastX = 0, lastY = 0;
  let isPenDown = false;
  let penUpDownCount = 0;
  let commandCount = 0;
  
  const penMoveTime = (penUpDelay + penDownDelay + 60) / 1000; // secondes par cycle pen up/down
  const firmwareLat = 20 / 1000; // secondes de latence firmware par commande
  const acceleration = 800; // mm/s²
  
  const calculateTimeWithAcceleration = (distance, speedMmPerSec) => {
    if (distance < 1) {
      return distance / (speedMmPerSec * 0.5);
    }
    
    const accelerationDistance = (speedMmPerSec * speedMmPerSec) / (2 * acceleration);
    
    if (distance > 2 * accelerationDistance) {
      const accelerationTime = speedMmPerSec / acceleration;
      const constantSpeedTime = (distance - 2 * accelerationDistance) / speedMmPerSec;
      return 2 * accelerationTime + constantSpeedTime;
    } else {
      return 2 * Math.sqrt(distance / acceleration);
    }
  };
  
  const lines = gcodeContent.split('\n');
  let segments = [];
  
  for (const line of lines) {
    if (line.includes('M280 P0 S90')) {
      commandCount++;
      if (isPenDown) {
        isPenDown = false;
        penUpDownCount++;
      }
      continue;
    } else if (line.includes('M280 P0 S25')) {
      commandCount++;
      if (!isPenDown) {
        isPenDown = true;
        penUpDownCount++;
      }
      continue;
    }

    if (line.startsWith('G0') || line.startsWith('G1')) {
      commandCount++;
      const xMatch = line.match(/X(-?\d+\.?\d*)/);
      const yMatch = line.match(/Y(-?\d+\.?\d*)/);
      
      if (xMatch && yMatch) {
        const x = parseFloat(xMatch[1]);
        const y = parseFloat(yMatch[1]);
        
        const distance = Math.sqrt(Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2));
        
        if (distance > 0) {
          const isTravel = line.startsWith('G0') || !isPenDown;
          segments.push({ distance, isTravel });
          
          if (isTravel) {
            travelDistance += distance;
          } else {
            drawDistance += distance;
          }
        }
        
        lastX = x;
        lastY = y;
      }
    }
  }
  
  let travelTime = 0;
  let drawTime = 0;
  
  for (const segment of segments) {
    // MODIF: vitesse différenciée travel vs draw
    const speed = segment.isTravel ? travelMmPerSec : drawMmPerSec;
    const segmentTime = calculateTimeWithAcceleration(segment.distance, speed);
    if (segment.isTravel) {
      travelTime += segmentTime;
    } else {
      drawTime += segmentTime;
    }
  }
  
  const penOperationTime = penUpDownCount * penMoveTime;
  const firmwareLatencyTime = commandCount * firmwareLat;

  const userPauses = gcodeContent.match(/M0/g);
  const userPauseCount = userPauses ? userPauses.length : 0;
  const userPauseTime = userPauseCount > 0 ? 30 : 0;

  const totalTimeSeconds = Math.ceil(travelTime + drawTime + penOperationTime + firmwareLatencyTime + userPauseTime);
  
  const hours = Math.floor(totalTimeSeconds / 3600);
  const minutes = Math.floor((totalTimeSeconds % 3600) / 60);
  const seconds = Math.floor(totalTimeSeconds % 60);
  
  return {
    totalTimeSeconds,
    formattedTime: `${hours > 0 ? hours + 'h ' : ''}${minutes}min ${seconds}s`,
    details: {
      travelDistance: travelDistance.toFixed(2) + ' mm',
      drawDistance: drawDistance.toFixed(2) + ' mm',
      travelTime: (travelTime / 60).toFixed(2) + ' min',
      drawTime: (drawTime / 60).toFixed(2) + ' min',
      penOperations: penUpDownCount,
      penOperationTime: (penOperationTime / 60).toFixed(2) + ' min',
      userPauses: userPauseCount
    }
  };
}

/**
 * Inverse la direction d'un path
 */
export function reversePathDirection(path) {
  const d = path.getAttribute('d');
  const commands = d
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?=[ML])/);
  
  const points = [];
  commands.forEach(cmd => {
    const type = cmd.trim()[0];
    const coords = cmd.slice(1).trim().split(/\s+/).map(Number);
    
    for (let i = 0; i < coords.length; i += 2) {
      if (i + 1 < coords.length) {
        points.push({ x: coords[i], y: coords[i + 1] });
      }
    }
  });
  
  points.reverse();
  
  let newD = '';
  if (points.length > 0) {
    newD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      newD += ` L ${points[i].x} ${points[i].y}`;
    }
  }
  
  const newPath = path.cloneNode(true);
  newPath.setAttribute('d', newD);
  
  return newPath;
}

/**
 * Optimise l'ordre des paths pour minimiser les déplacements
 */
export function optimizePathOrder(paths, scale, drawingArea, svgViewBox, paperConfig, machineConfig) {
  if (paths.length <= 1) return paths;
  
  const getFirstPoint = (path) => {
    const d = path.getAttribute('d');
    const match = d.match(/M\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
    if (match) {
      return transformCoord({
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        scale,
        drawingArea,
        svgViewBox,
        paperConfig,
        machineConfig
      });
    }
    return { x: 0, y: 0 };
  };
  
  const getLastPoint = (path) => {
    const d = path.getAttribute('d');
    const coords = d
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?=[ML])/);
    
    const lastCmd = coords[coords.length - 1];
    const numbers = lastCmd.slice(1).trim().split(/\s+/).map(Number);
    
    if (numbers.length >= 2) {
      const x = numbers[numbers.length - 2];
      const y = numbers[numbers.length - 1];
      return transformCoord({
        x,
        y,
        scale,
        drawingArea,
        svgViewBox,
        paperConfig,
        machineConfig
      });
    }
    return { x: 0, y: 0 };
  };
  
  const distance = (p1, p2) => {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  };
  
  const pathsWithPoints = paths.map(path => ({
    path,
    start: getFirstPoint(path),
    end: getLastPoint(path)
  }));
  
  const optimized = [];
  const remaining = [...pathsWithPoints];
  
  let currentPos = { x: 0, y: 0 };
  
  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIndex = 0;
    let shouldReverse = false;
    
    for (let i = 0; i < remaining.length; i++) {
      const pathInfo = remaining[i];
      
      const distToStart = distance(currentPos, pathInfo.start);
      if (distToStart < minDist) {
        minDist = distToStart;
        minIndex = i;
        shouldReverse = false;
      }
      
      const distToEnd = distance(currentPos, pathInfo.end);
      if (distToEnd < minDist) {
        minDist = distToEnd;
        minIndex = i;
        shouldReverse = true;
      }
    }
    
    const chosen = remaining.splice(minIndex, 1)[0];
    
    if (shouldReverse) {
      const reversedPath = reversePathDirection(chosen.path);
      optimized.push(reversedPath);
      currentPos = chosen.start;
    } else {
      optimized.push(chosen.path);
      currentPos = chosen.end;
    }
  }
  
  return optimized;
}

/**
 * Génère le GCode à partir d'un SVG
 * 
 * speedSettings attend maintenant :
 *   - travelSpeed : vitesse de déplacement stylo levé (mm/s)
 *   - drawSpeed   : vitesse de tracé stylo baissé (mm/s)
 *   - penUpDelay   : délai après levée stylo en ms (défaut: 80)
 *   - penDownDelay : délai après descente stylo en ms (défaut: 60)
 *   - penSkipDistance : distance max (en unités plotter) pour ne pas lever le stylo
 *                       entre deux paths proches (défaut: 0 = désactivé)
 */
export function generateGcode(svgContent, paperConfig, svgViewBox, machineConfig, optimizePaths, pointJoiningRadius, speedSettings) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  
  const drawingArea = {
    width: paperConfig.width - paperConfig.marginLeft - paperConfig.marginRight,
    height: paperConfig.height - paperConfig.marginTop - paperConfig.marginBottom
  };

  const scale = Math.min(
    drawingArea.width / svgViewBox.width,
    drawingArea.height / svgViewBox.height
  );

  // Regrouper les paths par couleur
  const pathsByColor = {};
  doc.querySelectorAll('path').forEach(path => {
    const color = getStrokeColor(path);
    
    if (!pathsByColor[color]) {
      pathsByColor[color] = [];
    }
    pathsByColor[color].push(path);
  });

  const gcodeByColor = {};
  const timeEstimationByColor = {};

  // =============================================
  // OPTIM 1 : Vitesses séparées travel vs draw
  // =============================================
  const travelSpeed = speedSettings.travelSpeed * 60;
  const drawSpeed   = speedSettings.travelSpeed * 60;

  // =============================================
  // OPTIM 2 : Délais servo réduits et configurables
  // =============================================
  const penUpDelay   = speedSettings.penUpDelay   ?? 80;   // ms (était 250)
  const penDownDelay = speedSettings.penDownDelay ?? 60;   // ms (était 100)

  // =============================================
  // OPTIM 3 : Seuil pour sauter le pen up/down entre paths proches
  // =============================================
  const penSkipDistance = speedSettings.penSkipDistance ?? 0;  // 0 = désactivé
  
  Object.entries(pathsByColor).forEach(([color, paths]) => {
    let gcode = [];
    
    // En-tête
    gcode.push(`;Generated with Plotter-slicer`);
    gcode.push(";FLAVOR:Marlin-polargraph");
    gcode.push(`;MINX:${PLOTTER_MIN_X}`);
    gcode.push(`;MINY:${PLOTTER_MIN_Y}`);
    gcode.push(`;MAXX:${PLOTTER_MAX_X}`);
    gcode.push(`;MAXY:${PLOTTER_MAX_Y}`);
    gcode.push(`; ${new Date().toLocaleString('fr-FR')}`);
    gcode.push(`;Travel speed: ${travelSpeed} mm/min`);
    gcode.push(`;Draw speed: ${drawSpeed} mm/min`);
    gcode.push(`;Pen up delay: ${penUpDelay} ms`);
    gcode.push(`;Pen down delay: ${penDownDelay} ms`);
    gcode.push(`;Pen skip distance: ${penSkipDistance}`);
    gcode.push(";Start of user gcode");
    gcode.push("");
    gcode.push(";End of user gcode");
    gcode.push("G28 X Y");
    gcode.push(`M280 P0 S90 T${penUpDelay}`);
    gcode.push(`M0 ${color} pen and click`);
    
    let isPenDown = false;
    let lastTransformedPoint = null; // Pour calculer la distance entre paths

    const orderedPaths = optimizePaths 
      ? optimizePathOrder(paths, scale, drawingArea, svgViewBox, paperConfig, machineConfig)
      : paths;
    
    orderedPaths.forEach(path => {
      const pathData = path.getAttribute('d')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?=[ML])/);
      
      let currentSegment = [];
      let currentType = null;
      
      const processCurrentSegment = () => {
        if (currentSegment.length === 0) return;
        
        let simplifiedPoints = currentSegment;
        
        if (pointJoiningRadius > 0 && currentSegment.length > 2) {
          simplifiedPoints = simplifyPoints(currentSegment, pointJoiningRadius);
        }
        
        simplifiedPoints.forEach((point, i) => {
          const transformedPoint = transformCoord({
            x: point.x,
            y: point.y,
            scale,
            drawingArea,
            svgViewBox,
            paperConfig,
            machineConfig
          });
          
          if (i === 0 && currentType === 'M') {
            // =============================================
            // OPTIM 3 : Vérifier si on peut éviter de lever le stylo
            // =============================================
            if (isPenDown && penSkipDistance > 0 && lastTransformedPoint) {
              const dist = Math.hypot(
                transformedPoint.x - lastTransformedPoint.x,
                transformedPoint.y - lastTransformedPoint.y
              );
              
              if (dist <= penSkipDistance) {
                // Le prochain path est assez proche : on trace directement
                // sans lever/baisser le stylo (G1 au lieu de G0)
                gcode.push(`G1 X${transformedPoint.x.toFixed(3)} Y${transformedPoint.y.toFixed(3)} F${drawSpeed}`);
                lastTransformedPoint = transformedPoint;
                return;
              }
            }
            
            // Comportement normal : lever, déplacer, baisser
            if (isPenDown) {
              gcode.push(`M280 P0 S90 T${penUpDelay}`);
              isPenDown = false;
            }
            // OPTIM 1 : G0 utilise travelSpeed (rapide, stylo levé)
            gcode.push(`G0 X${transformedPoint.x.toFixed(3)} Y${transformedPoint.y.toFixed(3)} F${travelSpeed}`);
          } else {
            if (!isPenDown) {
              gcode.push(`M280 P0 S25 T${penDownDelay}`);
              isPenDown = true;
            }
            // OPTIM 1 : G1 utilise drawSpeed (précis, stylo baissé)
            gcode.push(`G1 X${transformedPoint.x.toFixed(3)} Y${transformedPoint.y.toFixed(3)} F${drawSpeed}`);
          }
          
          lastTransformedPoint = transformedPoint;
        });
      };
      
      pathData.forEach(cmd => {
        const type = cmd.trim()[0];
        const coords = cmd.slice(1).trim().split(/\s+/).map(Number);
        
        if (type === 'M') {
          processCurrentSegment();
          currentSegment = [{ x: coords[0], y: coords[1] }];
          currentType = 'M';
        } else if (type === 'L') {
          for (let i = 0; i < coords.length; i += 2) {
            if (i + 1 < coords.length) {
              currentSegment.push({ x: coords[i], y: coords[i + 1] });
            }
          }
        }
      });
      
      processCurrentSegment();
    });
    
    if (isPenDown) {
      gcode.push(`M280 P0 S90 T${penUpDelay}`);
    }
    gcode.push("G0 X0 Y0 F3000");
    gcode.push("M84");
    gcode.push(";End of Gcode");
    
    gcodeByColor[color] = gcode.join('\n');
    
    // MODIF: passer les deux vitesses à calculateDrawTime
    timeEstimationByColor[color] = calculateDrawTime(
      gcodeByColor[color],
      travelSpeed,
      drawSpeed,
      penUpDelay,
      penDownDelay
    );
  });
  
  return {
    gcodeByColor,
    timeEstimationByColor
  };
}