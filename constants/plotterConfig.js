// plotterConfig.js
export const DEFAULT_MACHINE_CONFIG = {
  width: 300, 
  height: 500,
};

// Le système de coordonnées est centré sur (0,0)
export const PLOTTER_MIN_X = -DEFAULT_MACHINE_CONFIG.width / 2;   // -325
export const PLOTTER_MAX_X = DEFAULT_MACHINE_CONFIG.width / 2;    // +325
export const PLOTTER_MIN_Y = -DEFAULT_MACHINE_CONFIG.height / 2;  // -500
export const PLOTTER_MAX_Y = DEFAULT_MACHINE_CONFIG.height / 2;   // +500
export const PLOTTER_WIDTH = DEFAULT_MACHINE_CONFIG.width;        // 650
export const PLOTTER_HEIGHT = DEFAULT_MACHINE_CONFIG.height;      // 1000

// Formats de papier standards
export const PAPER_FORMATS = {
  'A5': { width: 148, height: 210 },
  'A4': { width: 210, height: 297 },
  'A3': { width: 297, height: 420 },
  'A2': { width: 420, height: 594 },
  'B2': { width: 500, height: 707 },
};