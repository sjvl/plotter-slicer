import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function CustomFirmware() {
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(500);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);

  const calculate = () => {
    // Validation
    if (width % 2 !== 0 || height % 2 !== 0) {
      alert('⚠️ Width and height must be EVEN numbers!');
      return;
    }

    // Calculate maximum diagonal = PHYSICAL BELT LENGTH
    const beltPhysical = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height, 2));
    const beltPhysicalRounded = Math.ceil(beltPhysical);

    // POLARGRAPH_MAX_BELT_LEN = physical length + 35mm (added in firmware)
    const beltLen = beltPhysicalRounded + 35;

    // Calculations for Configuration.h
    const xMin = -width / 2;
    const xMax = width / 2;
    const yMin = -height / 2;
    const yMax = height / 2;

    // Calculate Y_HOME
    const yHome = yMax - Math.sqrt(Math.pow(beltLen, 2) - Math.pow(width / 2, 2));

    setResults({
      beltPhysical,
      beltPhysicalRounded,
      beltLen,
      xMin,
      xMax,
      yMin,
      yMax,
      yHome
    });
    setShowResults(true);
  };

  const copyConfig = () => {
    if (!results) return;

    const code = `// ========================================
// CUSTOM MAKELANGELO CONFIGURATION
// Dimensions: ${width}×${height}mm
// Calculated diagonal: ${results.beltPhysical.toFixed(2)}mm
// Physical belts: ${results.beltPhysicalRounded}mm
// Firmware (with +35mm): ${results.beltLen}mm
// ========================================

// 1. MACHINE DIMENSIONS
#define X_BED_SIZE ${width}     // Width (mm)
#define Y_BED_SIZE ${height}     // Height (mm)

// 2. WORK AREA LIMITS
#define X_MIN_POS ${results.xMin}
#define Y_MIN_POS ${results.yMin}
#define X_MAX_POS ${results.xMax}
#define Y_MAX_POS ${results.yMax}

// 3. BELT LENGTH (physical length + 35mm losses)
#define POLARGRAPH_MAX_BELT_LEN ${results.beltLen.toFixed(1)}  // ${results.beltPhysicalRounded} + 35

// 4. HOME POSITION
#define MANUAL_X_HOME_POS 0
#define MANUAL_Y_HOME_POS ${results.yHome.toFixed(2)}  // Y_MAX - sqrt(${results.beltLen}² - ${width / 2}²)`;

    navigator.clipboard.writeText(code).then(() => {
      alert('✅ Configuration copied!');
    }).catch(() => {
      alert('❌ Copy error');
    });
  };

  return (
    <>
      <Head>
        <title>Custom Firmware - Plotter slicer</title>
      </Head>

      {/* Wrapper with forced scroll */}
      <div className="h-screen overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto p-6">
          {/* Back button */}
          <Link href="/">
            <a className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </a>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Custom belts & firmware</h1>
            <p className="text-gray-600">Configurator for custom machine</p>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Prerequisites:</strong> Keep the <strong>same physical hardware</strong> as the original Makelangelo 5. Only the <strong>dimensions</strong> change.
            </p>
          </div>

          {/* Calculator */}
          <div className="bg-white rounded-lg border p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">🧮 Configurator</h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Machine width (mm)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value))}
                  step="2"
                  className="w-full p-2 border rounded"
                />
                <small className="text-gray-500">Must be EVEN</small>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Machine height (mm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value))}
                  step="2"
                  className="w-full p-2 border rounded"
                />
                <small className="text-gray-500">Must be EVEN</small>
              </div>
            </div>

            <button
              onClick={calculate}
              className="w-full py-3 bg-gray-800 hover:bg-black text-white rounded font-medium transition"
            >
              🔄 Calculate
            </button>

            {/* Belt Length */}
            {showResults && results && (
              <div className="bg-green-600 text-white rounded-lg p-6 text-center mt-4">
                <div className="text-xl tracking-wide mb-2 opacity-75">
                  Belt length: {results.beltPhysicalRounded} mm
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {showResults && results && (
            <div className="space-y-6">
              

              {/* Calculation details */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="font-bold mb-3">📐 Detailed calculation</h3>

                <div className="space-y-3">
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-800">
                    <strong className="block mb-2 text-sm">Maximum diagonal = Physical belt length</strong>
                    <code className="block text-xs bg-white p-2 rounded">
                      Diagonal = √((Width/2)² + Height²)<br />
                      Diagonal = √(({width}/2)² + {height}²)<br />
                      Diagonal = <strong>{results.beltPhysical.toFixed(2)} mm</strong> (rounded: {results.beltPhysicalRounded} mm)
                    </code>
                  </div>

                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-600">
                    <strong className="block mb-2 text-sm">In the firmware, we add 35mm for mechanical losses</strong>
                    <code className="block text-xs bg-white p-2 rounded">
                      POLARGRAPH_MAX_BELT_LEN = {results.beltPhysicalRounded} + 35 = <strong>{results.beltLen} mm</strong>
                    </code>
                    <small className="block mt-2 text-gray-600 text-xs">
                      The 35mm compensate for the pen holder, pulleys and switches
                    </small>
                  </div>

                  <div className="bg-green-50 p-3 rounded border-l-4 border-green-600">
                    <strong className="text-green-800 text-sm">
                      ✅ Order/manufacture GT2 belts of {results.beltPhysicalRounded}mm
                    </strong>
                    <small className="block mt-1 text-green-700 text-xs">
                      The +35mm are added in the firmware, not on the physical belt!
                    </small>
                  </div>
                </div>
              </div>

              {/* Code configuration */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="font-bold mb-3">✅ Configuration for Configuration.h</h3>
                <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
{`// ========================================
// CUSTOM MAKELANGELO CONFIGURATION
// Dimensions: ${width}×${height}mm
// Calculated diagonal: ${results.beltPhysical.toFixed(2)}mm
// Physical belts: ${results.beltPhysicalRounded}mm
// Firmware (with +35mm): ${results.beltLen}mm
// ========================================

// 1. MACHINE DIMENSIONS
#define X_BED_SIZE ${width}     // Width (mm)
#define Y_BED_SIZE ${height}     // Height (mm)

// 2. WORK AREA LIMITS
#define X_MIN_POS ${results.xMin}
#define Y_MIN_POS ${results.yMin}
#define X_MAX_POS ${results.xMax}
#define Y_MAX_POS ${results.yMax}

// 3. BELT LENGTH (physical length + 35mm losses)
#define POLARGRAPH_MAX_BELT_LEN ${results.beltLen.toFixed(1)}  // ${results.beltPhysicalRounded} + 35

// 4. HOME POSITION
#define MANUAL_X_HOME_POS 0
#define MANUAL_Y_HOME_POS ${results.yHome.toFixed(2)}  // Y_MAX - sqrt(${results.beltLen}² - ${width / 2}²)`}
                </pre>

                <button
                  onClick={copyConfig}
                  className="w-full mt-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition"
                >
                  📋 Copy code
                </button>
              </div>
            </div>
          )}

          {/* Formula reference */}
          <div className="bg-white rounded-lg border p-6 mt-6">
            <h2 className="text-xl font-bold mb-4">📐 Reference formulas</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-semibold">Parameter</th>
                    <th className="text-left p-2 font-semibold">Formula</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">X_MIN_POS</code></td>
                    <td className="p-2"><code className="text-xs">-X_BED_SIZE / 2</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">X_MAX_POS</code></td>
                    <td className="p-2"><code className="text-xs">X_BED_SIZE / 2</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">Y_MIN_POS</code></td>
                    <td className="p-2"><code className="text-xs">-Y_BED_SIZE / 2</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">Y_MAX_POS</code></td>
                    <td className="p-2"><code className="text-xs">Y_BED_SIZE / 2</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">POLARGRAPH_MAX_BELT_LEN</code></td>
                    <td className="p-2"><code className="text-xs">Physical_belt_length + 35</code></td>
                  </tr>
                  <tr>
                    <td className="p-2"><code className="bg-gray-100 px-2 py-1 rounded text-xs">MANUAL_Y_HOME_POS</code></td>
                    <td className="p-2"><code className="text-xs">Y_MAX_POS - √(BELT_LEN² - (X_BED_SIZE/2)²)</code></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-3">
              <h4 className="font-semibold text-sm">🧮 Examples:</h4>
              
              <div className="bg-gray-50 p-3 rounded border text-xs">
                <strong>400×600mm machine:</strong><br />
                Diagonal = 632mm → BELT_LEN = 668mm → Y_HOME = -337.17
              </div>
              
              <div className="bg-gray-50 p-3 rounded border text-xs">
                <strong>650×1000mm machine (Makelangelo 5):</strong><br />
                Diagonal = 1052mm → BELT_LEN = 1087mm → Y_HOME = -538.07
              </div>
            </div>
          </div>

          {/* Steps after modification */}
          <div className="bg-white rounded-lg border p-6 mt-6">
            <h2 className="text-xl font-bold mb-4">🚀 After modification</h2>
            
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <div>
                  <strong className="block">Compile and flash</strong>
                  <p className="text-sm text-gray-600">Use PlatformIO or Arduino IDE</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <div>
                  <strong className="block">Initialize EEPROM</strong>
                  <pre className="bg-gray-900 text-green-400 p-2 rounded text-xs mt-1">M502 ; M500 ; M503</pre>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                <div>
                  <strong className="block">Test</strong>
                  <p className="text-sm text-gray-600">HOME without belts, check switches</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-bold">4</span>
                <div>
                  <strong className="block">Synchronize plotterConfig.js</strong>
                  <p className="text-sm text-gray-600">Set the same dimensions in your app</p>
                </div>
              </li>
            </ol>
          </div>

          {/* References */}
          <div className="bg-white rounded-lg border p-6 mt-6 mb-12">
            <h2 className="text-xl font-bold mb-3">📚 References</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://www.marginallyclever.com/2021/10/friday-facts-4-how-to-marlin-polargraph/" 
                   target="_blank" 
                   rel="noreferrer"
                   className="text-blue-600 hover:underline">
                  Friday Facts 4: How to Marlin Polargraph
                </a>
              </li>
              <li>
                <a href="https://github.com/MarginallyClever/Marlin-polargraph" 
                   target="_blank" 
                   rel="noreferrer"
                   className="text-blue-600 hover:underline">
                  Marlin-polargraph on GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}