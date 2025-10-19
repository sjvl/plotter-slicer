import React, { useState, useEffect } from 'react';
import { useDragAndDrop } from '../hooks/useDragAndDrop';

import { PAPER_FORMATS, DEFAULT_MACHINE_CONFIG } from '../constants/plotterConfig';

import ControlPanel from './ControlPanel';
import PreviewCanvas from './PreviewCanvas';
import GCodePanel from './GCodePanel';

import { loadSvgContent as loadSvgContentUtil } from '../utils/svgProcessing';
import { generateGcode } from '../utils/gcodeGenerator';

const PlotterApp = () => {
  // ========== CONFIG ==========
  const [paperConfig, setPaperConfig] = useState({
    width: 297,
    height: 420,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0
  });
  const [selectedFormat, setSelectedFormat] = useState('A3');
  const paperFormats = PAPER_FORMATS;
  const [machineConfig] = useState(DEFAULT_MACHINE_CONFIG);
  const [canvas] = useState({
    width: 1100,
    height: 1100,
  });

  // ========== SVG ==========
  const [svgContent, setSvgContent] = useState(null);
  const [svgViewBox, setSvgViewBox] = useState({ width: 0, height: 0 });
  const [fileName, setFileName] = useState(null);
  const loadSvgContent = async (text) => { 
    await loadSvgContentUtil(text, setSvgContent, setSvgViewBox);
  };

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragAndDrop(loadSvgContent, setFileName);

  // ========== GCODE ==========
  const [speedSettings, setSpeedSettings] = useState({travelSpeed: 150});
  const [pointJoiningRadius, setPointJoiningRadius] = useState(0.5);
  const [optimizePaths, setOptimizePaths] = useState(true);
  const [debouncedParams, setDebouncedParams] = useState({
    pointJoiningRadius,
    optimizePaths,
    speedSettings,
    paperConfig
  });
  const [generatedGcode, setGeneratedGcode] = useState(null);
  const [timeEstimations, setTimeEstimations] = useState({});

  // ========== PREVIEW ==========
  const [viewTransform, setViewTransform] = useState({
    scale: 1,
    x: 0,
    y: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // ========== SERIAL ==========
  const [serialConnectionRef, setSerialConnectionRef] = useState(null);


  const handleStreamGCode = async (color, gcode) => {    
    const baseFilename = fileName || 'output';
    const jobName = `${baseFilename}-${color}`;
    
    try {
        await serialConnectionRef.streamGcode(gcode, jobName);
        alert(`✅ Streaming de "${color}" terminé avec succès !`);
    } catch (error) {
        alert(`❌ Erreur streaming: ${error.message}`);
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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.svg')) {
      const text = await file.text();
      setFileName(file.name.replace('.svg', ''));
      await loadSvgContent(text);
      
      // Réinitialiser l'input pour permettre de recharger le même fichier
      event.target.value = '';
    }
  };

  const handleGenerateGcode = () => {
    if (!svgContent || !svgViewBox) return;
    
    const result = generateGcode(
      svgContent, 
      paperConfig, 
      svgViewBox, 
      machineConfig,
      optimizePaths,
      pointJoiningRadius,
      speedSettings  // ← Ajouter ce paramètre
    );
    
    setGeneratedGcode(result.gcodeByColor);
    setTimeEstimations(result.timeEstimationByColor);
  };

  const handleDownloadGCode = (color, gcode) => {
    const baseFilename = fileName || 'output';
    const filename = `${baseFilename}-${color}.gcode`;
    
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };


  // Debounce de 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams({
        pointJoiningRadius,
        optimizePaths,
        speedSettings,
        paperConfig
      });
    }, 500); // Attendre 500ms après le dernier changement
  
    return () => clearTimeout(timer);
  }, [pointJoiningRadius, optimizePaths, speedSettings, paperConfig]);

  // Reset du gcode quand la config change
  useEffect(() => {
    setGeneratedGcode(null);
  }, [svgContent, paperConfig, speedSettings, pointJoiningRadius, optimizePaths]); 

  useEffect(() => {
    setGeneratedGcode(null);
    if (svgContent && svgViewBox) {
      handleGenerateGcode();
    }
  }, [svgContent, debouncedParams]);

  return (
    <div className="p-4 max-w-screen-xxl mx-auto h-screen flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 min-h-0">
        
        {/* Panneau de contrôle */}
        <ControlPanel
          speedSettings={speedSettings}
          onSpeedChange={handleSpeedChange}
          pointJoiningRadius={pointJoiningRadius}
          onPointJoiningRadiusChange={setPointJoiningRadius}
          optimizePaths={optimizePaths}
          onOptimizePathsChange={setOptimizePaths}
          paperConfig={paperConfig}
          onPaperConfigChange={setPaperConfig}
          selectedFormat={selectedFormat}
          onFormatChange={setSelectedFormat}
          paperFormats={paperFormats}
        />
  
        {/* Prévisualisation */}
        <PreviewCanvas
          canvas={canvas}
          machineConfig={machineConfig}
          paperConfig={paperConfig}
          svgContent={svgContent}
          svgViewBox={svgViewBox}
          generatedGcode={generatedGcode}
          viewTransform={viewTransform}
          setViewTransform={setViewTransform}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          dragStart={dragStart}
          setDragStart={setDragStart}
          isDragOver={isDragOver}
          handleDragEnter={handleDragEnter}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
        />

        {/* gcode panel */}
        <GCodePanel
          serialConnectionRef={serialConnectionRef}
          onSerialConnectionRef={setSerialConnectionRef}
          generatedGcode={generatedGcode}
          timeEstimations={timeEstimations}
          fileName={fileName}
          onStreamGCode={handleStreamGCode}
          onDownloadGCode={handleDownloadGCode}
          onFileUpload={handleFileUpload}
        />
      </div>
    </div>
  );
};

export default PlotterApp;