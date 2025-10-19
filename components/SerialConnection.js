import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const SerialConnection = forwardRef(({ onSendGcode }, ref) => {
    const [isConnected, setIsConnected] = useState(false);
    const [port, setPort] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputCommand, setInputCommand] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamProgress, setStreamProgress] = useState({ current: 0, total: 0, percent: 0 });
    const [toggleDebug, setToggleDebug] = useState(false)
    const [isPaused, setIsPaused] = useState(false);


    const readerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const jobAbortControllerRef = useRef(null);
    const workerRef = useRef(null);


    // Configuration
    const [serialConfig, setSerialConfig] = useState({
        baudRate: 250000,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
    });

    // Exposer les méthodes via ref
    useImperativeHandle(ref, () => ({
        isConnected,
        streamGcode,
        isStreaming,
        abortStreaming
    }), [isConnected, isStreaming]);

    // Console debbug
    const startReading = async (selectedPort) => {
        try {
            const reader = selectedPort.readable.getReader();
            readerRef.current = reader;
            
            let buffer = '';
            
            while (true) {
                const { value, done } = await reader.read();
                
                if (done) {
                    addMessage('Reading stopped', 'info');
                    break;
                }
                
                // Décoder les données reçues
                const chunk = new TextDecoder('utf-8', { fatal: false }).decode(value);
                buffer += chunk;
                
                // Traiter les lignes complètes (terminées par \n ou \r\n)
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || ''; // Garder la ligne incomplète
                
                for (const line of lines) {
                    if (line.trim()) {
                        processReceivedLine(line.trim());
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error reading data:', error);
                addMessage(`Reading error: ${error.message}`, 'error');
            }
        } finally {
            if (readerRef.current) {
                readerRef.current.releaseLock();
                readerRef.current = null;
            }
        }
    };

    const processReceivedLine = (line) => {
        // Si streaming actif, envoyer la ligne au worker
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'INCOMING_LINE',
                data: { line }
            });
            // Ne PAS return ici - laisser l'affichage normal aussi
        }
    
        // Traitement normal (ton code existant)
        if (line.startsWith('ok')) {
            // addMessage(`✓ ${line}`, 'success');
        } else if (line.startsWith('Error') || line.startsWith('!!')) {
            addMessage(`✗ ${line}`, 'error');
        } else if (line.startsWith('echo:') || line.startsWith('FIRMWARE_NAME')) {
            addMessage(`ℹ ${line}`, 'info');
        } else if (line.match(/^[XYZ]:/)) {
            addMessage(`📍 Position: ${line}`, 'info');
        } else if (line.includes('temperature') || line.includes('temp')) {
            addMessage(`🌡 ${line}`, 'info');
        } else if (line.trim().length > 0) {
            if (isReadableText(line)) {
                addMessage(`📨 ${line}`, 'info');
            } else {
                addMessage(`📨 [Binary/Corrupt data: ${line.length} bytes]`, 'warning');
            }
        }
    };

    const isReadableText = (str) => {
        // Vérifier si la chaîne contient principalement des caractères imprimables
        const printableChars = str.replace(/[\x20-\x7E\r\n\t]/g, '');
        return printableChars.length < str.length * 0.3; // Moins de 30% de caractères non-imprimables
    };

    const getMessageClass = (type) => {
        switch (type) {
            case 'success': return 'text-green-600';
            case 'error': return 'text-red-600';
            case 'warning': return 'text-orange-600';
            case 'sent': return 'text-blue-600 font-medium';
            default: return 'text-gray-700';
        }
    };

    const clearMessages = () => {
        setMessages([]);
    };

    const addMessage = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setMessages(prev => [...prev, { 
            text: message, 
            type, 
            timestamp 
        }]);
    };

    // streamGcode with worker
    const streamGcode = async (gcodeContent, jobName = 'Streaming Job') => {
        setStreamProgress({ current: 0, total: 0, percent: 0 });
    
        if (!port || !port.writable) {
            addMessage('Port not available for streaming', 'error');
            throw new Error('Port not available');
        }
    
        // Créer le worker
        workerRef.current = new Worker('/streamingWorker.js');
    
        setIsStreaming(true);
        jobAbortControllerRef.current = new AbortController();
    
        return new Promise((resolve, reject) => {
            // Écouter les messages du worker
            workerRef.current.onmessage = async (event) => {
                const { type, data, message, level, line, command, result, error } = event.data;
    
                switch (type) {
                    case 'WRITE_LINE':
                        // Le worker demande d'écrire une ligne
                        try {
                            const writer = port.writable.getWriter();
                            const encoded = new TextEncoder().encode(line + '\n');
                            await writer.write(encoded);
                            writer.releaseLock();
                        } catch (err) {
                            console.error('Write error:', err);
                            workerRef.current.postMessage({ type: 'ABORT' });
                        }
                        break;
    
                    case 'SEND_BREAK':
                        // Envoyer M108 pour sortir de pause
                        try {
                            const writer = port.writable.getWriter();
                            const encoded = new TextEncoder().encode(command + '\n');
                            await writer.write(encoded);
                            writer.releaseLock();
                            addMessage('📤 M108 envoyé', 'info');
                        } catch (err) {
                            console.error('Break command error:', err);
                        }
                        break;
    
                    case 'LOG':
                        // Afficher les messages
                        addMessage(message, level);
                        break;
    
                    case 'PROGRESS':
                        // Mettre à jour la progression
                        setStreamProgress(data);
                        addMessage(
                            `📊 ${data.percent}% (${data.current}/${data.total}) | ` +
                            `${data.linesPerSec} l/s | Buffer: ${data.bufferUsed}/4 | ` +
                            `ETA: ~${data.eta}min`,
                            'info'
                        );
                        break;
    
                    case 'COMPLETE':
                        // Streaming terminé
                        addMessage(
                            `✅ Terminé en ${result.duration}min (${result.linesStreamed} lignes)`,
                            'success'
                        );
                        setIsStreaming(false);
                        workerRef.current.terminate();
                        workerRef.current = null;
                        resolve(result);
                        break;
    
                    case 'ERROR':
                        // Erreur
                        addMessage(`❌ Erreur: ${error}`, 'error');
                        setIsStreaming(false);
                        workerRef.current.terminate();
                        workerRef.current = null;
                        reject(new Error(error));
                        break;
                }
            };
    
            workerRef.current.onerror = (error) => {
                console.error('Worker error:', error);
                addMessage(`Worker error: ${error.message}`, 'error');
                setIsStreaming(false);
                reject(error);
            };
    
            // Démarrer le streaming
            workerRef.current.postMessage({
                type: 'START_STREAMING',
                data: {
                    gcode: gcodeContent,
                    options: {
                        useLineNumbers: false,
                        jobName: jobName,
                        progressInterval: 100,
                        skipPauseCommands: true
                    }
                }
            });
        });
    };

    const pauseStreaming = async () => {
        if (workerRef.current && isStreaming && !isPaused) {
          try {
            // D'ABORD mettre en pause le worker
            workerRef.current.postMessage({ type: 'PAUSE' });
            setIsPaused(true);
            addMessage('⏸️ Streaming en pause...', 'info');
            
            // Attendre un peu que le worker arrête d'envoyer
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // ENSUITE lever le stylo
            await sendCommand('M280 P0 S90');
            addMessage('🖊️ Pen up', 'info');
          } catch (error) {
            console.error('Error pausing:', error);
            addMessage('❌ Erreur lors de la pause', 'error');
          }
        }
    };
    
    const resumeStreaming = async () => {
        if (workerRef.current && isStreaming && isPaused) {
            try {
            // D'ABORD rebaisser le stylo
            await sendCommand('M280 P0 S25');
            addMessage('🖊️ Pen down', 'info');
            
            // Attendre que le stylo descende
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // ENSUITE reprendre le streaming
            workerRef.current.postMessage({ type: 'RESUME' });
            setIsPaused(false);
            addMessage('▶️ Streaming repris', 'info');
            } catch (error) {
            console.error('Error resuming:', error);
            addMessage('❌ Erreur lors de la reprise', 'error');
            }
        }
    };
    
    // abortStreaming with worker
    const abortStreaming = async () => {
        setStreamProgress({ current: 0, total: 0, percent: 0 });
        setIsPaused(false);
        
        // Arrêter le worker
        if (workerRef.current) {
          workerRef.current.postMessage({ type: 'ABORT' });
          workerRef.current.terminate();
          workerRef.current = null;
        }
        
        setIsStreaming(false);
        
        if (jobAbortControllerRef.current) {
          jobAbortControllerRef.current.abort();
          jobAbortControllerRef.current = null;
        }
        
        // Commandes de sécurité après annulation
        try {
          await sendCommand('M280 P0 S90'); // Pen up
          await new Promise(resolve => setTimeout(resolve, 500)); // Attendre que le stylo se lève
          await sendCommand('M84'); // Release motors
          addMessage('⚠️ Job aborted - Pen up & Motors released', 'warning');
        } catch (error) {
          console.error('Error sending safety commands:', error);
          addMessage('Streaming annulé', 'warning');
        }
      };


    // Connexion serial
    const connect = async () => {
        try {
            // Vérifier que l'API est disponible
            if (!navigator.serial) {
                throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
            }

            // Demander l'accès au port
            const selectedPort = await navigator.serial.requestPort();
            
            // Essayer différentes configurations de baudrate
            const baudRates = [250000, 115200, 230400, 57600];
            let connected = false;
            
            for (const baudRate of baudRates) {
                try {
                    await selectedPort.open({
                        baudRate,
                        dataBits: serialConfig.dataBits,
                        stopBits: serialConfig.stopBits,
                        parity: serialConfig.parity,
                        flowControl: serialConfig.flowControl
                    });
                    
                    setSerialConfig(prev => ({ ...prev, baudRate }));
                    connected = true;
                    addMessage(`Connected at ${baudRate} baud`, 'success');
                    break;
                } catch (error) {
                    addMessage(`Failed at ${baudRate} baud: ${error.message}`, 'warning');
                    if (selectedPort.readable) {
                        await selectedPort.close();
                    }
                }
            }

            if (!connected) {
                throw new Error('Could not connect with any baudrate');
            }
            
            setPort(selectedPort);
            setIsConnected(true);

            // Créer un AbortController pour pouvoir interrompre la lecture
            abortControllerRef.current = new AbortController();
            
            // Commencer à lire les réponses
            startReading(selectedPort);

            // Attendre que le port soit prêt pour l'écriture
            setTimeout(() => {
                if (selectedPort.writable) {
                    sendCommand('M115'); // Demander les informations du firmware
                } else {
                    addMessage('Port not ready for writing yet', 'warning');
                }
            }, 2000);

        } catch (error) {
            console.error('Connection failed:', error);
            addMessage(`Connection error: ${error.message}`, 'error');
        }
    };

    const disconnect = async () => {
        try {
            // Arrêter la lecture
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }

            // Fermer le reader si nécessaire
            if (readerRef.current) {
                await readerRef.current.cancel();
                readerRef.current = null;
            }

            // Fermer le port
            if (port) {
                await port.close();
                setPort(null);
            }
            
            setIsConnected(false);
            addMessage('Disconnected from port', 'info');
        } catch (error) {
            console.error('Disconnection failed:', error);
            addMessage(`Disconnection error: ${error.message}`, 'error');
        }
    };

    
    // Envoyer gcode
    const sendCommand = async (command) => {
        if (!port) {
            addMessage('No port connected', 'error');
            return;
        }

        // Attendre que le port soit prêt
        let retries = 0;
        while (!port.writable && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!port.writable) {
            addMessage('Port not available for writing', 'error');
            return;
        }

        try {
            const writer = port.writable.getWriter();
            
            // S'assurer que la commande se termine par \n
            const commandToSend = command.trim() + '\n';
            const data = new TextEncoder().encode(commandToSend);
            
            await writer.write(data);
            writer.releaseLock();
            
            addMessage(`📤 Sent: ${command}`, 'sent');
        } catch (error) {
            console.error('Error sending command:', error);
            addMessage(`Send error: ${error.message}`, 'error');
        }
    };

    const handleCommandSubmit = (e) => {
        e.preventDefault();
        if (inputCommand.trim()) {
            sendCommand(inputCommand.trim());
            setInputCommand('');
        }
    };

    const sendTestCommands = () => {
        const testCommands = [
            // 'M115', // Informations firmware
            'M114', // Position actuelle
            'M280 P0 S90', // Lever le stylo
            'G28',  // Home
            // 'M280 P0 S25', // Baisser le stylo
            // 'M280 P0 S90', // Lever le stylo
            'M84', // Relacher
        ];
        
        testCommands.forEach((cmd, index) => {
            setTimeout(() => sendCommand(cmd), index * 1000);
        });
    };

    const handleDebug = () => {
        setToggleDebug(!toggleDebug);
    }

    // useEffect(() => {
    //     if (onSendGcode && isConnected) {
    //         onSendGcode(sendGcodeJob);
    //     }
    // }, [onSendGcode, isConnected]);

    useEffect(() => {
        // Nettoyage lors du démontage du composant
        return () => {
            if (isConnected) {
                disconnect();
            }
        };


        if (workerRef.current) {
            workerRef.current.terminate();
        }
    }, []);    

    return (
        <div className="mt-2">
            <h2 className="text-lg font-bold mb-4">Serial connection</h2>
            
            {/* Serial connection buttons */}
            <div className="mb-4 grid grid-cols-2 gap-2">
                {!isStreaming && (
                    <button
                    onClick={isConnected ? disconnect : connect}
                    className={`px-4 py-2 rounded ${
                        isConnected 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-blue-500 hover:bg-blue-600'
                    } text-white`}
                    >
                    {isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                )}
                
                {isConnected && !isStreaming && (
                    <button
                    onClick={sendTestCommands}
                    className="px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-white"
                    >
                    Home
                    </button>
                )}

                {isStreaming && (
                    <div className="col-span-2 flex gap-2">
                    <button
                        onClick={isPaused ? resumeStreaming : pauseStreaming}
                        className={`flex-1 px-4 py-2 rounded ${
                        isPaused 
                            ? 'bg-green-500 hover:bg-green-600' 
                            : 'bg-yellow-500 hover:bg-yellow-600'
                        } text-white`}
                    >
                        {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    
                    <button
                        onClick={abortStreaming}
                        className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
                    >
                        ❌ Abort Job
                    </button>
                    </div>
                )}
            </div>

            
            {/* Stream en cours */}
            {isStreaming && (
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium">
                            Streaming en cours... {streamProgress.current}/{streamProgress.total}
                        </span>
                        
                    </div>

                    <div className="text-xs text-gray-600 mb-2">
                        {streamProgress.linesPerSec} l/s | 
                        Buffer: {streamProgress.bufferUsed}/4 | 
                        ETA: ~{streamProgress.eta}min
                    </div>
                
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span className="text-xs font-medium">Progress</span>
                        <span>{streamProgress.percent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(streamProgress.current / streamProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* DEBUG */}
            <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                    onClick={handleDebug}
                    className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                    debug mode
                </button>
            </div>
            {toggleDebug &&(
                <>
                    {isConnected && !isStreaming && (
                        <form onSubmit={handleCommandSubmit} className="mb-4 flex gap-2">
                            <input
                                type="text"
                                value={inputCommand}
                                onChange={(e) => setInputCommand(e.target.value)}
                                placeholder="Enter G-code command (e.g., M115, G28, M114)"
                                className="flex-1 p-2 border rounded"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                            >
                                Send
                            </button>
                        </form>
                    )}


                    {/* Status */}
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">
                            Status: {isConnected ? `Connected (${serialConfig.baudRate} baud)` : 'Disconnected'}
                        </span>
                        <button
                            onClick={clearMessages}
                            className="text-sm text-gray-500 hover:text-gray-700"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Console */}
                    <div className="p-3 bg-black text-green-400 rounded max-h-60 overflow-auto font-mono text-sm">
                        {messages.length === 0 ? (
                            <div className="text-gray-500">No messages yet...</div>
                        ) : (
                            messages.map((msg, index) => (
                                <div key={index} className={`mb-1 ${getMessageClass(msg.type)}`}>
                                    <span className="text-gray-400 text-xs">{msg.timestamp}</span> {msg.text}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
});

SerialConnection.displayName = 'SerialConnection';
export default SerialConnection;