// components/PreviewCanvas.js

import React, { useEffect, useRef } from 'react';
import { PLOTTER_MIN_X, PLOTTER_MAX_Y, PLOTTER_WIDTH, PLOTTER_HEIGHT } from '../constants/plotterConfig';

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
      const correctionX = PLOTTER_WIDTH / paperConfig.width;
      const correctionY = PLOTTER_HEIGHT / paperConfig.height;
    
      const relativeX = (x - PLOTTER_MIN_X) / PLOTTER_WIDTH;
      const relativeY = (PLOTTER_MAX_Y - y) / PLOTTER_HEIGHT;
    
      const paperX = relativeX * paperConfig.width * correctionX;
      const paperY = relativeY * paperConfig.height * correctionY;
      
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

    const gcodeByColor = typeof gcode === 'string' 
      ? { blue: gcode }
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
              x={(canvas.width - machineConfig.width) /2}
              y={(canvas.height - machineConfig.height) /2}
              width={machineConfig.width}
              height={machineConfig.height}
              fill="#e9e9e9"
              stroke="gray"
              strokeWidth="0.5"
            />

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
  );
};

export default PreviewCanvas;