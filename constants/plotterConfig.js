// constants/plotterConfig.js

// Dimensions réelles du plotter
export const PLOTTER_MIN_X = -126.225;
export const PLOTTER_MAX_X = 126.225;
export const PLOTTER_MIN_Y = -124.801;
export const PLOTTER_MAX_Y = 124.801;
export const PLOTTER_WIDTH = PLOTTER_MAX_X - PLOTTER_MIN_X;  // 252.45
export const PLOTTER_HEIGHT = PLOTTER_MAX_Y - PLOTTER_MIN_Y; // 249.602

export const DEFAULT_MACHINE_CONFIG = {
    width: 650,
    height: 1000,
};

// Formats de papier standards
export const PAPER_FORMATS = {
  'A5': { width: 148, height: 210 },
  'A4': { width: 210, height: 297 },
  'A3': { width: 297, height: 420 },
  'A2': { width: 420, height: 594 },
  'B2': { width: 500, height: 707 },
};