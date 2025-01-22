import React, { useState, useEffect, useRef } from 'react';

// Dimensions réelles du plotter
const PLOTTER_MIN_X = -126.225;
const PLOTTER_MAX_X = 126.225;
const PLOTTER_MIN_Y = -124.801;
const PLOTTER_MAX_Y = 124.801;
const PLOTTER_WIDTH = PLOTTER_MAX_X - PLOTTER_MIN_X;  // 252.45
const PLOTTER_HEIGHT = PLOTTER_MAX_Y - PLOTTER_MIN_Y; // 249.602

const PlotterApp = () => {
  const [paperConfig, setPaperConfig] = useState({
    width: 297,
    height: 420,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0
  });

  const [machineConfig, setMachineConfig] = useState({
    width: 655,
    height: 1030,
  });

  const [canvas, setCanvas] = useState({
    width: 1100,
    height: 1100,
  });
  
  const [svgContent, setSvgContent] = useState(null);
  const [svgViewBox, setSvgViewBox] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef(null);

  const [generatedGcode, setGeneratedGcode] = useState(null);


  useEffect(() => {
    // Reset du gcode quand la config du papier change
    setGeneratedGcode(null);
  }, [paperConfig]); 
  
  useEffect(() => {
    // Reset du gcode quand le SVG change
    setGeneratedGcode(null);
  }, [svgContent]);


  const calculateDrawingArea = () => {
    const width = paperConfig.width - paperConfig.marginLeft - paperConfig.marginRight;
    const height = paperConfig.height - paperConfig.marginTop - paperConfig.marginBottom;
    return { width, height };
  };

  const normalizeSvgShapes = (svgContent) => {
    // Créer un DOM temporaire pour manipuler le SVG
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    const cubicBezierPoint = (t, p0, p1, p2, p3) => {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
      
      return {
        x: uuu * p0.x + // (1-t)³ * P0
           3 * uu * t * p1.x + // 3(1-t)² * t * P1
           3 * u * tt * p2.x + // 3(1-t) * t² * P2
           ttt * p3.x, // t³ * P3
        y: uuu * p0.y +
           3 * uu * t * p1.y +
           3 * u * tt * p2.y +
           ttt * p3.y
      };
    };
  
    // Fonction pour convertir un segment de courbe en polyline
    const cubicBezierToPolyline = (p0, p1, p2, p3) => {
      // Calcul des distances entre les points de contrôle
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const d3 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
      
      // Distance totale du chemin de contrôle
      const totalDistance = d1 + d2 + d3;
      
      // Mesure de la "courbure" basée sur la différence entre la ligne droite et le chemin de contrôle
      const straightDistance = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const curvatureRatio = totalDistance / straightDistance;
    
      // Calcul du nombre de segments
      let segments;
      if (curvatureRatio < 1.1) {
        // Courbe très douce, presque droite
        segments = 8;
      } else if (curvatureRatio < 1.5) {
        // Courbe légère
        segments = 16;
      } else if (curvatureRatio < 2) {
        // Courbe moyenne
        segments = 32;
      } else if (curvatureRatio < 3) {
        // Courbe prononcée
        segments = 64;
      } else {
        // Courbe très prononcée
        segments = 128;
      }
    
      let points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = cubicBezierPoint(t, p0, p1, p2, p3);
        points.push(`${point.x},${point.y}`);
      }
      
      return points;
    };

    const quadraticBezierPoint = (t, p0, p1, p2) => {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      
      return {
        x: uu * p0.x + // (1-t)² * P0
           2 * u * t * p1.x + // 2(1-t) * t * P1
           tt * p2.x, // t² * P2
        y: uu * p0.y +
           2 * u * t * p1.y +
           tt * p2.y
      };
    };

    // Fonction pour convertir un segment de courbe quadratique en polyline
    const quadraticToPolyline = (p0, p1, p2) => {
      // Calcul des distances entre les points de contrôle
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      
      // Distance totale du chemin de contrôle
      const totalDistance = d1 + d2;
      
      // Distance en ligne droite entre le début et la fin
      const straightDistance = Math.hypot(p2.x - p0.x, p2.y - p0.y);
      const curvatureRatio = totalDistance / straightDistance;
    
      // Calcul du nombre de segments en fonction de la courbure
      let segments;
      if (curvatureRatio < 1.1) {
        // Presque droite
        segments = 6;
      } else if (curvatureRatio < 1.3) {
        // Courbe légère
        segments = 12;
      } else if (curvatureRatio < 1.7) {
        // Courbe moyenne
        segments = 24;
      } else if (curvatureRatio < 2.2) {
        // Courbe prononcée
        segments = 48;
      } else {
        // Courbe très prononcée
        segments = 96;
      }
    
      let points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = quadraticBezierPoint(t, p0, p1, p2);
        points.push(`${point.x},${point.y}`);
      }
      
      return points;
    };

    svg.querySelectorAll('path').forEach(path => {
      const d = path.getAttribute('d');
      if (d.includes('Q') || d.includes('q') || d.includes('C') || d.includes('c')) {
        // Nettoyer et normaliser le path data
        const pathData = d
          .replace(/([A-Za-z])/g, ' $1 ')  // Ajouter des espaces autour des lettres
          .replace(/,/g, ' ')              // Remplacer les virgules par des espaces
          .replace(/\s+/g, ' ')            // Normaliser les espaces multiples
          .replace(/-/g, ' -')             // Ajouter un espace avant les nombres négatifs
          .trim()
          .split(/\s+/);                   // Séparer sur les espaces
        
        // console.log('Path data après parsing:', pathData); // Pour debug
        
        let newPath = '';
        let currentX = 0, currentY = 0;
        let firstX = 0, firstY = 0;
        
        for (let i = 0; i < pathData.length;) {
          const command = pathData[i];
          
          switch (command.toUpperCase()) {
            case 'M':
              currentX = parseFloat(pathData[i + 1]);
              currentY = parseFloat(pathData[i + 2]);
              firstX = currentX;
              firstY = currentY;
              newPath += `M ${currentX} ${currentY} `;
              i += 3;
              break;
              
            case 'Q': {
              const isRelativeQ = command === 'q';
              let qx1 = parseFloat(pathData[i + 1]);
              let qy1 = parseFloat(pathData[i + 2]);
              let qx = parseFloat(pathData[i + 3]);
              let qy = parseFloat(pathData[i + 4]);
              
              if (isRelativeQ) {
                qx1 += currentX;
                qy1 += currentY;
                qx += currentX;
                qy += currentY;
              }
              
              // console.log('Points Q:', { qx1, qy1, qx, qy }); // Pour debug
              
              const qPoints = quadraticToPolyline(
                {x: currentX, y: currentY},
                {x: qx1, y: qy1},
                {x: qx, y: qy}
              );
              
              qPoints.forEach((point, index) => {
                if (index > 0) {
                  newPath += `L ${point} `;
                }
              });
              
              currentX = qx;
              currentY = qy;
              i += 5;
              break;
            }
            
            case 'C': {
              const isRelativeC = command === 'c';
              let cx1 = parseFloat(pathData[i + 1]);
              let cy1 = parseFloat(pathData[i + 2]);
              let cx2 = parseFloat(pathData[i + 3]);
              let cy2 = parseFloat(pathData[i + 4]);
              let cx = parseFloat(pathData[i + 5]);
              let cy = parseFloat(pathData[i + 6]);
              
              if (isRelativeC) {
                cx1 += currentX;
                cy1 += currentY;
                cx2 += currentX;
                cy2 += currentY;
                cx += currentX;
                cy += currentY;
              }
              
              const cPoints = cubicBezierToPolyline(
                {x: currentX, y: currentY},
                {x: cx1, y: cy1},
                {x: cx2, y: cy2},
                {x: cx, y: cy}
              );
              
              cPoints.forEach((point, index) => {
                if (index > 0) {
                  newPath += `L ${point} `;
                }
              });
              
              currentX = cx;
              currentY = cy;
              i += 7;
              break;
            }
            
            case 'L':
              currentX = parseFloat(pathData[i + 1]);
              currentY = parseFloat(pathData[i + 2]);
              newPath += `L ${currentX} ${currentY} `;
              i += 3;
              break;
            
            case 'Z':
              newPath += `L ${firstX} ${firstY}`;
              i++;
              break;
              
            default:
              console.warn('Commande non gérée:', command);
              i++;
          }
        }
        
        // console.log('Nouveau path:', newPath); // Pour debug
        path.setAttribute('d', newPath);
      }
    });
  
    // Convertir rect en path
    svg.querySelectorAll('rect').forEach(rect => {
      const x = parseFloat(rect.getAttribute('x') || 0);
      const y = parseFloat(rect.getAttribute('y') || 0);
      const width = parseFloat(rect.getAttribute('width'));
      const height = parseFloat(rect.getAttribute('height'));
      
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      
      // Ajouter le L final pour revenir au point de départ
      path.setAttribute('d', `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} L ${x} ${y}`);
      
      // Copier les attributs...
      Array.from(rect.attributes).forEach(attr => {
        if (attr.name !== 'x' && attr.name !== 'y' && 
            attr.name !== 'width' && attr.name !== 'height') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      rect.parentNode.replaceChild(path, rect);
    });
  
    // Fonction utilitaire pour convertir un cercle en segments
    const circleToPath = (cx, cy, r) => {
      const segments = 
        r <= 10 ? 16 :
        r <= 50 ? 32 :
        r <= 100 ? 64 :
        128;
      let d = `M ${cx + r} ${cy}`; // Point de départ sur le cercle
      
      for (let i = 1; i <= segments; i++) {
        const theta = (i * 2 * Math.PI) / segments;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        d += ` L ${x} ${y}`;
      }
      
      d += ` L ${cx + r} ${cy}`; // Fermer le cercle explicitement
      return d;
    };

    // Convertir circle en path
    svg.querySelectorAll('circle').forEach(circle => {
      const cx = parseFloat(circle.getAttribute('cx') || 0);
      const cy = parseFloat(circle.getAttribute('cy') || 0);
      const r = parseFloat(circle.getAttribute('r'));
      
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      
      // Utiliser la fonction pour générer le chemin
      path.setAttribute('d', circleToPath(cx, cy, r));
      
      // Copier les autres attributs
      Array.from(circle.attributes).forEach(attr => {
        if (attr.name !== 'cx' && attr.name !== 'cy' && attr.name !== 'r') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      circle.parentNode.replaceChild(path, circle);
    });

    // Convertir les lignes en path
    svg.querySelectorAll('line').forEach(line => {
      const x1 = parseFloat(line.getAttribute('x1') || 0);
      const y1 = parseFloat(line.getAttribute('y1') || 0);
      const x2 = parseFloat(line.getAttribute('x2') || 0);
      const y2 = parseFloat(line.getAttribute('y2') || 0);
      
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      
      // Ligne simple : move to (x1,y1) puis line to (x2,y2)
      path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
      
      // Copier les autres attributs
      Array.from(line.attributes).forEach(attr => {
        if (!['x1', 'y1', 'x2', 'y2'].includes(attr.name)) {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      line.parentNode.replaceChild(path, line);
    });

    // Convertir les polygones et polylines en path
    svg.querySelectorAll('polygon, polyline').forEach(poly => {
      const points = poly.getAttribute('points')
        .trim()
        .replace(/,/g, ' ') // Remplacer les virgules par des espaces
        .split(/\s+/)       // Séparer sur les espaces
        .map(Number);       // Convertir en nombres
  
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      
      let d = `M ${points[0]} ${points[1]}`; // Premier point
      
      // Ajouter tous les points suivants comme des lignes
      for (let i = 2; i < points.length; i += 2) {
        d += ` L ${points[i]} ${points[i + 1]}`;
      }
      
      // Si c'est un polygon (et non une polyline), retourner au point de départ explicitement
      if (poly.tagName.toLowerCase() === 'polygon') {
        d += ` L ${points[0]} ${points[1]}`;
      }
      
      path.setAttribute('d', d);
      
      // Copier les autres attributs
      Array.from(poly.attributes).forEach(attr => {
        if (attr.name !== 'points') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      poly.parentNode.replaceChild(path, poly);
    });
  
    // Retourner le SVG complet, pas juste son contenu
    return svg.outerHTML;
  };
  
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.svg')) {
      const text = await file.text();

      // Normaliser le SVG pour convertir toutes les formes en paths
      const normalizedSvg = normalizeSvgShapes(text);
      
      // Créer un DOM temporaire pour analyser le SVG
      const parser = new DOMParser();
      const doc = parser.parseFromString(normalizedSvg, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');
  
      // Créer un SVG temporaire dans le DOM pour calculer les dimensions réelles
      const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tempSvg.style.position = 'absolute';
      tempSvg.style.visibility = 'hidden';
      tempSvg.innerHTML = text.replace(/<svg[^>]*>|<\/svg>/g, '');
      document.body.appendChild(tempSvg);
      
      // Obtenir le viewBox s'il existe
      let viewBoxBounds = null;
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const [vbX, vbY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
        viewBoxBounds = {
          minX: vbX,
          minY: vbY,
          maxX: vbX + vbWidth,
          maxY: vbY + vbHeight
        };
      }
      
      // Calculer les dimensions réelles à partir de tous les éléments
      const allElements = tempSvg.querySelectorAll('path, rect, polyline');
      let pathBounds = null;
      if (allElements.length > 0) {
        pathBounds = Array.from(allElements).reduce((acc, element) => {
          const bbox = element.getBBox();
          return {
            minX: Math.min(acc.minX, bbox.x),
            minY: Math.min(acc.minY, bbox.y),
            maxX: Math.max(acc.maxX, bbox.x + bbox.width),
            maxY: Math.max(acc.maxY, bbox.y + bbox.height)
          };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      }
      
      document.body.removeChild(tempSvg);
  
      // Utiliser les bounds du viewBox s'ils existent, sinon ceux des paths, sinon les valeurs par défaut
      const bounds = viewBoxBounds || pathBounds || {
        minX: 0,
        minY: 0,
        maxX: parseFloat(svgElement.getAttribute('width')) || 100,
        maxY: parseFloat(svgElement.getAttribute('height')) || 100
      };
  
      // S'assurer que nous avons des dimensions valides
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);
      
      // console.log('SVG Dimensions calculées:', {
      //   width,
      //   height,
      //   bounds,
      //   viewBox: svgElement.getAttribute('viewBox'),
      //   originalWidth: svgElement.getAttribute('width'),
      //   originalHeight: svgElement.getAttribute('height'),
      //   pathBounds,
      //   viewBoxBounds
      // });
  
      // Mettre à jour le SVG content et les dimensions
      setSvgContent(normalizedSvg);
      setSvgViewBox({ 
        width, 
        height,
        minX: bounds.minX,
        minY: bounds.minY
      });
    }
  };
  
  const calculateSvgTransform = () => {
    if (!svgViewBox?.width || !svgViewBox?.height) return 'scale(1)';
    
    // Zone de dessin disponible sur le papier
    const drawingArea = calculateDrawingArea();
    
    // S'assurer que nous avons des dimensions positives non nulles
    const svgWidth = Math.max(1, svgViewBox.width);
    const svgHeight = Math.max(1, svgViewBox.height);
    
    // Calcul de l'échelle pour tenir dans la zone de dessin
    const scale = Math.min(
      drawingArea.width / svgWidth,
      drawingArea.height / svgHeight
    )
    
    // Position du papier dans la vue
    const paperX = (canvas.width - paperConfig.width) / 2;
    const paperY = (canvas.height - paperConfig.height) / 2;
    
    // Position du SVG dans la zone de dessin
    const translateX = paperX + paperConfig.marginLeft - (svgViewBox.minX * scale) + 
                      (drawingArea.width - svgWidth * scale) / 2;
    const translateY = paperY + paperConfig.marginTop - (svgViewBox.minY * scale) + 
                      (drawingArea.height - svgHeight * scale) / 2;
    
    // Vérifier que toutes les valeurs sont des nombres valides
    if (isNaN(translateX) || isNaN(translateY) || isNaN(scale)) {
      console.error('Valeurs de transformation invalides:', {
        translateX,
        translateY,
        scale,
        svgViewBox,
        drawingArea,
        paperConfig
      });
      return 'scale(1)';
    }  
    return `translate(${translateX}, ${translateY}) scale(${scale})`;
  };

  const transformCoord = ({ x, y, scale, drawingArea, svgViewBox, paperConfig, machineConfig }) => {
    // D'abord, appliquer la mise à l'échelle au SVG
    const scaledX = (x - svgViewBox.minX) * scale;
    const scaledY = (y - svgViewBox.minY) * scale;
    
    // Calcul de l'offset pour centrer le papier par rapport au (0,0) de la machine
    const paperOffsetX = -paperConfig.width / 2;
    const paperOffsetY = -paperConfig.height / 2;
    
    // Position dans le papier, en tenant compte des marges et du centrage du dessin
    const xInPaper = paperOffsetX + paperConfig.marginLeft + 
      (drawingArea.width - svgViewBox.width * scale) / 2 + scaledX;
    const yInPaper = paperOffsetY + paperConfig.marginTop + 
      (drawingArea.height - svgViewBox.height * scale) / 2 + scaledY;
  
    // Convertir en coordonnées du plotter en tenant compte du ratio physique/logique
    const machineRatioX = machineConfig.width / PLOTTER_WIDTH;
    const machineRatioY = machineConfig.height / PLOTTER_HEIGHT;
  
    return {
      x: xInPaper / (machineConfig.width / machineRatioX) * PLOTTER_WIDTH,
      y: -yInPaper / (machineConfig.height / machineRatioY) * PLOTTER_HEIGHT
    };
  };

  const generateGcode = (svgContent, paperConfig, svgViewBox, machineConfig) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    
    // Zone de dessin disponible
    const drawingArea = {
      width: paperConfig.width - paperConfig.marginLeft - paperConfig.marginRight,
      height: paperConfig.height - paperConfig.marginTop - paperConfig.marginBottom
    };
  
    // Calcul de l'échelle
    const scale = Math.min(
      drawingArea.width / svgViewBox.width,
      drawingArea.height / svgViewBox.height
    );
  
    let gcode = [];
    
    // En-tête
    gcode.push(`;Generated with Makelangelo 7.54.0`);
    gcode.push(";FLAVOR:Marlin-polargraph");
    gcode.push(`;MINX:${PLOTTER_MIN_X}`);
    gcode.push(`;MINY:${PLOTTER_MIN_Y}`);
    gcode.push(`;MAXX:${PLOTTER_MAX_X}`);
    gcode.push(`;MAXY:${PLOTTER_MAX_Y}`);
    gcode.push(`; ${new Date().toLocaleString('fr-FR')}`);
    gcode.push(";Start of user gcode");
    gcode.push("");
    gcode.push(";End of user gcode");
    gcode.push("G28 X Y");
    gcode.push("M280 P0 S90 T250");
    gcode.push("M0 Ready black and click");
  
    let isPenDown = false;
    const travelSpeed = 3000;
    const drawSpeed = 3000;
    
    // Traiter chaque path
    doc.querySelectorAll('path').forEach(path => {
      const pathData = path.getAttribute('d')
        .replace(/,/g, ' ')     // Remplacer les virgules par des espaces
        .replace(/\s+/g, ' ')   // Normaliser les espaces
        .trim()                 // Retirer les espaces aux extrémités
        .split(/(?=[ML])/);     // Séparer uniquement sur M et L
      
      pathData.forEach(cmd => {
        const type = cmd.trim()[0];
        const numbers = cmd.slice(1).trim().split(/\s+/).map(Number);
        
        if (numbers.length >= 2) {
          const point = transformCoord({
            x: numbers[0],
            y: numbers[1],
            scale,
            drawingArea,
            svgViewBox,
            paperConfig,
            machineConfig
          });
  
          if (type === 'M') {
            if (isPenDown) {
              gcode.push('M280 P0 S90 T250'); // Pen up
              isPenDown = false;
            }
            gcode.push(`G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${travelSpeed}`);
          } else if (type === 'L') {
            if (!isPenDown) {
              gcode.push('M280 P0 S25 T150'); // Pen down
              isPenDown = true;
            }
            gcode.push(`G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${drawSpeed}`);
          }
        }
      });
    });
    
    if (isPenDown) {
      gcode.push("M280 P0 S90 T250"); // Pen up
    }
    gcode.push("G0 X0 Y0 F3000"); // Return home
    gcode.push(";End of Gcode");
    
    return gcode.join('\n');
  };

  const handleGenerateGcode = () => {
    if (!svgContent || !svgViewBox) return;
    
    const gcode = generateGcode(svgContent, paperConfig, svgViewBox, machineConfig);
    if (!gcode) return;

    setGeneratedGcode(gcode);  // Sauvegarder le GCode pour la prévisualisation
    
    // Créer le nom du fichier basé sur le fichier SVG d'origine
    const filename = fileInputRef.current?.files[0]?.name.replace('.svg', '.gcode') || 'output.gcode';
    
    // Créer et télécharger le fichier
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const GCodePreview = ({ gcode }) => {
    if (!gcode) return null;
    
    const pathData = gcode.split('\n')
      .filter(line => line.startsWith('G0 ') || line.startsWith('G1 '))
      .map(line => {
        const x = parseFloat(line.match(/X(-?\d+\.?\d*)/)?.[1]);
        const y = parseFloat(line.match(/Y(-?\d+\.?\d*)/)?.[1]);
        const isMove = line.startsWith('G0');
        return { x, y, isMove };
      });
  
    const plotterToSvg = (x, y) => {
      // Calculer les ratios de correction basés sur les dimensions réelles vs SVG
      const correctionX = PLOTTER_WIDTH / paperConfig.width;
      const correctionY = PLOTTER_HEIGHT / paperConfig.height;
    
      // D'abord, convertir en position relative (0-1) sur le plotter
      const relativeX = (x - PLOTTER_MIN_X) / PLOTTER_WIDTH;
      const relativeY = (PLOTTER_MAX_Y - y) / PLOTTER_HEIGHT;
    
      // Appliquer la correction et convertir aux dimensions du papier
      const paperX = relativeX * paperConfig.width * correctionX;
      const paperY = relativeY * paperConfig.height * correctionY;
      
      // Positionner dans le viewport comme le papier
      return {
        x: (canvas.width - paperConfig.width * correctionX) / 2 + paperX,
        y: (canvas.height - paperConfig.height * correctionY) / 2 + paperY
      };
    };
  
    let path = '';
    pathData.forEach((point, i) => {
      const svgPos = plotterToSvg(point.x, point.y);
      if (i === 0 || point.isMove) {
        path += `M ${svgPos.x} ${svgPos.y} `;
      } else {
        path += `L ${svgPos.x} ${svgPos.y} `;
      }
    });
  
    return (
      <path 
        d={path} 
        fill="none" 
        stroke="blue" 
        strokeWidth="1" 
        opacity="1"
      />
    );
  };

  return (
    <div className="p-4 max-w-screen-xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Panneau de contrôle */}
        <div className="border rounded-lg p-4">
          <h1 className="text-3xl font-bold mb-4">Plotter slicer</h1>
          <h2 className="text-lg font-bold mb-4 mt-12">Paper (mm)</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block mb-1">Width</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.width}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    width: Number(e.target.value)
                  })}
                />
              </div>

              <div>
                <label className="block mb-1">Height</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.height}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    height: Number(e.target.value)
                  })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold mb-4 mt-12">Margins (mm)</h2>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block mb-1">Margin top</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.marginTop}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    marginTop: Number(e.target.value)
                  })}
                />
              </div>
              <div>
                <label className="block mb-1">Margin right</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.marginRight}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    marginRight: Number(e.target.value)
                  })}
                />
              </div>
              <div>
                <label className="block mb-1">Margin bottom</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.marginBottom}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    marginBottom: Number(e.target.value)
                  })}
                />
              </div>
              <div>
                <label className="block mb-1">Margin left</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  value={paperConfig.marginLeft}
                  onChange={(e) => setPaperConfig({
                    ...paperConfig,
                    marginLeft: Number(e.target.value)
                  })}
                />
              </div>
            </div>
          </div>
            
          <h2 className="text-lg font-bold mb-4 mt-12">Files</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <button 
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={() => fileInputRef.current?.click()}
              >
                Importer SVG
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".svg"
                onChange={handleFileUpload}
              />
            </div>

            <button 
              className={`w-full p-2 rounded ${
                svgContent 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              onClick={handleGenerateGcode}
              disabled={!svgContent}
            >
              Générer GCode
            </button>
          </div>
        </div>

        {/* Prévisualisation */}
        <div className="border rounded-lg md:col-span-2">
          <div className="w-full max-h-[calc(100vh-3rem)] bg-gray-100 rounded-lg overflow-hidden">
            <svg
              viewBox={`0 0 ${canvas.width} ${canvas.height}`}
              className="w-full h-full bg-gray-100"
            >
              {/* Zone de dessin totale du plotter */}
              {/* <rect
                x={(canvas.width - machineConfig.width) /2}
                y={(canvas.height - machineConfig.height) /2}
                width={machineConfig.width}
                height={machineConfig.height}
                fill="#d1d1d1"
                stroke="gray"
                strokeWidth="0.5"
              /> */}

              {/* Support machine */}
              <rect
                x={(canvas.width - machineConfig.width) /2 -30}
                y={(canvas.height - 1030) /2 - 30}
                width={machineConfig.width + 60}
                height={60}
                fill="#c9bca1"
                stroke="grey"
                strokeWidth="0.5"
              />
              
              {/* Moteurs */}
              <rect
                x={(canvas.width - machineConfig.width) /2 -25}
                y={(canvas.height - 1030) /2 - 25}
                width={50}
                height={70}
                fill="#ab9c7e"
                stroke="grey"
                strokeWidth="0.5"
              />
              <rect 
                x={(canvas.width - machineConfig.width) /2 - 15} 
                y={(canvas.height - machineConfig.height) /2 - 15} 
                width={30}
                height={30}
                fill="black" 
              />
              <circle cx={(canvas.width - machineConfig.width) /2} cy={(canvas.height - machineConfig.height) /2} r="13" fill="blue" />

              <rect
                x={(canvas.width) -248}
                y={(canvas.height - 1030) /2 - 25}
                width={50}
                height={70}
                fill="#ab9c7e"
                stroke="grey"
                strokeWidth="0.5"
              />
              <rect 
                x={canvas.width - (canvas.width - machineConfig.width) /2 - 15} 
                y={(canvas.height - machineConfig.height) /2 - 15} 
                width={30}
                height={30}
                fill="black" 
              />
              <circle cx={canvas.width - (canvas.width - machineConfig.width) /2} cy={(canvas.height - machineConfig.height) /2} r="13" fill="blue" />
              
              {/* Ecran + SD */}
              <rect
                x={(canvas.width - 210) / 2 - 150}
                y={(canvas.height - 1030) /2 - 20}
                width={150}
                height={40}
                fill="white"
                stroke="grey"
                strokeWidth=".5"
              />
              <rect
                x={(canvas.width - 210) / 2 - 140}
                y={(canvas.height - 1030) /2 - 15}
                width={80}
                height={30}
                fill="blue"
                stroke="grey"
                strokeWidth=".5"
              />
              <circle cx={(canvas.width - 210) / 2 - 15} cy={(canvas.height - 1030) /2} r="6" fill="black" />

 

              {/* Papier centré */}
              <rect
                x={(canvas.width - paperConfig.width) / 2}
                y={(canvas.height - paperConfig.height) / 2}
                width={paperConfig.width}
                height={paperConfig.height}
                fill="white"
                stroke="black"
                strokeWidth="1"
              />
              
              {/* Zone de dessin sur le papier */}
              <rect
                x={(canvas.width - paperConfig.width) / 2 + paperConfig.marginLeft}
                y={(canvas.height - paperConfig.height) / 2 + paperConfig.marginTop}
                width={calculateDrawingArea().width}
                height={calculateDrawingArea().height}
                fill="none"
                stroke="blue"
                strokeDasharray="5,5"
                strokeWidth="1"
              />

            {svgContent && (
              <g transform={calculateSvgTransform()}>
                <g dangerouslySetInnerHTML={{ 
                  __html: svgContent.replace(/<svg[^>]*>|<\/svg>/g, '')
                    .replace(/width="[^"]*"/g, '')
                    .replace(/height="[^"]*"/g, '')
                }} />
              </g>
            )}

            {/* prévisualisation du GCode */}
            {generatedGcode && <GCodePreview gcode={generatedGcode}/>}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlotterApp;