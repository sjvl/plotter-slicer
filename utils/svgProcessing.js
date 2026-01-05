// utils/svgProcessing.js

/**
 * Normalise une couleur en nom de couleur de base
 * @param {string} color - Couleur au format hex, rgb, hsl ou nom
 * @returns {string} Nom de la couleur de base la plus proche
 */
export function normalizeColor(color) {
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

/**
* Extrait la couleur de stroke d'un élément SVG en remontant l'arbre DOM
* @param {Element} element - Élément SVG
* @returns {string} Nom de la couleur normalisée
*/
export function getStrokeColor(element) {
  let currentElement = element;

  // Remonter l'arbre DOM jusqu'à trouver un stroke ou atteindre la racine
  while (currentElement && currentElement.tagName !== 'svg') {
    // Vérifier d'abord le style inline
    const style = currentElement.getAttribute('style');
    if (style) {
      const strokeMatch = style.match(/stroke:\s*([^;]+)/);
      if (strokeMatch && strokeMatch[1] !== 'none') {
        return normalizeColor(strokeMatch[1]);
      }
    }
    
    // Ensuite vérifier l'attribut stroke
    const stroke = currentElement.getAttribute('stroke');
    if (stroke && stroke !== 'none') {
      return normalizeColor(stroke);
    }
    
    // Remonter au parent
    currentElement = currentElement.parentElement;
  }

  // Si pas de stroke mais un fill, essayer le fill de l'élément original
  const fill = element.getAttribute('fill');
  if (fill && fill !== 'none') {
    return normalizeColor(fill);
  }

  // Par défaut, noir
  return 'black';
}
  
  /**
   * Calcule un point sur une courbe de Bézier cubique
   */
  function cubicBezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
    };
  }
  
  /**
   * Convertit un segment de courbe de Bézier cubique en polyline
   */
  function cubicBezierToPolyline(p0, p1, p2, p3) {
    // Calcul des distances entre les points de contrôle
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const d3 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
    
    // Distance totale du chemin de contrôle
    const totalDistance = d1 + d2 + d3;
    
    // Mesure de la "courbure"
    const straightDistance = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const curvatureRatio = totalDistance / straightDistance;
  
    // Calcul du nombre de segments
    let segments;
    if (curvatureRatio < 1.1) {
      segments = 8;
    } else if (curvatureRatio < 1.5) {
      segments = 16;
    } else if (curvatureRatio < 2) {
      segments = 32;
    } else if (curvatureRatio < 3) {
      segments = 64;
    } else {
      segments = 128;
    }
  
    let points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = cubicBezierPoint(t, p0, p1, p2, p3);
      points.push(`${point.x},${point.y}`);
    }
    
    return points;
  }
  
  /**
   * Calcule un point sur une courbe de Bézier quadratique
   */
  function quadraticBezierPoint(t, p0, p1, p2) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    
    return {
      x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
      y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y
    };
  }
  
  /**
   * Convertit un segment de courbe de Bézier quadratique en polyline
   */
  function quadraticToPolyline(p0, p1, p2) {
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    
    const totalDistance = d1 + d2;
    const straightDistance = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const curvatureRatio = totalDistance / straightDistance;
  
    let segments;
    if (curvatureRatio < 1.1) {
      segments = 6;
    } else if (curvatureRatio < 1.3) {
      segments = 12;
    } else if (curvatureRatio < 1.7) {
      segments = 24;
    } else if (curvatureRatio < 2.2) {
      segments = 48;
    } else {
      segments = 96;
    }
  
    let points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = quadraticBezierPoint(t, p0, p1, p2);
      points.push(`${point.x},${point.y}`);
    }
    
    return points;
  }
  
  /**
   * Convertit un cercle en path
   */
  function circleToPath(cx, cy, r) {
    const segments = 
      r <= 10 ? 16 :
      r <= 50 ? 32 :
      r <= 100 ? 64 :
      128;
    let d = `M ${cx + r} ${cy}`;
    
    for (let i = 1; i <= segments; i++) {
      const theta = (i * 2 * Math.PI) / segments;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      d += ` L ${x} ${y}`;
    }
    
    d += ` L ${cx + r} ${cy}`;
    return d;
  }
  
  /**
   * Normalise toutes les formes SVG en paths
   * @param {string} svgContent - Contenu SVG en string
   * @returns {string} SVG normalisé avec toutes les formes converties en paths
   */
  export function normalizeSvgShapes(svgContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');
  
    // Traiter les paths avec courbes de Bézier
    svg.querySelectorAll('path').forEach(path => {
      const d = path.getAttribute('d');
      if (d.includes('Q') || d.includes('q') || d.includes('C') || d.includes('c') || d.includes('T') || d.includes('t')) {
        const pathData = d
          .replace(/([A-Za-z])/g, ' $1 ')
          .replace(/,/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/-/g, ' -')
          .trim()
          .split(/\s+/);
        
        let newPath = '';
        let currentX = 0, currentY = 0;
        let firstX = 0, firstY = 0;
        let lastControlX = 0, lastControlY = 0;
        
        for (let i = 0; i < pathData.length;) {
          const command = pathData[i];
          
          switch (command.toUpperCase()) {
            case 'M':
              currentX = parseFloat(pathData[i + 1]);
              currentY = parseFloat(pathData[i + 2]);
              if (command === 'm' && i > 0) {
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
              const isRelativeT = command === 't';
              let tx = parseFloat(pathData[i + 1]);
              let ty = parseFloat(pathData[i + 2]);
              
              if (isRelativeT) {
                tx += currentX;
                ty += currentY;
              }
              
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
      path.setAttribute('d', `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} L ${x} ${y}`);
      path.setAttribute('data-color', getStrokeColor(rect));
      
      Array.from(rect.attributes).forEach(attr => {
        if (attr.name !== 'x' && attr.name !== 'y' && 
            attr.name !== 'width' && attr.name !== 'height') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      rect.parentNode.replaceChild(path, rect);
    });
  
    // Convertir circle en path
    svg.querySelectorAll('circle').forEach(circle => {
      const cx = parseFloat(circle.getAttribute('cx') || 0);
      const cy = parseFloat(circle.getAttribute('cy') || 0);
      const r = parseFloat(circle.getAttribute('r'));
      
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute('d', circleToPath(cx, cy, r));
      path.setAttribute('data-color', getStrokeColor(circle));
      
      Array.from(circle.attributes).forEach(attr => {
        if (attr.name !== 'cx' && attr.name !== 'cy' && attr.name !== 'r') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      circle.parentNode.replaceChild(path, circle);
    });
  
    // Convertir line en path
    svg.querySelectorAll('line').forEach(line => {
      const x1 = parseFloat(line.getAttribute('x1') || 0);
      const y1 = parseFloat(line.getAttribute('y1') || 0);
      const x2 = parseFloat(line.getAttribute('x2') || 0);
      const y2 = parseFloat(line.getAttribute('y2') || 0);
      
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
      path.setAttribute('data-color', getStrokeColor(line));
      
      Array.from(line.attributes).forEach(attr => {
        if (!['x1', 'y1', 'x2', 'y2'].includes(attr.name)) {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      line.parentNode.replaceChild(path, line);
    });
  
    // Convertir polygon/polyline en path
    svg.querySelectorAll('polygon, polyline').forEach(poly => {
      const points = poly.getAttribute('points')
        .trim()
        .replace(/,/g, ' ')
        .split(/\s+/)
        .map(Number);
  
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      
      let d = `M ${points[0]} ${points[1]}`;
      for (let i = 2; i < points.length; i += 2) {
        d += ` L ${points[i]} ${points[i + 1]}`;
      }
      
      if (poly.tagName.toLowerCase() === 'polygon') {
        d += ` L ${points[0]} ${points[1]}`;
      }
      
      path.setAttribute('d', d);
      path.setAttribute('data-color', getStrokeColor(poly));
      
      Array.from(poly.attributes).forEach(attr => {
        if (attr.name !== 'points') {
          path.setAttribute(attr.name, attr.value);
        }
      });
      
      poly.parentNode.replaceChild(path, poly);
    });
  
    return svg.outerHTML;
  }
  
  /**
   * Charge et traite un fichier SVG
   * @param {string} text - Contenu du fichier SVG
   * @param {Function} setSvgContent - Setter pour le contenu SVG
   * @param {Function} setSvgViewBox - Setter pour le viewBox
   */
  export async function loadSvgContent(text, setSvgContent, setSvgViewBox) {
    const normalizedSvg = normalizeSvgShapes(text);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(normalizedSvg, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
  
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tempSvg.style.position = 'absolute';
    tempSvg.style.visibility = 'hidden';
    tempSvg.innerHTML = text.replace(/<svg[^>]*>|<\/svg>/g, '');
    document.body.appendChild(tempSvg);
    
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
    
    const bounds = viewBoxBounds || pathBounds || {
      minX: 0,
      minY: 0,
      maxX: parseFloat(svgElement.getAttribute('width')) || 100,
      maxY: parseFloat(svgElement.getAttribute('height')) || 100
    };
  
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    
    setSvgContent(normalizedSvg);
    setSvgViewBox({ 
      width, 
      height,
      minX: bounds.minX,
      minY: bounds.minY
    });
  }