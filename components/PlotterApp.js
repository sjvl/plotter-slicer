import React, { useState, useEffect, useRef } from 'react';
import SerialConnection from './SerialConnection';
import { ArrowLeftRight } from 'lucide-react';

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
  const [timeEstimations, setTimeEstimations] = useState({});


  const [selectedFormat, setSelectedFormat] = useState('A3');
  const paperFormats = {
    'A5': { width: 148, height: 210 },
    'A4': { width: 210, height: 297 },
    'A3': { width: 297, height: 420 },
    'A2': { width: 420, height: 594 },
    'B2': { width: 500, height: 707 },
  };

  const [viewTransform, setViewTransform] = useState({
    scale: 1,
    x: 0,
    y: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [speedSettings, setSpeedSettings] = useState({
    travelSpeed: 3000,  // acceleration
  });

  const [serialConnectionRef, setSerialConnectionRef] = useState(null);
  

  const handleStreamGCode = async (color, gcode) => {
    console.log('=== STREAMING GCODE ===');
    console.log('Color:', color);
    console.log('Length:', gcode.length, 'caractères');
    
    const baseFilename = fileInputRef.current?.files[0]?.name.replace('.svg', '') || 'output';
    const jobName = `${baseFilename}-${color}`;
    
    try {
        await serialConnectionRef.streamGcode(gcode, jobName);
        alert(`✅ Streaming de "${color}" terminé avec succès !`);
    } catch (error) {
        // alert(`❌ Erreur streaming: ${error.message}`);
    }
  };

  const handleSpeedChange = (type, value) => {
    setSpeedSettings(prev => ({
      ...prev,
      [type]: Number(value)
    }));

    // Réinitialiser le gcode généré lorsque les paramètres changent
    setGeneratedGcode(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    
    // Obtenir les dimensions du SVG
    const svgElement = e.currentTarget;
    const bbox = svgElement.getBoundingClientRect();
    
    // Position relative de la souris dans le SVG (en pourcentage)
    const mouseX = (e.clientX - bbox.left) / bbox.width;
    const mouseY = (e.clientY - bbox.top) / bbox.height;
  
    // Facteur de zoom
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
  
    setViewTransform(prev => {
      // Limiter le scale entre 1 et 10
      const newScale = Math.min(Math.max(prev.scale * scaleFactor, 1), 10);
      
      // Si on atteint scale = 1, réinitialiser complètement la transformation
      if (newScale === 1) {
        return {
          scale: 1,
          x: 0,
          y: 0
        };
      }
      
      // Si le scale n'a pas changé (atteint la limite haute), ne pas modifier la transformation
      if (newScale === prev.scale) return prev;
  
      // Point de référence dans les coordonnées initiales
      const refX = canvas.width * mouseX;
      const refY = canvas.height * mouseY;
  
      // Calculer les nouveaux décalages pour maintenir le point sous la souris
      const newX = refX - (refX - prev.x) * scaleFactor;
      const newY = refY - (refY - prev.y) * scaleFactor;
  
      return {
        scale: newScale,
        x: newX,
        y: newY
      };
    });
  };
  
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 0) {  // Clic milieu ou gauche
      setIsDragging(true);
      setDragStart({
        x: e.clientX - viewTransform.x,
        y: e.clientY - viewTransform.y
      });
    }
  };
  
  const handleMouseMove = (e) => {
    if (isDragging) {
      setViewTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handler pour le changement de format
  const handleFormatChange = (format) => {
    setSelectedFormat(format);
    setPaperConfig({
      ...paperConfig,
      width: paperFormats[format].width,
      height: paperFormats[format].height
    });
  };

  const handleDimensionChange = (dimension, value) => {
    const newConfig = {
      ...paperConfig,
      [dimension]: value
    };
    setPaperConfig(newConfig);
  
    // Vérifier si les dimensions correspondent à un format standard
    const formatMatch = Object.entries(paperFormats).find(([_, dims]) => 
      dims.width === newConfig.width && dims.height === newConfig.height
    );
    
    setSelectedFormat(formatMatch ? formatMatch[0] : 'custom');
  };


  useEffect(() => {
    // Reset du gcode quand la config change
    setGeneratedGcode(null);
    handleGenerateGcode();
  }, [svgContent, paperConfig, speedSettings]); 

  useEffect(() => {
    const preventDefault = (e) => {
      if (e.ctrlKey) {  // Si c'est un zoom avec Ctrl + molette
        e.preventDefault();
      }
    };
  
    // Cibler spécifiquement le conteneur de prévisualisation
    const container = document.querySelector('.preview-container');
    container?.addEventListener('wheel', preventDefault, { passive: false });
  
    return () => {
      container?.removeEventListener('wheel', preventDefault);
    };
  }, []);

  const calculateDrawingArea = () => {
    const width = paperConfig.width - paperConfig.marginLeft - paperConfig.marginRight;
    const height = paperConfig.height - paperConfig.marginTop - paperConfig.marginBottom;
    return { width, height };
  };

  

  ///////////SVG PROCESSING///////////
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

  function normalizeColor(color) {
    // Base de couleurs de référence avec leurs valeurs RGB
    const baseColors = {
      black: [0, 0, 0],
      white: [255, 255, 255],
      red: [255, 0, 0],
      green: [0, 128, 0],
      blue: [0, 0, 255],
      yellow: [255, 255, 0],
      purple: [128, 0, 128],
      orange: [255, 165, 0],
      brown: [165, 42, 42],
      pink: [255, 192, 203],
      gray: [128, 128, 128],
      cyan: [0, 255, 255],
      magenta: [255, 0, 255],
    };
  
    // Fonction interne pour convertir hex en RGB
    function hexToRgb(hex) {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
      
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : null;
    }
  
    // Fonction interne pour convertir hsl en RGB
    function hslToRgb(h, s, l) {
      h /= 360;
      s /= 100;
      l /= 100;
      
      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      }
  
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
  
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
  
    // Traitement principal
    try {
      // Nettoyer l'entrée
      const normalizedInput = color.toLowerCase().trim();
  
      // Si c'est déjà un nom de couleur de base, le retourner
      if (baseColors.hasOwnProperty(normalizedInput)) {
        return normalizedInput;
      }
  
      // Convertir la couleur en RGB selon son format
      let rgb;
  
      if (normalizedInput.startsWith('#')) {
        // Format hexadécimal
        rgb = hexToRgb(normalizedInput);
      } 
      else if (normalizedInput.startsWith('rgb')) {
        // Format RGB/RGBA
        const values = normalizedInput.match(/\d+/g);
        rgb = values ? values.slice(0, 3).map(Number) : null;
      }
      else if (normalizedInput.startsWith('hsl')) {
        // Format HSL/HSLA
        const values = normalizedInput.match(/\d+/g);
        if (values) {
          const [h, s, l] = values.map(Number);
          rgb = hslToRgb(h, s, l);
        }
      }
  
      // Si la conversion a échoué, retourner noir par défaut
      if (!rgb) return 'black';
  
      // Trouver la couleur de base la plus proche
      let closestColor = 'black';
      let minDistance = Infinity;
  
      for (const [name, values] of Object.entries(baseColors)) {
        const distance = Math.sqrt(
          Math.pow(rgb[0] - values[0], 2) +
          Math.pow(rgb[1] - values[1], 2) +
          Math.pow(rgb[2] - values[2], 2)
        );
  
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = name;
        }
      }
  
      return closestColor;
    } catch (error) {
      console.warn('Color normalization failed:', error);
      return 'black'; // Valeur par défaut en cas d'erreur
    }
  }

  function getStrokeColor(element) {
    // Vérifier d'abord le style inline
    const style = element.getAttribute('style');
    if (style) {
      const strokeMatch = style.match(/stroke:\s*([^;]+)/);
      if (strokeMatch) return normalizeColor(strokeMatch[1]);
    }
    
    // Ensuite vérifier l'attribut stroke
    const stroke = element.getAttribute('stroke');
    if (stroke) return normalizeColor(stroke);
    
    // Si pas de stroke mais un fill, utiliser le fill
    const fill = element.getAttribute('fill');
    if (fill && fill !== 'none') return normalizeColor(fill);
    
    // Par défaut, noir
    return 'black';
  }

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
      if (d.includes('Q') || d.includes('q') || d.includes('C') || d.includes('c') || d.includes('T') || d.includes('t')) {
        // Nettoyer et normaliser le path data
        const pathData = d
          .replace(/([A-Za-z])/g, ' $1 ')  // Ajouter des espaces autour des lettres
          .replace(/,/g, ' ')              // Remplacer les virgules par des espaces
          .replace(/\s+/g, ' ')            // Normaliser les espaces multiples
          .replace(/-/g, ' -')             // Ajouter un espace avant les nombres négatifs
          .trim()
          .split(/\s+/);                   // Séparer sur les espaces
        
        let newPath = '';
        let currentX = 0, currentY = 0;
        let firstX = 0, firstY = 0;
        let lastControlX = 0, lastControlY = 0; // Pour les commandes T et S
        
        for (let i = 0; i < pathData.length;) {
          const command = pathData[i];
          
          switch (command.toUpperCase()) {
            case 'M':
              currentX = parseFloat(pathData[i + 1]);
              currentY = parseFloat(pathData[i + 2]);
              if (command === 'm' && i > 0) { // Relatif (sauf le premier M)
                currentX += parseFloat(pathData[i + 1]);
                currentY += parseFloat(pathData[i + 2]);
              }
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
              
              // Stocker le point de contrôle pour les éventuelles commandes T
              lastControlX = qx1;
              lastControlY = qy1;
              
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

            case 'T': {
              // Smooth quadratic Bézier curveto
              const isRelativeT = command === 't';
              let tx = parseFloat(pathData[i + 1]);
              let ty = parseFloat(pathData[i + 2]);
              
              if (isRelativeT) {
                tx += currentX;
                ty += currentY;
              }
              
              // Calculer le point de contrôle réfléchi
              const reflectedControlX = currentX + (currentX - lastControlX);
              const reflectedControlY = currentY + (currentY - lastControlY);
              
              const tPoints = quadraticToPolyline(
                {x: currentX, y: currentY},
                {x: reflectedControlX, y: reflectedControlY},
                {x: tx, y: ty}
              );
              
              tPoints.forEach((point, index) => {
                if (index > 0) {
                  newPath += `L ${point} `;
                }
              });
              
              // Mettre à jour le dernier point de contrôle
              lastControlX = reflectedControlX;
              lastControlY = reflectedControlY;
              
              currentX = tx;
              currentY = ty;
              i += 3;
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

            case 'S': {
              // Smooth cubic Bézier curveto
              const isRelativeS = command === 's';
              let sx2 = parseFloat(pathData[i + 1]);
              let sy2 = parseFloat(pathData[i + 2]);
              let sx = parseFloat(pathData[i + 3]);
              let sy = parseFloat(pathData[i + 4]);
              
              if (isRelativeS) {
                sx2 += currentX;
                sy2 += currentY;
                sx += currentX;
                sy += currentY;
              }
              
              // Premier point de contrôle réfléchi (pour cubic, on utilise le dernier point de contrôle)
              const reflectedControlX = currentX + (currentX - lastControlX);
              const reflectedControlY = currentY + (currentY - lastControlY);
              
              const sPoints = cubicBezierToPolyline(
                {x: currentX, y: currentY},
                {x: reflectedControlX, y: reflectedControlY},
                {x: sx2, y: sy2},
                {x: sx, y: sy}
              );
              
              sPoints.forEach((point, index) => {
                if (index > 0) {
                  newPath += `L ${point} `;
                }
              });
              
              // Mettre à jour le dernier point de contrôle
              lastControlX = sx2;
              lastControlY = sy2;
              
              currentX = sx;
              currentY = sy;
              i += 5;
              break;
            }
            
            case 'L':
              const isRelativeL = command === 'l';
              let lx = parseFloat(pathData[i + 1]);
              let ly = parseFloat(pathData[i + 2]);
              
              if (isRelativeL) {
                lx += currentX;
                ly += currentY;
              }
              
              currentX = lx;
              currentY = ly;
              newPath += `L ${currentX} ${currentY} `;
              i += 3;
              break;

            case 'H': {
              // Horizontal line
              const isRelativeH = command === 'h';
              let hx = parseFloat(pathData[i + 1]);
              
              if (isRelativeH) {
                hx += currentX;
              }
              
              currentX = hx;
              newPath += `L ${currentX} ${currentY} `;
              i += 2;
              break;
            }

            case 'V': {
              // Vertical line
              const isRelativeV = command === 'v';
              let vy = parseFloat(pathData[i + 1]);
              
              if (isRelativeV) {
                vy += currentY;
              }
              
              currentY = vy;
              newPath += `L ${currentX} ${currentY} `;
              i += 2;
              break;
            }
            
            case 'Z':
              newPath += `L ${firstX} ${firstY}`;
              currentX = firstX;
              currentY = firstY;
              i++;
              break;
              
            default:
              console.warn('Commande non gérée:', command);
              i++;
          }
        }
        
        path.setAttribute('d', newPath);
        path.setAttribute('data-color', getStrokeColor(path));
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
      path.setAttribute('data-color', getStrokeColor(rect));
      
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
      path.setAttribute('data-color', getStrokeColor(circle));
      
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
      path.setAttribute('data-color', getStrokeColor(line));
      
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
      path.setAttribute('data-color', getStrokeColor(poly));
      
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
  ///////////SVG PROCESSING///////////


  ///////////GCODE GENERATION///////////
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

  const calculateDrawTime = (gcodeContent, travelSpeed) => {
    // Convertir mm/min en mm/s pour faciliter le calcul
    const travelSpeedMmSec = travelSpeed / 60;
    
    // Variables pour le calcul
    let travelDistance = 0;
    let drawDistance = 0;
    let lastX = 0, lastY = 0;
    let isPenDown = false;
    let penUpDownCount = 0;
    
    // Temps pour les opérations du stylo (en secondes)
    const penMoveTime = .8;  // 1 seconde pour lever ou baisser le stylo
    
    // Facteur d'ajustement empirique
    const adjustmentFactor = 0.00007 * travelSpeed + 0.79;  // 15% de plus que le calcul théorique
    console.log(adjustmentFactor)
    
    // Paramètres d'accélération (mm/s²)
    const acceleration = 800;  // Valeur typique pour un plotter
    
    // Fonction pour calculer le temps avec accélération
    const calculateTimeWithAcceleration = (distance, speed, isDrawing) => {
      // Vitesse en mm/s
      const v = travelSpeedMmSec;
      
      // Pour les très petits déplacements, l'accélération est le facteur dominant
      if (distance < 1) {
        return distance / (v * 0.5);  // On suppose qu'on n'atteint que 50% de la vitesse max
      }
      
      // Distance minimale pour atteindre la vitesse maximale (s = v²/2a)
      const accelerationDistance = (v * v) / (2 * acceleration);
      
      // Si on peut atteindre la vitesse maximale
      if (distance > 2 * accelerationDistance) {
        // Temps pour accélérer + temps à vitesse constante + temps pour décélérer
        const accelerationTime = v / acceleration;
        const constantSpeedTime = (distance - 2 * accelerationDistance) / v;
        return 2 * accelerationTime + constantSpeedTime;
      } else {
        // On n'atteint jamais la vitesse maximale (accélération puis décélération)
        return 2 * Math.sqrt(distance / (2 * acceleration));
      }
    };
    
    // Analyser le G-code ligne par ligne
    const lines = gcodeContent.split('\n');
    let segments = [];  // Pour stocker les segments de mouvement
    
    for (const line of lines) {
      // Détecter les changements d'état du stylo (M280)
      if (line.includes('M280 P0 S90')) { // Pen up
        if (isPenDown) {
          isPenDown = false;
          penUpDownCount++;
        }
        continue;
      } else if (line.includes('M280 P0 S25')) { // Pen down
        if (!isPenDown) {
          isPenDown = true;
          penUpDownCount++;
        }
        continue;
      }
      
      // Traiter les mouvements
      if (line.startsWith('G0') || line.startsWith('G1')) {
        const xMatch = line.match(/X(-?\d+\.?\d*)/);
        const yMatch = line.match(/Y(-?\d+\.?\d*)/);
        
        if (xMatch && yMatch) {
          const x = parseFloat(xMatch[1]);
          const y = parseFloat(yMatch[1]);
          
          // Calculer la distance
          const distance = Math.sqrt(Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2));
          
          if (distance > 0) {
            // Ajouter le segment avec type (déplacement ou tracé)
            const isTravel = line.startsWith('G0') || !isPenDown;
            segments.push({
              distance,
              isTravel,
              x1: lastX,
              y1: lastY,
              x2: x,
              y2: y
            });
            
            // Mettre à jour les totaux
            if (isTravel) {
              travelDistance += distance;
            } else {
              drawDistance += distance;
            }
          }
          
          // Mettre à jour les dernières coordonnées
          lastX = x;
          lastY = y;
        }
      }
    }
    
    // Calculer le temps total avec accélération
    let travelTime = 0;
    let drawTime = 0;
    
    for (const segment of segments) {
      if (segment.isTravel) {
        travelTime += calculateTimeWithAcceleration(segment.distance, travelSpeedMmSec, false);
      } else {
        drawTime += calculateTimeWithAcceleration(segment.distance, travelSpeedMmSec, true);
      }
    }
    
    // Ajouter le temps pour les opérations de stylo (1s par mouvement)
    const penOperationTime = penUpDownCount * penMoveTime;
    
    // Attente pour l'interaction utilisateur (M0)
    // Rechercher les pauses utilisateur (M0) dans le code
    const userPauses = gcodeContent.match(/M0/g);
    const userPauseCount = userPauses ? userPauses.length : 0;
    const userPauseTime = userPauseCount > 0 ? 30 : 0; // 30 secondes si au moins une pause
    
    // Calculer le temps total avec le facteur d'ajustement
    const calculatedTimeSeconds = (travelTime + drawTime + penOperationTime) * adjustmentFactor + userPauseTime;
    
    // Arrondir à la seconde supérieure
    const totalTimeSeconds = Math.ceil(calculatedTimeSeconds);
    
    // Convertir en formats lisibles
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

    // Regrouper les paths par couleur
    const pathsByColor = {};
    doc.querySelectorAll('path').forEach(path => {
      // Lire directement la couleur du stroke et la normaliser
      const stroke = path.getAttribute('stroke');
      const color = stroke ? normalizeColor(stroke) : 'black';
      
      if (!pathsByColor[color]) {
        pathsByColor[color] = [];
      }
      pathsByColor[color].push(path);
    });
  
    // Générer un gcode pour chaque couleur
    const gcodeByColor = {};
    const timeEstimationByColor = {};
    
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
      gcode.push(";Start of user gcode");
      gcode.push("");
      gcode.push(";End of user gcode");
      gcode.push("G28 X Y");
      gcode.push("M280 P0 S90 T250");
      gcode.push(`M0 ${color} pen and click`);
      let isPenDown = false;
      const travelSpeed = speedSettings.travelSpeed;
      
      // Traiter les paths de cette couleur
      paths.forEach(path => {
        const pathData = path.getAttribute('d')
          .replace(/,/g, ' ')     // Remplacer les virgules par des espaces
          .replace(/\s+/g, ' ')   // Normaliser les espaces
          .trim()                 // Retirer les espaces aux extrémités
          .split(/(?=[ML])/);     // Séparer uniquement sur M et L
        
          pathData.forEach(cmd => {
            const type = cmd.trim()[0];
            // Diviser tous les nombres en paires
            const coords = cmd.slice(1).trim().split(/\s+/).map(Number);
            
            // Traiter les nombres deux par deux
            for (let i = 0; i < coords.length; i += 2) {
              if (i + 1 < coords.length) { // Vérifier qu'on a bien une paire de coordonnées
                const point = transformCoord({
                  x: coords[i],
                  y: coords[i+1],
                  scale,
                  drawingArea,
                  svgViewBox,
                  paperConfig,
                  machineConfig
                });
                
                if (type === 'M' && i === 0) {
                  // Premier point d'un segment M
                  if (isPenDown) {
                    gcode.push('M280 P0 S90 T250'); // Pen up
                    isPenDown = false;
                  }
                  gcode.push(`G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${travelSpeed}`);
                } else {
                  // Tous les autres points sont des lignes
                  if (!isPenDown) {
                    gcode.push('M280 P0 S25 T150'); // Pen down
                    isPenDown = true;
                  }
                  gcode.push(`G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${travelSpeed}`);
                }
              }
            }
          });
      });
      
      if (isPenDown) {
        gcode.push("M280 P0 S90 T250"); // Pen up
      }
      gcode.push("G0 X0 Y0 F3000"); // Return home
      gcode.push(";End of Gcode");
      
      gcodeByColor[color] = gcode.join('\n');
      
      // Calculer l'estimation du temps
      timeEstimationByColor[color] = calculateDrawTime(
        gcodeByColor[color], 
        travelSpeed, 
      );
    });

    console.log(timeEstimationByColor)
    
    return {
      gcodeByColor,
      timeEstimationByColor
    };
  };

  const handleGenerateGcode = () => {
    if (!svgContent || !svgViewBox) return;
    
    const result = generateGcode(svgContent, paperConfig, svgViewBox, machineConfig);
    
    // Mettre à jour l'état pour la prévisualisation
    setGeneratedGcode(result.gcodeByColor);
    setTimeEstimations(result.timeEstimationByColor);
    
    // // Créer un fichier pour chaque couleur
    // Object.entries(result.gcodeByColor).forEach(([color, gcode]) => {
    //   console.log(`Téléchargement ${color} (premiers 200 chars):`, gcode.substring(0, 200));

    //   const baseFilename = fileInputRef.current?.files[0]?.name.replace('.svg', '') || 'output';
    //   const filename = `${baseFilename}-${color}.gcode`;
      
    //   const blob = new Blob([gcode], { type: 'text/plain' });
    //   const url = URL.createObjectURL(blob);
    //   const link = document.createElement('a');
    //   link.href = url;
    //   link.download = filename;
    //   document.body.appendChild(link);
    //   link.click();
    //   document.body.removeChild(link);
    //   URL.revokeObjectURL(url);
    // });
  };

  const handleDownloadGCode = (color, gcode) => {
      const baseFilename = fileInputRef.current?.files[0]?.name.replace('.svg', '') || 'output';
      const filename = `${baseFilename}-${color}.gcode`;
      
      const blob = new Blob([gcode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
  };

  const GCodePreview = ({ gcode }) => {
    if (!gcode) return null;

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

    const processGCode = (gcodeContent) => {
      const pathData = gcodeContent.split('\n')
        .filter(line => line.startsWith('G0 ') || line.startsWith('G1 '))
        .map(line => {
          const x = parseFloat(line.match(/X(-?\d+\.?\d*)/)?.[1]);
          const y = parseFloat(line.match(/Y(-?\d+\.?\d*)/)?.[1]);
          const isMove = line.startsWith('G0');
          return { x, y, isMove };
        });

      let path = '';
      pathData.forEach((point, i) => {
        const svgPos = plotterToSvg(point.x, point.y);
        if (i === 0 || point.isMove) {
          path += `M ${svgPos.x} ${svgPos.y} `;
        } else {
          path += `L ${svgPos.x} ${svgPos.y} `;
        }
      });

      return path;
    };

    // Si c'est une chaîne (ancien format), la convertir en objet avec une seule couleur
    const gcodeByColor = typeof gcode === 'string' 
      ? { blue: gcode }  // Garder la couleur bleue par défaut pour la compatibilité
      : gcode;
  
    return (
      <>
        {Object.entries(gcodeByColor).map(([color, colorGcode]) => (
          <path 
            key={color}
            d={processGCode(colorGcode)} 
            fill="none" 
            stroke="blue" 
            strokeWidth="1" 
            opacity=".6"
          />
        ))}
      </>
    );
  };
  ///////////GCODE GENERATION///////////

  return (
    <div className="p-4 max-w-screen-xxl mx-auto h-screen flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 min-h-0">
        
        {/* Panneau de contrôle */}
        <div className="border rounded-lg">
          <div className="p-4 control-panel-scroll">
            <h1 className="text-3xl font-bold">Plotter slicer</h1>
            <p className="text-xs mb-4">for <a href="https://www.marginallyclever.com/" target="_blank" className="text-blue-500 no-underline hover:text-blue-700">Makelangelo 5</a> by <a href="https://sjvl.notion.site/" target="_blank" className="text-blue-500 no-underline hover:text-blue-700">sjvl</a></p>
  
            {/* SPEEDS */}
            <h2 className="text-lg font-bold mb-1 mt-6">Acceleration (mm/min)</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    min="1000"
                    max="3000"
                    step="100"
                    value={speedSettings.travelSpeed}
                    onChange={(e) => handleSpeedChange('travelSpeed', e.target.value)}
                  />
                </div>
              </div>
            </div>
  
            {/* PAPER */}
            <h2 className="text-lg font-bold mb-1 mt-6">Paper (mm)</h2>
            <div className="space-y-4">
              <div className="relative">
                <label className="text-xs block mb-1">Format</label>
                <select
                  className="w-full p-2 pr-10 border rounded appearance-none bg-white"
                  value={selectedFormat}
                  onChange={(e) => handleFormatChange(e.target.value)}
                >
                  <option value="A5">A5 (148×210mm)</option>
                  <option value="A4">A4 (210×297mm)</option>
                  <option value="A3">A3 (297×420mm)</option>
                  <option value="A2">A2 (420×594mm)</option>
                  {selectedFormat === 'custom' && <option value="custom">Custom</option>}
                </select>
                <div className="pointer-events-none absolute right-2 top-8">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
                <div>
                  <label className="text-xs block mb-1">Width</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={paperConfig.width}
                    onChange={(e) => handleDimensionChange('width', Number(e.target.value))}
                  />
                </div>
                <button 
                  className="p-2 border rounded bg-gray-50 hover:bg-gray-100"
                  onClick={() => setPaperConfig({
                      ...paperConfig,
                      width: paperConfig.height,
                      height: paperConfig.width
                    })}
                >
                  <ArrowLeftRight size={16} />
                </button>
                <div>
                  <label className="text-xs block mb-1">Height</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={paperConfig.height}
                    onChange={(e) => handleDimensionChange('height', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>  
  
            {/* MARGINS */}
            <h2 className="text-lg font-bold mb-1 mt-6">Margins (mm)</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs block mb-1">Top</label>
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
                  <label className="text-xs block mb-1">Right</label>
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
                  <label className="text-xs block mb-1">Bottom</label>
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
                  <label className="text-xs block mb-1">Left</label>
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
              
            {/* BUTTONS */}
            <div className="space-y-2 mt-6">
              <button 
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={() => fileInputRef.current?.click()}
              >
                Import SVG
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".svg"
                onChange={handleFileUpload}
              />
  
              {/* <button 
                className={`w-full p-2 rounded ${
                  svgContent 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                onClick={handleGenerateGcode}
                disabled={!svgContent}
              >
                Slice into gcode
              </button> */}
            </div>
          </div>
        </div>
  
        {/* Prévisualisation */}
        <div className="border rounded-lg md:col-span-2 bg-gray-100 min-h-0">
          <div className="w-full h-full overflow-hidden preview-container touch-none">
            <svg
              viewBox={`0 0 ${canvas.width} ${canvas.height}`}
              className="w-full h-full bg-gray-100"
              onWheel={(e) => {
                e.preventDefault();  // Empêcher le zoom du navigateur
                handleWheel(e);
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <g transform={`translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.scale})`}>
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
                  <circle cx={(canvas.width - machineConfig.width) /2} cy={(canvas.height - machineConfig.height) /2} r="13" fill="#2463EB" />
  
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
                  <circle cx={canvas.width - (canvas.width - machineConfig.width) /2} cy={(canvas.height - machineConfig.height) /2} r="13" fill="#2463EB" />
                  
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
                    fill="#2463EB"
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
                    stroke="gray"
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
                    strokeWidth=".5"
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
                {generatedGcode && 
                  <GCodePreview gcode={generatedGcode}/>
                }
              </g>
            </svg>
          </div>
        </div>

        {/* Web serial */}
        <div className="border rounded-lg">
          <div className="p-4 control-panel-scroll">
            <SerialConnection 
              ref={setSerialConnectionRef}
            />

          <h2 className="text-lg font-bold mt-6">Gcode by colors</h2>
          {/* TIME */}
            {generatedGcode && (
              <div>
                {Object.entries(generatedGcode).map(([color, gcode]) => (
                  <div key={color} className="pt-3 bg-white rounded-lg shadow-sm">
                    {/* Header avec couleur et temps */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2" 
                          style={{backgroundColor: color}}
                        ></div>
                        <span className="text-sm font-medium">{color}</span>
                      </div>
                      {timeEstimations[color] && (
                        <span className="text-xs text-gray-600">
                          ⏱️ {timeEstimations[color].formattedTime}
                        </span>
                      )}
                    </div>

                    <div className="flex space-x-2">
                      {/* Bouton Streaming */}
                      <button
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                          serialConnectionRef?.isConnected && !serialConnectionRef?.isStreaming
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={() => handleStreamGCode(color, gcode)}
                        disabled={!serialConnectionRef?.isConnected || serialConnectionRef?.isStreaming}
                      >
                        ⚡ Draw
                      </button>

                      {/* Bouton Download */}
                      <button
                        className="flex-1 px-3 py-2 rounded text-sm font-medium transition-colors bg-blue-500 text-white hover:bg-blue-600"
                        onClick={() => handleDownloadGCode(color, gcode)}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlotterApp;