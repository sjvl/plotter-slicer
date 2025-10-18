// Web Worker pour le streaming G-code sans throttling

class StreamingEngine {
    constructor() {
        this.state = {
            pendingLines: 0,
            isStreaming: false,
            lastOkTime: null,
            lastBusyTime: null,
            okQueue: [],
            aborted: false
        };
        this.bufferSize = 4;
        this.timeout = 5000;
    }

    calculateChecksum(line) {
        let checksum = 0;
        for (let i = 0; i < line.length; i++) {
            checksum ^= line.charCodeAt(i);
        }
        return checksum;
    }

    formatLine(line, lineNumber) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) return null;
        
        const numbered = `N${lineNumber} ${trimmed}`;
        const checksum = this.calculateChecksum(numbered);
        return `${numbered}*${checksum}`;
    }

    processIncomingLine(line) {
        if (!line) return;

        if (line === 'ok' || line === '>') {
            this.state.okQueue.push(true);
            this.state.lastOkTime = Date.now();
        }
        else if (line.toLowerCase().includes('resend')) {
            const match = line.match(/resend[:\s]+(\d+)/i);
            if (match) {
                postMessage({
                    type: 'LOG',
                    message: `🔄 Resend ligne ${parseInt(match[1])}`,
                    level: 'error'
                });
            }
            this.state.okQueue.push(true);
        }
        else if (line.toLowerCase().includes('busy:')) {
            this.state.lastBusyTime = Date.now();
            
            if (line.toLowerCase().includes('paused for user')) {
                postMessage({
                    type: 'SEND_BREAK',
                    command: 'M108'
                });
                this.state.okQueue.push(true);
            }
        }
        else if (line.toLowerCase().includes('error')) {
            postMessage({
                type: 'LOG',
                message: `❌ ${line}`,
                level: 'error'
            });
            if (line.toLowerCase().includes('line number')) {
                this.state.okQueue.push(true);
            }
        }
    }

    async waitForOk() {
        const startTime = Date.now();
        let lastBusyTime = Date.now();
        
        while (true) {
            if (this.state.aborted) {
                throw new Error('Streaming aborted');
            }

            if (this.state.okQueue.length > 0) {
                this.state.okQueue.shift();
                this.state.pendingLines = Math.max(0, this.state.pendingLines - 1);
                return true;
            }
            
            const timeSinceLastBusy = Date.now() - this.state.lastBusyTime;
            if (timeSinceLastBusy < 3000) {
                lastBusyTime = Date.now();
            }
            
            const effectiveTimeout = Date.now() - Math.max(startTime, lastBusyTime);
            if (effectiveTimeout > this.timeout) {
                throw new Error('Timeout waiting for ok');
            }
            
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    async stream(gcodeContent, options = {}) {
        const {
            useLineNumbers = false,
            jobName = 'Streaming Job',
            progressInterval = 100,
            skipPauseCommands = true
        } = options;

        // Préparer les lignes
        let lines = gcodeContent
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith(';'));

        // Filtrer les pauses
        if (skipPauseCommands) {
            const pauseCommands = ['M0', 'M1', 'M25'];
            const originalCount = lines.length;
            lines = lines.filter(line => {
                const upperLine = line.toUpperCase();
                return !pauseCommands.some(cmd => upperLine.startsWith(cmd));
            });
            if (lines.length < originalCount) {
                postMessage({
                    type: 'LOG',
                    message: `⚠️ ${originalCount - lines.length} pause(s) ignorée(s)`,
                    level: 'warning'
                });
            }
        }

        if (lines.length === 0) {
            throw new Error('No valid G-code lines');
        }

        // Réinitialiser
        this.state = {
            pendingLines: 0,
            isStreaming: true,
            lastOkTime: Date.now(),
            lastBusyTime: Date.now(),
            okQueue: [],
            aborted: false
        };

        postMessage({
            type: 'LOG',
            message: `🚀 Streaming: ${jobName} (${lines.length} lignes)`,
            level: 'info'
        });

        const startTime = Date.now();

        try {
            await new Promise(resolve => setTimeout(resolve, 0));

            let sentLineNumber = 0;
            let currentIndex = 0;

            // PHASE 1 : Remplir buffer
            postMessage({
                type: 'LOG',
                message: `📤 Remplissage buffer...`,
                level: 'info'
            });
            
            while (currentIndex < lines.length && this.state.pendingLines < this.bufferSize) {
                if (this.state.aborted) throw new Error('Aborted');

                const line = lines[currentIndex];
                sentLineNumber++;
                const lineNum = useLineNumbers ? sentLineNumber : null;

                const formatted = lineNum !== null 
                    ? this.formatLine(line, lineNum)
                    : line.trim();

                if (formatted) {
                    // Envoyer au main thread pour écriture
                    postMessage({
                        type: 'WRITE_LINE',
                        line: formatted
                    });
                    this.state.pendingLines++;
                } else if (useLineNumbers) {
                    sentLineNumber--;
                }

                currentIndex++;
            }

            postMessage({
                type: 'LOG',
                message: `✅ Buffer: ${this.state.pendingLines}/${this.bufferSize}`,
                level: 'success'
            });

            // PHASE 2 : Streaming
            while (currentIndex < lines.length) {
                if (this.state.aborted) throw new Error('Aborted');

                await this.waitForOk();
                
                const line = lines[currentIndex];
                sentLineNumber++;
                const lineNum = useLineNumbers ? sentLineNumber : null;

                const formatted = lineNum !== null 
                    ? this.formatLine(line, lineNum)
                    : line.trim();

                if (formatted) {
                    postMessage({
                        type: 'WRITE_LINE',
                        line: formatted
                    });
                    this.state.pendingLines++;
                } else if (useLineNumbers) {
                    sentLineNumber--;
                }

                currentIndex++;

                // Progression
                if (currentIndex % progressInterval === 0 || currentIndex === lines.length) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const percent = (currentIndex / lines.length * 100).toFixed(1);
                    const linesPerSec = (currentIndex / elapsed).toFixed(0);
                    const remaining = lines.length - currentIndex;
                    const eta = (remaining / linesPerSec / 60).toFixed(1);

                    postMessage({
                        type: 'PROGRESS',
                        data: {
                            current: currentIndex,
                            total: lines.length,
                            percent: parseFloat(percent),
                            linesPerSec: parseInt(linesPerSec),
                            eta: parseFloat(eta),
                            bufferUsed: this.state.pendingLines
                        }
                    });
                }
            }
            
            // Attendre derniers ok
            postMessage({
                type: 'LOG',
                message: `⏳ Attente derniers ok...`,
                level: 'info'
            });

            while (this.state.pendingLines > 0) {
                await this.waitForOk();
            }

            const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            
            postMessage({
                type: 'COMPLETE',
                result: {
                    success: true,
                    linesStreamed: sentLineNumber,
                    duration: totalTime
                }
            });

        } catch (error) {
            postMessage({
                type: 'ERROR',
                error: error.message
            });
        } finally {
            this.state.isStreaming = false;
        }
    }

    abort() {
        this.state.aborted = true;
    }
}

// Instance globale
const engine = new StreamingEngine();

// Écouter les messages du main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'START_STREAMING':
            engine.stream(data.gcode, data.options);
            break;

        case 'INCOMING_LINE':
            engine.processIncomingLine(data.line);
            break;

        case 'ABORT':
            engine.abort();
            break;

        case 'SET_BUFFER_SIZE':
            engine.bufferSize = data.size;
            break;
    }
});