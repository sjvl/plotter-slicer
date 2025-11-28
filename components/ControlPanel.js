// components/ControlPanel.js

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';

const ControlPanel = ({
  speedSettings,
  onSpeedChange,
  pointJoiningRadius,
  onPointJoiningRadiusChange,
  optimizePaths,
  onOptimizePathsChange,
  paperConfig,
  onPaperConfigChange,
  selectedFormat,
  onFormatChange,
  paperFormats,
  selectedMachine,
  onMachineChange,
  machineConfigs
}) => {
  const handleDimensionChange = (dimension, value) => {
    const newConfig = {
      ...paperConfig,
      [dimension]: value
    };
    onPaperConfigChange(newConfig);
  
    // Vérifier si les dimensions correspondent à un format standard
    const formatMatch = Object.entries(paperFormats).find(([_, dims]) => 
      dims.width === newConfig.width && dims.height === newConfig.height
    );
    
    onFormatChange(formatMatch ? formatMatch[0] : 'custom');
  };

  const handleFormatChange = (format) => {
    onFormatChange(format);
    onPaperConfigChange({
      ...paperConfig,
      width: paperFormats[format].width,
      height: paperFormats[format].height
    });
  };

  const handleRotate = () => {
    onPaperConfigChange({
      ...paperConfig,
      width: paperConfig.height,
      height: paperConfig.width
    });
  };

  return (
    <div className="border rounded-lg">
      <div className="p-4 control-panel-scroll">
        <h1 className="text-3xl font-bold">Plotter slicer</h1>
        <p className="text-xs mb-4">
          for <a href="https://www.marginallyclever.com/" target="_blank" rel="noreferrer" className="text-blue-500 no-underline hover:text-blue-700">Makelangelo 5</a> by <a href="https://sjvl.notion.site/" target="_blank" rel="noreferrer" className="text-blue-500 no-underline hover:text-blue-700">sjvl</a>
        </p>

        <div className="space-y-4">
          {/* MACHINE SELECTION */}
          <div>
            <h2 className="text-lg font-bold mb-1 mt-6">Machine</h2>
            <div className="relative">
              <select
                className="w-full p-2 border rounded appearance-none bg-white pr-8"
                value={selectedMachine}
                onChange={(e) => onMachineChange(e.target.value)}
              >
                {Object.entries(machineConfigs).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* SPEED */}
            <div>
              <h2 className="text-lg font-bold mb-1 mt-6">Speed (mm/s)</h2>
              <input
                type="number"
                className="w-full p-2 border rounded"
                min="1000"
                max="3000"
                step="100"
                value={speedSettings.travelSpeed}
                onChange={(e) => onSpeedChange('travelSpeed', e.target.value)}
              />
            </div>
            
            {/* SIMPLIFICATION */}
            <div>
              <h2 className="text-lg font-bold mb-1 mt-6">Point joining (mm)</h2>
              <input
                type="number"
                className="w-full p-2 border rounded"
                min="0"
                max="5"
                step="0.1"
                value={pointJoiningRadius}
                onChange={(e) => onPointJoiningRadiusChange(Number(e.target.value))}
              />
            </div>
          </div>

          {/* OPTIMIZE PATHS */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="optimizePaths"
              className="w-4 h-4"
              checked={optimizePaths}
              onChange={(e) => onOptimizePathsChange(e.target.checked)}
            />
            <label htmlFor="optimizePaths" className="text-sm">
              Path Optimization
            </label>
          </div>

        {/* PAPER */}
        <h2 className="text-lg font-bold mb-1 mt-6">Paper (mm)</h2>
        <div className="space-y-4">
          <div className="relative">
            <select
              className="w-full p-2 border rounded appearance-none bg-white pr-8"
              value={selectedFormat}
              onChange={(e) => handleFormatChange(e.target.value)}
            >
              <option value="A5">A5 (148×210)</option>
              <option value="A4">A4 (210×297)</option>
              <option value="A3">A3 (297×420)</option>
              <option value="A2">A2 (420×594)</option>
              <option value="B2">B2 (500×707)</option>
              {selectedFormat === 'custom' && <option value="custom">Custom</option>}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
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
              onClick={handleRotate}
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
                onChange={(e) => onPaperConfigChange({
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
                onChange={(e) => onPaperConfigChange({
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
                onChange={(e) => onPaperConfigChange({
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
                onChange={(e) => onPaperConfigChange({
                  ...paperConfig,
                  marginLeft: Number(e.target.value)
                })}
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;