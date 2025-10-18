// utils/GCodeStreamer.js
// Bibliothèque autonome pour le streaming G-code façon Makelangelo

export class GCodeStreamer {
    constructor(serialPort, options = {}) {
        this.port = serialPort;
        this.bufferSize = options.bufferSize || 4;
        this.timeout = options.timeout || 5000;
        this.onMessage = options.onMessage || (() => {});
        this.onProgress = options.onProgress || (() => {});
        
        // État interne
        this.state = {
            pendingLines: 0,
            isStreaming: false,
            lastOkTime: null,
            lastBusyTime: null,
            okQueue: [],
            aborted: false
        };
    }

    /**
     * Traiter une ligne reçue du firmware
     */
    processLine(line) {
        if (!line) return;

        // Détecter les acquittements
        if (line === 'ok' || line === '>') {
            this.state.okQueue.push(true);
            this.state.lastOkTime = Date.now();
            // NE PAS décrémenter ici - on le fera dans waitForOk()
            // this.onMessage(`✓ ok (buffer: ${this.state.pendingLines}/${this.bufferSize})`, 'success');
        }
        // Détecter les demandes de resend
        else if (line.toLowerCase().includes('resend')) {
            const match = line.match(/resend[:\s]+(\d+)/i);
            if (match) {
                const lineNum = parseInt(match[1]);
                this.onMessage(`🔄 Resend demandé pour ligne ${lineNum}`, 'error');
            }
            this.state.okQueue.push(true);
        }
        // Détecter les messages "busy"
        else if (line.toLowerCase().includes('busy:')) {
            this.state.lastBusyTime = Date.now();
            
            if (line.toLowerCase().includes('paused for user')) {
                this.onMessage(`⏸️ Pause détectée - envoi M108`, 'warning');
                this.sendBreakCommand();
                this.state.okQueue.push(true);
            } else {
                this.onMessage(`⏳ ${line} (timeout prolongé)`, 'info');
            }
        }
        // Détecter les prompts d'action
        else if (line.startsWith('//action:prompt')) {
            this.onMessage(`🔔 ${line}`, 'info');
        }
        // Détecter les erreurs
        else if (line.toLowerCase().includes('error')) {
            this.onMessage(`❌ ${line}`, 'error');
            if (line.toLowerCase().includes('line number')) {
                this.state.okQueue.push(true);
            }
        }
        // Autres messages
        else {
            this.onMessage(`📨 ${line}`, 'info');
        }
    }

    /**
     * Envoyer M108 pour sortir d'une pause
     */
    async sendBreakCommand() {
        if (!this.port?.writable) return;
        
        try {
            const writer = this.port.writable.getWriter();
            const data = new TextEncoder().encode('M108\n');
            await writer.write(data);
            writer.releaseLock();
            this.onMessage(`📤 M108 envoyé`, 'info');
        } catch (error) {
            this.onMessage(`⚠️ Erreur M108: ${error.message}`, 'warning');
        }
    }

    /**
     * Attendre un "ok" du firmware
     */
    async waitForOk() {
        const startTime = Date.now();
        let lastBusyTime = Date.now();
        
        while (true) {
            if (this.state.aborted) {
                throw new Error('Streaming aborted');
            }

            // Vérifier si un "ok" est disponible
            if (this.state.okQueue.length > 0) {
                this.state.okQueue.shift();
                // DÉCRÉMENTER ICI quand on consomme un "ok"
                this.state.pendingLines = Math.max(0, this.state.pendingLines - 1);
                return true;
            }
            
            // Prolonger timeout si busy récent
            const timeSinceLastBusy = Date.now() - this.state.lastBusyTime;
            if (timeSinceLastBusy < 3000) {
                lastBusyTime = Date.now();
            }
            
            // Timeout seulement si pas de busy récent
            const effectiveTimeout = Date.now() - Math.max(startTime, lastBusyTime);
            if (effectiveTimeout > this.timeout) {
                throw new Error('Timeout waiting for ok');
            }
            
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * Calculer le checksum XOR
     */
    calculateChecksum(line) {
        let checksum = 0;
        for (let i = 0; i < line.length; i++) {
            checksum ^= line.charCodeAt(i);
        }
        return checksum;
    }

    /**
     * Formater une ligne avec numéro et checksum
     */
    formatLine(line, lineNumber) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) return null;
        
        const numbered = `N${lineNumber} ${trimmed}`;
        const checksum = this.calculateChecksum(numbered);
        return `${numbered}*${checksum}`;
    }

    /**
     * Envoyer une ligne SANS attendre l'acquittement
     */
    async sendLineToBuffer(line, lineNumber = null) {
        if (!this.port?.writable) {
            throw new Error('Port not writable');
        }
    
        const formatted = lineNumber !== null 
            ? this.formatLine(line, lineNumber)
            : line.trim();
    
        if (!formatted) return false;
    
        // NE PAS créer de writer ici - on l'utilisera dans stream()
        const data = new TextEncoder().encode(formatted + '\n');
        
        // Utiliser le writer partagé
        if (!this.sharedWriter) {
            throw new Error('No shared writer available');
        }
        
        await this.sharedWriter.write(data);
        this.state.pendingLines++;
        return true;
    }

    /**
     * Streamer un fichier G-code complet
     */
    async stream(gcodeContent, options = {}) {
        
        const {
            useLineNumbers = true,
            jobName = 'Streaming Job',
            progressInterval = 100,
            skipPauseCommands = true
        } = options;

        // Préparer les lignes
        let lines = gcodeContent
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith(';'));

        // Filtrer les commandes de pause
        if (skipPauseCommands) {
            const pauseCommands = ['M0', 'M1', 'M25'];
            const originalCount = lines.length;
            lines = lines.filter(line => {
                const upperLine = line.toUpperCase();
                return !pauseCommands.some(cmd => upperLine.startsWith(cmd));
            });
            if (lines.length < originalCount) {
                this.onMessage(
                    `⚠️ ${originalCount - lines.length} commande(s) de pause ignorée(s)`,
                    'warning'
                );
            }
        }

        if (lines.length === 0) {
            throw new Error('No valid G-code lines to stream');
        }

        // Réinitialiser l'état
        this.state = {
            pendingLines: 0,
            isStreaming: true,
            lastOkTime: Date.now(),
            lastBusyTime: Date.now(),
            okQueue: [],
            aborted: false
        };

        this.onMessage(`🚀 Streaming: ${jobName} (${lines.length} lignes)`, 'info');
        this.onMessage(`📊 Buffer: ${this.bufferSize} lignes`, 'info');

        const startTime = Date.now();

        try {
            await new Promise(resolve => setTimeout(resolve, 0));

            this.sharedWriter = this.port.writable.getWriter();

            this.onMessage(`🔍 Début streaming`, 'info');

            let sentLineNumber = 0;
            let currentIndex = 0;

            // PHASE 1 : Remplir le buffer initial
            this.onMessage(`📤 Remplissage buffer initial...`, 'info');
            
            while (currentIndex < lines.length && this.state.pendingLines < this.bufferSize) {
                if (this.state.aborted) {
                    throw new Error('Streaming aborted');
                }

                const line = lines[currentIndex];
                sentLineNumber++;
                const lineNum = useLineNumbers ? sentLineNumber : null;

                const sent = await this.sendLineToBuffer(line, lineNum);
                
                if (!sent && useLineNumbers) {
                    sentLineNumber--;
                }

                currentIndex++;
                
                if (currentIndex <= 5) {
                    this.onMessage(`  → Ligne ${currentIndex} (buffer: ${this.state.pendingLines}/${this.bufferSize})`, 'info');
                }
            }

            this.onMessage(`✅ Buffer rempli: ${this.state.pendingLines}/${this.bufferSize}`, 'success');

            // PHASE 2 : Maintenir le buffer plein
            while (currentIndex < lines.length) {
                if (this.state.aborted) {
                    throw new Error('Streaming aborted');
                }

                // Attendre qu'UNE place se libère
                await this.waitForOk();
                
                // Envoyer immédiatement la ligne suivante
                const line = lines[currentIndex];
                sentLineNumber++;
                const lineNum = useLineNumbers ? sentLineNumber : null;

                const sent = await this.sendLineToBuffer(line, lineNum);
                
                if (!sent && useLineNumbers) {
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

                    this.onProgress({
                        current: currentIndex,
                        total: lines.length,
                        percent: parseFloat(percent),
                        linesPerSec: parseInt(linesPerSec),
                        eta: parseFloat(eta),
                        bufferUsed: this.state.pendingLines
                    });

                    this.onMessage(
                        `📊 ${percent}% (${currentIndex}/${lines.length}) | ` +
                        `${linesPerSec} l/s | Buffer: ${this.state.pendingLines}/${this.bufferSize} | ` +
                        `ETA: ~${eta}min`,
                        'info'
                    );
                }
            }
            
            // Attendre les derniers "ok"
            this.onMessage(`⏳ Attente derniers ok (${this.state.pendingLines} restants)...`, 'info');
            while (this.state.pendingLines > 0) {
                await this.waitForOk();
            }

            const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            this.onMessage(`✅ Terminé en ${totalTime}min (${sentLineNumber} lignes)`, 'success');

            return {
                success: true,
                linesStreamed: sentLineNumber,
                duration: totalTime
            };

        } catch (error) {
            this.onMessage(`❌ Erreur: ${error.message}`, 'error');
            console.error('Streaming error:', error);
            throw error;
        } finally {
            if (this.sharedWriter) {
                try {
                    this.sharedWriter.releaseLock();
                } catch (e) {}
                this.sharedWriter = null;
            }
            this.state.isStreaming = false;
        }
    }

    /**
     * Annuler le streaming
     */
    abort() {
        this.state.aborted = true;
        this.onMessage('⚠️ Streaming annulé', 'warning');
    }

    /**
     * Vérifier si actif
     */
    isActive() {
        return this.state.isStreaming;
    }
}

export default GCodeStreamer;