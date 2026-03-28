// components/PreviewCanvas.js

import React, { useEffect, useRef } from 'react';

const PreviewCanvas = ({
  canvas,
  machineConfig,
  paperConfig,
  svgContent,
  svgViewBox,
  generatedGcode,
  viewTransform,
  setViewTransform,
  isDragging,
  setIsDragging,
  dragStart,
  setDragStart,
  isDragOver,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop
}) => {
  const svgRef = useRef(null);
  const PLOTTER_WIDTH = machineConfig.width;
  const PLOTTER_HEIGHT = machineConfig.height;

  const calculateDrawingArea = () => {
    const width = paperConfig.width - paperConfig.marginLeft - paperConfig.marginRight;
    const height = paperConfig.height - paperConfig.marginTop - paperConfig.marginBottom;
    return { width, height };
  };

  const calculateSvgTransform = () => {
    if (!svgViewBox?.width || !svgViewBox?.height) return 'scale(1)';
    
    const drawingArea = calculateDrawingArea();
    
    const svgWidth = Math.max(1, svgViewBox.width);
    const svgHeight = Math.max(1, svgViewBox.height);
    
    const scale = Math.min(
      drawingArea.width / svgWidth,
      drawingArea.height / svgHeight
    );
    
    const paperX = (canvas.width - paperConfig.width) / 2;
    const paperY = (canvas.height - paperConfig.height) / 2;
    
    const translateX = paperX + paperConfig.marginLeft - (svgViewBox.minX * scale) + 
                      (drawingArea.width - svgWidth * scale) / 2;
    const translateY = paperY + paperConfig.marginTop - (svgViewBox.minY * scale) + 
                      (drawingArea.height - svgHeight * scale) / 2;
    
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

  const handleWheel = (e) => {
    e.preventDefault();
    
    const svgElement = e.currentTarget;
    const bbox = svgElement.getBoundingClientRect();
    
    const mouseX = (e.clientX - bbox.left) / bbox.width;
    const mouseY = (e.clientY - bbox.top) / bbox.height;
  
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
  
    setViewTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * scaleFactor, 1), 10);
      
      if (newScale === 1) {
        return {
          scale: 1,
          x: 0,
          y: 0
        };
      }
      
      if (newScale === prev.scale) return prev;
  
      const refX = canvas.width * mouseX;
      const refY = canvas.height * mouseY;
  
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
    if (e.button === 1 || e.button === 0) {
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

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
  
    const handleWheelEvent = (e) => {
      e.preventDefault();
      handleWheel(e);
    };
  
    svg.addEventListener('wheel', handleWheelEvent, { passive: false });
  
    return () => {
      svg.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  // GCodePreview intégré
  const GCodePreview = ({ gcode }) => {
    if (!gcode) return null;
  
    const plotterToSvg = (x, y) => {
      // 1. Les coordonnées G-code sont en mm dans le référentiel du plotter
      // Le plotter a un centre à (0,0) et va de -325 à +325 en X et -500 à +500 en Y
      
      // 2. On doit les mapper vers les coordonnées du papier
      // Le papier est centré sur le canvas et a des dimensions paperConfig.width × paperConfig.height
      
      // Position du coin supérieur gauche du papier dans le canvas
      const paperX = (canvas.width - paperConfig.width) / 2;
      const paperY = (canvas.height - paperConfig.height) / 2;
      
      // Convertir les coordonnées plotter vers les coordonnées papier
      // Le papier est centré sur (0,0) du plotter
      const xInPaper = paperConfig.width / 2 + x;
      const yInPaper = paperConfig.height / 2 - y; // Y inversé
      
      return {
        x: paperX + xInPaper,
        y: paperY + yInPaper
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
  
    const gcodeByColor = typeof gcode === 'string' 
      ? { blue: gcode }
      : gcode;
  
    return (
      <>
        {Object.entries(gcodeByColor).map(([color, colorGcode]) => {
          const COLOR_HEX = {
            black: '#000000', white: '#808080', gray: '#808080',
            red: '#FF0000', orange: '#FFA500', yellow: '#FFFF00',
            green: '#008000', blue: '#0000FF', purple: '#800080',
            pink: '#FF69B4', brown: '#8B4513',
          };
          return (
          <path
            key={color}
            d={processGCode(colorGcode)}
            fill="none"
            stroke={COLOR_HEX[color] || '#000000'}
            strokeWidth="0.4"
            opacity="0.7"
          />);
        })}
      </>
    );
  };

  return (
    <div 
      className="border rounded-lg md:col-span-2 bg-gray-100 min-h-0 relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Overlay drag & drop */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg">
            <div className="text-blue-600 text-2xl font-bold text-center">
              📁 Drop SVG here
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full overflow-hidden preview-container">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          className="w-full h-full bg-gray-100"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ 
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          <g transform={`translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.scale})`}>
            {/* Zone de dessin totale du plotter */}
            <rect
              x={(canvas.width - PLOTTER_WIDTH) / 2}
              y={(canvas.height - PLOTTER_HEIGHT) / 2}
              width={PLOTTER_WIDTH}
              height={PLOTTER_HEIGHT}
              fill="#e9e9e9"
              stroke="gray"
              strokeWidth="0.5"
            />

            {/* Support machine - calculé proportionnellement */}
            <rect
              x={(canvas.width - PLOTTER_WIDTH) / 2 - 30}
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 45}
              width={PLOTTER_WIDTH + 60}
              height={60}
              fill="#c9bca1"
              stroke="grey"
              strokeWidth="0.5"
            />
            
            {/* Moteur gauche */}
            <rect
              x={(canvas.width - PLOTTER_WIDTH) / 2 - 25}
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 40}
              width={50}
              height={70}
              fill="#ab9c7e"
              stroke="grey"
              strokeWidth="0.5"
            />
            <rect 
              x={(canvas.width - PLOTTER_WIDTH) / 2 - 15} 
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 15} 
              width={30}
              height={30}
              fill="black" 
            />
            <circle 
              cx={(canvas.width - PLOTTER_WIDTH) / 2} 
              cy={(canvas.height - PLOTTER_HEIGHT) / 2} 
              r="13" 
              fill="#2463EB" 
            />

            {/* Moteur droit */}
            <rect
              x={(canvas.width + PLOTTER_WIDTH) / 2 - 25}
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 40}
              width={50}
              height={70}
              fill="#ab9c7e"
              stroke="grey"
              strokeWidth="0.5"
            />
            <rect 
              x={(canvas.width + PLOTTER_WIDTH) / 2 - 15} 
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 15} 
              width={30}
              height={30}
              fill="black" 
            />
            <circle 
              cx={(canvas.width + PLOTTER_WIDTH) / 2} 
              cy={(canvas.height - PLOTTER_HEIGHT) / 2} 
              r="13" 
              fill="#2463EB" 
            />
            
            {/* Ecran + SD - centré horizontalement */}
            <rect
              x={(canvas.width - PLOTTER_WIDTH) / 2 + 70}
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 35}
              width={150}
              height={40}
              fill="white"
              stroke="grey"
              strokeWidth=".5"
            />
            <rect
              x={(canvas.width - PLOTTER_WIDTH) / 2 + 80}
              y={(canvas.height - PLOTTER_HEIGHT) / 2 - 30}
              width={80}
              height={30}
              fill="#2463EB"
              stroke="grey"
              strokeWidth=".5"
            />
            <circle 
              cx={(canvas.width - PLOTTER_WIDTH) / 2 + 205} 
              cy={(canvas.height - PLOTTER_HEIGHT) / 2 -15} 
              r="6" 
              fill="black" 
            />

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

            {svgContent && !generatedGcode && (
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
  );
};

export default PreviewCanvas;