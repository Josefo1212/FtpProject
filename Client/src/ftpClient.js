import net from 'node:net';
import fs from 'node:fs';
import { parseFTPResponse, parsePASVResponse } from './ftpProtocol.js';
import { conectarCanalDatos } from './dataHandler.js';

export class FtpClient {
    constructor(host = '127.0.0.1', port = 21) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;
        this.pendingRequests = []; // Cola FIFO para comandos TCP
        this.currentResponseLines = [];
        this.connectResolver = null;
        this.connectRejecter = null;
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
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    this._procesarLineaControl(buffer.substring(0, newlineIndex));
                    buffer = buffer.substring(newlineIndex + 1);
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
                    this.connectResolver = this.connectRejecter = null;
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
            this.pendingRequests.push({ resolve, reject, command: cleanCmd });
            this.controlSocket.write(`${cleanCmd}\r\n`);
        });
    }

    _procesarLineaControl(line) {
        if (!line.trim()) return;
        const parsed = parseFTPResponse(line);

        if (this.currentResponseLines.length > 0) {
            this.currentResponseLines.push(parsed);
            const startCode = this.currentResponseLines[0].code;

            if (parsed.code === startCode && parsed.separator === ' ') {
                const finalResponse = {
                    code: startCode,
                    message: this.currentResponseLines.map(r => r.message).join('\n'),
                    raw: this.currentResponseLines.map(r => r.raw).join('\n')
                };
                this.currentResponseLines = [];
                this._despacharRespuesta(finalResponse);
            }
        } else {
            parsed.separator === '-' ? this.currentResponseLines.push(parsed) : this._despacharRespuesta(parsed);
        }
    }

    _despacharRespuesta(response) {
        if (this.connectResolver && response.code === 220) {
            this.connectResolver(response);
            this.connectResolver = this.connectRejecter = null;
            return;
        }

        if (response.code >= 100 && response.code < 200) {
            if (this.pendingRequests.length > 0) this.pendingRequests[0].preliminary = response;
            return;
        }

        if (this.pendingRequests.length > 0) {
            this.pendingRequests.shift().resolve(response);
        }
    }

    _rechazarTodo(error) {
        while (this.pendingRequests.length > 0) {
            this.pendingRequests.shift().reject(error);
        }
    }

    async login(user, pass) {
        let res = await this.enviarComando(`USER ${user}`);
        if (res.code === 331) res = await this.enviarComando(`PASS ${pass}`);
        
        if (res.code === 230) {
            this.isAuthenticated = true;
            await this.enviarComando('TYPE I');
            return true;
        }
        return false;
    }

    async pasv() {
        const res = await this.enviarComando("PASV");
        if (res.code === 227) return parsePASVResponse(res.message);
        throw new Error(`Error en PASV: ${res.code} ${res.message}`);
    }

    async list() {
        const { host, port } = await this.pasv();
        const dataSocket = await conectarCanalDatos(host, port);
        const listPromise = this.enviarComando('LIST');

        return new Promise((resolve, reject) => {
            let dataBuffer = '';
            dataSocket.setEncoding('utf-8');
            dataSocket.on('data', chunk => dataBuffer += chunk);
            dataSocket.on('error', reject);
            dataSocket.on('close', async () => {
                try {
                    const res = await listPromise;
                    if ([226, 250].includes(res.code)) resolve(dataBuffer);
                    else reject(new Error(`Error en listado de archivos: ${res.code} ${res.message}`));
                } catch (err) { reject(err); }
            });
        });
    }

    async download(remoteFile, localPath) {
        const pasvRes = await this.enviarComando("PASV");
        const { host, port } = parsePASVResponse(pasvRes.message);
        const dataSocket = await conectarCanalDatos(host, port);

        return new Promise((resolve, reject) => {
            this.enviarComando(`RETR ${remoteFile}`).then((res) => {
                if (res.code >= 400) {
                    dataSocket.destroy();
                    return reject(new Error(`Servidor rechazó la descarga: ${res.code} ${res.message}`));
                }

                const writeStream = fs.createWriteStream(localPath);
                dataSocket.pipe(writeStream);

                writeStream.on('error', err => { dataSocket.destroy(); reject(err); });
                dataSocket.on('error', err => { writeStream.destroy(); reject(err); });
                writeStream.on('finish', () => resolve(true));
                dataSocket.on('close', () => resolve(true));
            }).catch((err) => {
                dataSocket.destroy();
                reject(err);
            });
        });
    }

    async upload(remoteFile, localPath) {
        if (!fs.existsSync(localPath)) throw new Error(`Archivo local no encontrado: ${localPath}`);

        const { host, port } = await this.pasv();
        const dataSocket = await conectarCanalDatos(host, port);
        const storPromise = this.enviarComando(`STOR ${remoteFile}`);

        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(localPath);

            readStream.on('error', err => { dataSocket.destroy(); reject(err); });
            dataSocket.on('error', err => { readStream.destroy(); reject(err); });
            readStream.pipe(dataSocket);

            dataSocket.on('close', async () => {
                try {
                    const res = await storPromise;
                    if ([226, 250].includes(res.code)) resolve(true);
                    else reject(new Error(`Error al subir archivo: ${res.code} ${res.message}`));
                } catch (err) { reject(err); }
            });
        });
    }

    async deleteFile(remoteFile) {
        const res = await this.enviarComando(`DELE ${remoteFile}`);
        if (res.code === 250) return true;
        throw new Error(`Error al borrar archivo: ${res.code} ${res.message}`);
    }

    async makeDirectory(dirName) {
        const res = await this.enviarComando(`MKD ${dirName}`);
        if (res.code === 257) return res.message;
        throw new Error(`Error al crear directorio: ${res.code} ${res.message}`);
    }

    async quit() {
        try {
            await this.enviarComando("QUIT");
        } catch {} finally {
            this.controlSocket?.destroy();
        }
    }
}