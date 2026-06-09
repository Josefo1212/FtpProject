import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { parseFTPResponse, parsePASVResponse } from './ftpProtocol.js';
import { conectarCanalDatos } from './dataHandler.js';

export class FtpClient {

    constructor(host = '127.0.0.1', port = 3000) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;
        
        // Cola para sincronizar comandos síncronos sobre canal asíncrono TCP
        this.pendingRequests = [];
        this.currentResponseLines = [];
        
        this.connectResolver = null;
        this.connectRejecter = null;
        
        // Estado de autenticación visible para el prompt dinámico
        this.isAuthenticated = false;
    }

    conectar() {
        return new Promise((resolve, reject) => {
            this.connectResolver = resolve;
            this.connectRejecter = reject;

            this.controlSocket = net.createConnection({ host: this.host, port: this.port }, () => {
                console.log(`[SISTEMA] Canal de control TCP conectado a ${this.host}:${this.port}`);
            });

            this.controlSocket.setEncoding('utf-8');

            let buffer = '';
            this.controlSocket.on('data', (chunk) => {
                buffer += chunk;
                let newlineIndex;
                
                // Procesar línea por línea
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);
                    this._procesarLineaControl(line);
                }
            });

            this.controlSocket.on('close', () => {
                console.log('[SISTEMA] Conexión de control finalizada.');
                this._rechazarTodo(new Error('La conexión de control se cerró de forma inesperada.'));
            });

            this.controlSocket.on('error', (err) => {
                console.error(`[CONTROL ERROR] Fallo en la comunicación: ${err.message}`);
                if (this.connectRejecter) {
                    this.connectRejecter(err);
                    this.connectResolver = null;
                    this.connectRejecter = null;
                }
                this._rechazarTodo(err);
            });
        });
    }

    enviarComando(comando) {
        return new Promise((resolve, reject) => {
            if (!this.controlSocket || this.controlSocket.destroyed) {
                return reject(new Error("No hay conexión de control establecida."));
            }

            const cleanCmd = comando.trim();
            // Encolamos el resolver para responder de forma ordenada (FIFO)
            this.pendingRequests.push({ resolve, reject, command: cleanCmd });
            
            // Envío en formato estándar de protocolo de internet FTP (\r\n)
            this.controlSocket.write(`${cleanCmd}\r\n`);
        });
    }

    _procesarLineaControl(line) {
        if (line.trim() === '') return;

        const parsed = parseFTPResponse(line);

        // Si ya estamos acumulando una respuesta multilínea
        if (this.currentResponseLines.length > 0) {
            this.currentResponseLines.push(parsed);

            // El final de una respuesta multilínea debe empezar con el mismo código numérico y espacio
            const startCode = this.currentResponseLines[0].code;
            if (parsed.code === startCode && parsed.separator === ' ') {
                const combinedMessage = this.currentResponseLines.map(r => r.message).join('\n');
                const combinedRaw = this.currentResponseLines.map(r => r.raw).join('\n');
                
                const finalResponse = {
                    code: startCode,
                    message: combinedMessage,
                    raw: combinedRaw
                };
                
                this.currentResponseLines = [];
                this._despacharRespuesta(finalResponse);
            }
        } else {
            // Si inicia una respuesta multilínea
            if (parsed.separator === '-') {
                this.currentResponseLines.push(parsed);
            } else {
                // Respuesta de una sola línea
                this._despacharRespuesta(parsed);
            }
        }
    }

    _despacharRespuesta(response) {
        // Caso especial: El mensaje 220 inicial (Handshake de conexión)
        if (this.connectResolver && response.code === 220) {
            this.connectResolver(response);
            this.connectResolver = null;
            this.connectRejecter = null;
            return;
        }

        // Obtener la promesa más antigua en espera
        if (this.pendingRequests.length > 0) {
            const req = this.pendingRequests.shift();
            req.resolve(response);
        }
    }

    _rechazarTodo(error) {
        while (this.pendingRequests.length > 0) {
            const req = this.pendingRequests.shift();
            req.reject(error);
        }
    }

    async login(user, pass) {
        const resUser = await this.enviarComando(`USER ${user}`);
        if (resUser.code === 331) {
            const resPass = await this.enviarComando(`PASS ${pass}`);
            if (resPass.code === 230) {
                this.isAuthenticated = true;
                return true;
            }
            return false;
        }
        if (resUser.code === 230) {
            this.isAuthenticated = true;
            return true;
        }
        return false;
    }

    async pasv() {
        const res = await this.enviarComando("PASV");
        if (res.code === 227) {
            return parsePASVResponse(res.message);
        }
        throw new Error(`Error en PASV: ${res.code} ${res.message}`);
    }

    async list() {
        const { host, port } = await this.pasv();
        const dataSocketPromise = conectarCanalDatos(host, port);
        const listCmdPromise = this.enviarComando('LIST');
        
        const dataSocket = await dataSocketPromise;
        
        return new Promise((resolve, reject) => {
            let dataBuffer = '';
            dataSocket.setEncoding('utf-8');
            
            dataSocket.on('data', (chunk) => {
                dataBuffer += chunk;
            });
            
            dataSocket.on('error', (err) => {
                reject(err);
            });
            
            dataSocket.on('close', async () => {
                try {
                    const controlRes = await listCmdPromise;
                    if (controlRes.code === 226 || controlRes.code === 250 || controlRes.code === 150) {
                        resolve(dataBuffer);
                    } else {
                        reject(new Error(`Fallo en el listado de archivos: ${controlRes.code}`));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async download(remoteFile, localPath) {
        // Asegurar la carpeta de destino
        const carpeta = path.dirname(localPath);
        if (!fs.existsSync(carpeta)) {
            fs.mkdirSync(carpeta, { recursive: true });
        }

        const { host, port } = await this.pasv();
        const dataSocketPromise = conectarCanalDatos(host, port);
        const retrCmdPromise = this.enviarComando(`RETR ${remoteFile}`);
        
        const dataSocket = await dataSocketPromise;
        
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(localPath);
            
            writeStream.on('error', (err) => {
                reject(err);
            });
            
            dataSocket.on('error', (err) => {
                writeStream.destroy();
                reject(err);
            });
            
            dataSocket.pipe(writeStream);
            
            dataSocket.on('close', async () => {
                try {
                    const controlRes = await retrCmdPromise;
                    if (controlRes.code === 226 || controlRes.code === 250 || controlRes.code === 150) {
                        resolve(true);
                    } else {
                        reject(new Error(`Fallo al descargar archivo: ${controlRes.code}`));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async quit() {
        try {
            await this.enviarComando("QUIT");
        } catch (e) {
            // Ignorar errores si el servidor ya cerró la conexión
        } finally {
            if (this.controlSocket) {
                this.controlSocket.destroy();
            }
        }
    }
}