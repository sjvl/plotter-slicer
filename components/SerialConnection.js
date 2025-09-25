import React, { useState, useEffect, useRef } from 'react';

const SerialConnection = ({ onSendGcode }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [port, setPort] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputCommand, setInputCommand] = useState('');
    const [isExecutingJob, setIsExecutingJob] = useState(false);
    const [jobProgress, setJobProgress] = useState({ current: 0, total: 0 });
    const readerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const jobAbortControllerRef = useRef(null);

    // Configuration pour différents types de carte mère
    const [serialConfig, setSerialConfig] = useState({
        baudRate: 250000, // Plus courant pour Marlin/Rumba
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
    });

    const addMessage = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setMessages(prev => [...prev, { 
            text: message, 
            type, 
            timestamp 
        }]);
    };

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
        // Filtrer et interpréter les réponses du firmware
        if (line.startsWith('ok')) {
            addMessage(`✓ ${line}`, 'success');
        } else if (line.startsWith('Error') || line.startsWith('!!')) {
            addMessage(`✗ ${line}`, 'error');
        } else if (line.startsWith('echo:') || line.startsWith('FIRMWARE_NAME')) {
            addMessage(`ℹ ${line}`, 'info');
        } else if (line.match(/^[XYZ]:/)) {
            addMessage(`📍 Position: ${line}`, 'info');
        } else if (line.includes('temperature') || line.includes('temp')) {
            addMessage(`🌡 ${line}`, 'info');
        } else if (line.trim().length > 0) {
            // Vérifier si c'est du texte lisible ou des caractères corrompus
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

    const handleCommandSubmit = (e) => {
        e.preventDefault();
        if (inputCommand.trim()) {
            sendCommand(inputCommand.trim());
            setInputCommand('');
        }
    };

    const clearMessages = () => {
        setMessages([]);
    };

    const sendGcodeJob = async (gcodeContent, jobName = 'Print Job') => {
        if (!port || !port.writable) {
            addMessage('Port not available for G-code job', 'error');
            return;
        }

        const lines = gcodeContent.split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith(';'); // Ignorer les lignes vides et commentaires
        });

        if (lines.length === 0) {
            addMessage('No valid G-code commands to send', 'warning');
            return;
        }

        setIsExecutingJob(true);
        setJobProgress({ current: 0, total: lines.length });
        jobAbortControllerRef.current = new AbortController();

        addMessage(`🚀 Starting job: ${jobName} (${lines.length} commands)`, 'info');

        try {
            for (let i = 0; i < lines.length; i++) {
                if (jobAbortControllerRef.current?.signal.aborted) {
                    addMessage('❌ Job aborted by user', 'warning');
                    break;
                }

                const line = lines[i].trim();
                await sendCommand(line);

                // Attendre la confirmation "ok" pour certaines commandes importantes
                if (line.startsWith('G') || line.startsWith('M280')) {
                    await waitForOk();
                }

                setJobProgress({ current: i + 1, total: lines.length });
            }

            if (!jobAbortControllerRef.current?.signal.aborted) {
                addMessage(`✅ Job completed: ${jobName}`, 'success');
            }
        } catch (error) {
            addMessage(`❌ Job error: ${error.message}`, 'error');
        } finally {
            setIsExecutingJob(false);
            setJobProgress({ current: 0, total: 0 });
            jobAbortControllerRef.current = null;
        }
    };

    const waitForOk = () => {
        return new Promise((resolve, reject) => {
            let timeout;
            const checkMessages = () => {
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.text.includes('ok')) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    timeout = setTimeout(checkMessages, 50);
                }
            };
            
            // Timeout après 10 secondes
            const maxTimeout = setTimeout(() => {
                clearTimeout(timeout);
                resolve(); // Continuer même sans confirmation
            }, 10000);
            
            checkMessages();
        });
    };

    const sendTestCommands = () => {
        const testCommands = [
            // 'M115', // Informations firmware
            'M114', // Position actuelle
            'G28',  // Home
            'M280 P0 S90', // Lever le stylo
            'M280 P0 S25', // Baisser le stylo
            'M280 P0 S90', // Lever le stylo
            'M84', // Relacher
        ];
        
        testCommands.forEach((cmd, index) => {
            setTimeout(() => sendCommand(cmd), index * 1000);
        });
    };

    // Exposer la fonction sendGcodeJob au parent
    useEffect(() => {
        if (onSendGcode && isConnected) {
            onSendGcode(sendGcodeJob);
        }
    }, [onSendGcode, isConnected]);

    useEffect(() => {
        // Nettoyage lors du démontage du composant
        return () => {
            if (isConnected) {
                disconnect();
            }
        };
    }, []);

    const getMessageClass = (type) => {
        switch (type) {
            case 'success': return 'text-green-600';
            case 'error': return 'text-red-600';
            case 'warning': return 'text-orange-600';
            case 'sent': return 'text-blue-600 font-medium';
            default: return 'text-gray-700';
        }
    };

    return (
        <div className="mt-4">
            <h2 className="text-lg font-bold mb-4">Plotter connection</h2>
            
            <div className="mb-4 grid grid-cols-3 gap-2">
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
                
                {isConnected && !isExecutingJob && (
                    <button
                        onClick={sendTestCommands}
                        className="px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-white"
                    >
                        Home
                    </button>
                )}

                {isExecutingJob && (
                    <button
                        onClick={abortJob}
                        className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white"
                    >
                        Abort Job
                    </button>
                )}
            </div>

            {/* Progress bar pour les jobs */}
            {isExecutingJob && (
                <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{jobProgress.current}/{jobProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(jobProgress.current / jobProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {isConnected && !isExecutingJob && (
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
        </div>
    );
};

export default SerialConnection;