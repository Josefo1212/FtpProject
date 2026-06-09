import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { parseFTPResponse, parsePASVResponse } from './ftpProtocol.js';
import { conectarCanalDatos } from './dataHandler.js';

export class FtpClient {

    constructor(host = '127.0.0.1', port = 21) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;

        // Cola FIFO para sincronizar comandos sobre canal asíncrono TCP
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
        // ─── Caso especial: Mensaje 220 de bienvenida (Handshake) ───
        if (this.connectResolver && response.code === 220) {
            this.connectResolver(response);
            this.connectResolver = null;
            this.connectRejecter = null;
            return;
        }

        // ─── RFC 959: Respuestas preliminares 1xx ───
        if (response.code >= 100 && response.code < 200) {
            if (this.pendingRequests.length > 0) {
                this.pendingRequests[0].preliminary = response;
            }
            return;
        }

        // ─── Respuesta final: desencolamos y resolvemos ───
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
                // Establecer modo binario para transferencias fiables (imágenes, PDFs, etc.)
                await this.enviarComando('TYPE I');
                return true;
            }
            return false;
        }
        if (resUser.code === 230) {
            this.isAuthenticated = true;
            await this.enviarComando('TYPE I');
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
        const dataSocket = await conectarCanalDatos(host, port);

        // Enviar LIST: FileZilla responde 150 (ignorado por dispatcher) luego 226
        const listPromise = this.enviarComando('LIST');

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
                    // Esperar la respuesta final 226 "Transfer complete"
                    const res = await listPromise;
                    if (res.code === 226 || res.code === 250) {
                        resolve(dataBuffer);
                    } else {
                        reject(new Error(`Error en listado de archivos: ${res.code} ${res.message}`));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });
    }


    async download(remoteFile, localPath) {
    const pasvRes = await this.enviarComando("PASV");
    const { host, port } = parsePASVResponse(pasvRes.message);
    const dataSocket = await conectarCanalDatos(host, port);

    return new Promise((resolve, reject) => {
        const retrPromise = this.enviarComando(`RETR ${remoteFile}`);

        retrPromise.then((res) => {
            if (res.code >= 400) {
                dataSocket.destroy();
                return reject(new Error(`Servidor rechazó la descarga: ${res.code} ${res.message}`));
            }

            // Crear el archivo real solo porque el servidor dijo que sí existe
            const writeStream = fs.createWriteStream(localPath);
            dataSocket.pipe(writeStream);

            writeStream.on('error', (err) => {
                dataSocket.destroy();
                reject(err);
            });

            dataSocket.on('error', (err) => {
                writeStream.destroy();
                reject(err);
            });

            // ✨ ESTE EVENTO ES EL CLAVE: Cuando el archivo se termina de escribir en disco
            writeStream.on('finish', () => {
                resolve(true); // <--- Esto despierta al 'await' en main.js
            });

            // Por si el socket se cierra antes o después
            dataSocket.on('close', () => {
                resolve(true); 
            });

        }).catch((err) => {
            dataSocket.destroy();
            reject(err);
        });
    });
}
    async upload(remoteFile, localPath) {
        if (!fs.existsSync(localPath)) {
            throw new Error(`Archivo local no encontrado: ${localPath}`);
        }

        const { host, port } = await this.pasv();
        const dataSocket = await conectarCanalDatos(host, port);

        // Enviar STOR: FileZilla responde 150 (ignorado) luego 226
        const storPromise = this.enviarComando(`STOR ${remoteFile}`);

        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(localPath);

            readStream.on('error', (err) => {
                dataSocket.destroy();
                reject(err);
            });

            dataSocket.on('error', (err) => {
                readStream.destroy();
                reject(err);
            });


            readStream.pipe(dataSocket);

            dataSocket.on('close', async () => {
                try {
                    const res = await storPromise;
                    if (res.code === 226 || res.code === 250) {
                        resolve(true);
                    } else {
                        reject(new Error(`Error al subir archivo: ${res.code} ${res.message}`));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async deleteFile(remoteFile) {
        const res = await this.enviarComando(`DELE ${remoteFile}`);
        if (res.code === 250) {
            return true;
        }
        throw new Error(`Error al borrar archivo: ${res.code} ${res.message}`);
    }

    async makeDirectory(dirName) {
        const res = await this.enviarComando(`MKD ${dirName}`);
        if (res.code === 257) {
            return res.message;
        }
        throw new Error(`Error al crear directorio: ${res.code} ${res.message}`);
    }

    async quit() {
        try {
            await this.enviarComando("QUIT");
        } catch (e) {
        } finally {
            if (this.controlSocket) {
                this.controlSocket.destroy();
            }
        }
    }
}