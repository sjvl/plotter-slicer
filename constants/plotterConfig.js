// plotterConfig.js
// Configurations des différentes machines
export const MACHINE_CONFIGS = {
  'A5': { 
    width: 300, 
    height: 400,
    name: 'Machine A5'
  },
  'Classic': { 
    width: 650, 
    height: 1000,
    name: 'Machine Classique'
  }
};

export const DEFAULT_MACHINE_CONFIG = MACHINE_CONFIGS['A5'];

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

// BUG A INVESTIGUER
// //après avoir lancé un print, si je charge un nouveau svg et que je print, ça print l'ancien

// FIRMWARE (Configuration.h)
//
// #define X_BED_SIZE 300 //650 (ligne 1912)
// #define Y_BED_SIZE 400 //476 //1000 (ligne 1913)
//
// #define HYPOTENEUSE_LENGTH_AT_HOME_POSITION 462.7 //1035.0 (ligne 997)
//
// #define MANUAL_Y_HOME_POS -197.65 //-482.65 (ligne 2357)
// ATTENTION FORMULE FAUSSE...c'est plus proche de - (H/2) - (35 / 2)
// CE N'EST PAS (H / 2 - (sqrt(sq(HYPOTENEUSE_MAX) - sq(L / 2))))