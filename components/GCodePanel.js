// components/GCodePanel.js

import React, { useRef } from 'react';
import SerialConnection from './SerialConnection';

const GCodePanel = ({
  serialConnectionRef,
  onSerialConnectionRef,
  generatedGcode,
  timeEstimations,
  fileName,
  onStreamGCode,
  onDownloadGCode,
  onFileUpload
}) => {
  const fileInputRef = useRef(null);

  return (
    <div className="border rounded-lg">
      <div className="p-4 control-panel-scroll">
        

        <h2 className="text-lg font-bold mt-6">File import</h2>
        {/* IMPORT SVG BUTTON */}
        <div className="space-y-2 mt-3">
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
            onChange={onFileUpload}
          />
        </div>

        {/* JOBS BY COLOR */}
        <div className="mb-6">
          <h2 className="text-lg font-bold mt-6">Gcode by colors</h2>
          
          {generatedGcode ? (
            <div className="space-y-3">
              {Object.entries(generatedGcode).map(([color, gcode]) => (
                <div key={color} className="pt-3 bg-white rounded-lg shadow-sm">
                  {/* Header avec couleur et temps */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{backgroundColor: color}}
                      ></div>
                      <span className="text-sm font-medium">{fileName}-{color}</span>
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
                      className={`flex-1 px-4 py-2 rounded text-m transition-colors ${
                        serialConnectionRef?.isConnected && !serialConnectionRef?.isStreaming
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      onClick={() => onStreamGCode(color, gcode)}
                      disabled={!serialConnectionRef?.isConnected || serialConnectionRef?.isStreaming}
                    >
                      Draw
                    </button>

                    {/* Bouton Download */}
                    <button
                      className="flex-1 px-4 py-2 rounded text-m transition-colors bg-blue-500 text-white hover:bg-blue-600"
                      onClick={() => onDownloadGCode(color, gcode)}
                    >
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center mt-3">
              <p className="text-sm text-gray-500">No G-code generated yet</p>
              <p className="text-xs text-gray-400 mt-1">Import or drag and drop an SVG file</p>
            </div>
          )}
        </div>

        <SerialConnection 
          ref={onSerialConnectionRef}
        />
      </div>
    </div>
  );
};

export default GCodePanel;