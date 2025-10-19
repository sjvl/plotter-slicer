// components/GCodePanel.js

import React from 'react';
import SerialConnection from './SerialConnection';

const GCodePanel = ({
  serialConnectionRef,
  onSerialConnectionRef,
  generatedGcode,
  timeEstimations,
  fileName,
  onStreamGCode,
  onDownloadGCode
}) => {
  return (
    <div className="border rounded-lg">
      <div className="p-4 control-panel-scroll">
        <SerialConnection 
          ref={onSerialConnectionRef}
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
        )}
      </div>
    </div>
  );
};

export default GCodePanel;