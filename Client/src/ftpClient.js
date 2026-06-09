import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFTPResponse, parsePASVResponse } from './ftpProtocol.js';
import { conectarCanalDatos } from './dataHandler.js';

/**
 * Cliente FTP completo que implementa la lógica de red de control y de datos
 * utilizando una cola de solicitudes basadas en Promesas.
 */
export class FtpClient {
    /**
     * @param {string} host - Servidor FTP IP o Dominio.
     * @param {number} port - Puerto de control del servidor FTP.
     */
    constructor(host = '127.0.0.1', port = 3000) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;
        
        // Cola para sincronizar comandos síncronos sobre canal asíncrono TCP
        this.pendingRequests = [];
        this.currentResponseLines = [];
        
        this.connectResolver = null;
        this.connectRejecter = null;
    }

    /**
     * Conecta al puerto de control del servidor FTP y espera el saludo '220'.
     * @returns {Promise<{code: number, message: string}>}
     */
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

    /**
     * Envía un comando de texto plano formateado con \r\n al servidor
     * y encola una promesa para capturar su respuesta numérica.
     * 
     * @param {string} comando - Comando FTP completo (ej: "USER laura").
     * @returns {Promise<{code: number, message: string, raw: string}>}
     */
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

    /**
     * Procesa líneas de control entrantes y une tramas multilíneas si es necesario.
     * 
     * @param {string} line - Línea cruda sin el salto final de carro.
     */
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

    /**
     * Resuelve la promesa correspondiente en la cola o el handshake inicial.
     */
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

    // ==========================================
    // MÉTODOS DE ALTO NIVEL (LÓGICA DE NEGOCIO)
    // ==========================================

    async login(user, pass) {
        const resUser = await this.enviarComando(`USER ${user}`);
        if (resUser.code === 331) {
            const resPass = await this.enviarComando(`PASS ${pass}`);
            return resPass.code === 230;
        }
        return resUser.code === 230;
    }

    async pwd() {
        const res = await this.enviarComando("PWD");
        if (res.code === 257) {
            // Extraer la ruta entre comillas ej: 257 "/storage" is current directory.
            const match = res.message.match(/"([^"]+)"/);
            return match ? match[1] : res.message;
        }
        throw new Error(`Error en PWD: ${res.code} ${res.message}`);
    }

    async cwd(pathDir) {
        const res = await this.enviarComando(`CWD ${pathDir}`);
        return res.code === 250;
    }

    async cdup() {
        const res = await this.enviarComando("CDUP");
        return res.code === 250;
    }

    async type(mode) {
        const res = await this.enviarComando(`TYPE ${mode}`);
        return res.code === 200;
    }

    async pasv() {
        const res = await this.enviarComando("PASV");
        if (res.code === 227) {
            return parsePASVResponse(res.message);
        }
        throw new Error(`Error en PASV: ${res.code} ${res.message}`);
    }

    async list(pathDir = '') {
        const { host, port } = await this.pasv();
        const dataSocketPromise = conectarCanalDatos(host, port);
        const listCmdPromise = this.enviarComando(`LIST ${pathDir}`);
        
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
                    // Puede responder 226 después de cerrar el socket de datos
                    if (controlRes.code === 226 || controlRes.code === 250) {
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

    async upload(localPath, remoteFile) {
        if (!fs.existsSync(localPath)) {
            throw new Error(`El archivo local no existe: ${localPath}`);
        }
        
        const { host, port } = await this.pasv();
        const dataSocketPromise = conectarCanalDatos(host, port);
        const storCmdPromise = this.enviarComando(`STOR ${remoteFile}`);
        
        const dataSocket = await dataSocketPromise;
        
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(localPath);
            
            readStream.on('error', (err) => {
                reject(err);
            });
            
            dataSocket.on('error', (err) => {
                readStream.destroy();
                reject(err);
            });
            
            readStream.pipe(dataSocket);
            
            readStream.on('end', () => {
                dataSocket.end(async () => {
                    try {
                        const controlRes = await storCmdPromise;
                        if (controlRes.code === 226 || controlRes.code === 250) {
                            resolve(true);
                        } else {
                            reject(new Error(`Fallo al subir archivo: ${controlRes.code}`));
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        });
    }

    async delete(remoteFile) {
        const res = await this.enviarComando(`DELE ${remoteFile}`);
        return res.code === 250;
    }

    async mkd(remoteDir) {
        const res = await this.enviarComando(`MKD ${remoteDir}`);
        return res.code === 257 || res.code === 250;
    }

    async rmd(remoteDir) {
        const res = await this.enviarComando(`RMD ${remoteDir}`);
        return res.code === 250;
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

    /**
     * Descarga un archivo del servidor y lo guarda en la carpeta local downloads/
     */
    async get(remoteFile, localFileName) {
        const nombreLocal = localFileName || path.basename(remoteFile);
        const rutaLocal = path.resolve('./downloads', nombreLocal);

        // Asegurar la existencia de la carpeta downloads/
        const carpetaDownloads = path.dirname(rutaLocal);
        if (!fs.existsSync(carpetaDownloads)) {
            fs.mkdirSync(carpetaDownloads, { recursive: true });
        }

        // 1. Solicitar el modo pasivo
        const pasvRes = await this.enviarComando("PASV");
        if (pasvRes.code !== 227) {
            throw new Error(`No se pudo inicializar el modo pasivo: ${pasvRes.message}`);
        }

        // 2. Extraer el host y el puerto usando la función de Laura
        const { host, port } = parsePASVResponse(pasvRes.message);

        // 3. Conectar al socket de datos mediante la infraestructura de José
        const dataSocket = await conectarCanalDatos(host, port);

        // 4. Solicitar la descarga del archivo de control
        const retrRes = await this.enviarComando(`RETR ${remoteFile}`);
        if (retrRes.code !== 150 && retrRes.code !== 125) {
            dataSocket.destroy();
            throw new Error(`El servidor rechazó la descarga: ${retrRes.message}`);
        }

        // 5. Canalizar el stream de red hacia el archivo en disco
        const writeStream = fs.createWriteStream(rutaLocal);
        dataSocket.pipe(writeStream);

        return new Promise((resolve, reject) => {
            dataSocket.on('end', () => resolve(`Archivo descargado con éxito en: ${rutaLocal}`));
            dataSocket.on('error', (err) => reject(err));
            writeStream.on('error', (err) => reject(err));
        });
    }

    /**
     * Lee un archivo de la carpeta local downloads/ y lo sube al servidor
     */
    async put(localFile, remoteFileName) {
        const rutaLocal = path.resolve('./downloads', localFile);
        if (!fs.existsSync(rutaLocal)) {
            throw new Error(`El archivo '${localFile}' no existe en la carpeta local 'downloads/'`);
        }

        const nombreRemoto = remoteFileName || path.basename(localFile);

        // 1. Solicitar el modo pasivo
        const pasvRes = await this.enviarComando("PASV");
        if (pasvRes.code !== 227) {
            throw new Error(`No se pudo inicializar el modo pasivo: ${pasvRes.message}`);
        }

        // 2. Resolver host y puerto
        const { host, port } = parsePASVResponse(pasvRes.message);

        // 3. Conectar canal de datos (José)
        const dataSocket = await conectarCanalDatos(host, port);

        // 4. Enviar comando STOR
        const storRes = await this.enviarComando(`STOR ${nombreRemoto}`);
        if (storRes.code !== 150 && storRes.code !== 125) {
            dataSocket.destroy();
            throw new Error(`El servidor rechazó la subida: ${storRes.message}`);
        }

        // 5. Canalizar el stream de lectura de disco hacia la red
        const readStream = fs.createReadStream(rutaLocal);
        readStream.pipe(dataSocket);

        return new Promise((resolve, reject) => {
            readStream.on('end', () => {
                dataSocket.end();
                resolve(`Archivo '${localFile}' subido exitosamente como '${nombreRemoto}'`);
            });
            readStream.on('error', (err) => reject(err));
            dataSocket.on('error', (err) => reject(err));
        });
    }
}

// Ejecutar prueba automática si es el script principal
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const cliente = new FtpClient('127.0.0.1', 3000);
    
    (async () => {
        try {
            console.log("[TEST AUTOMÁTICO] Iniciando secuencia de prueba...");
            await cliente.conectar();
            
            const loginOk = await cliente.login("laura", "12345");
            console.log(`[TEST AUTOMÁTICO] Login exitoso: ${loginOk}`);
            
            const currentDir = await cliente.pwd();
            console.log(`[TEST AUTOMÁTICO] Directorio actual: ${currentDir}`);
            
            console.log("[TEST AUTOMÁTICO] Solicitando LIST...");
            const listData = await cliente.list();
            console.log(`[TEST AUTOMÁTICO] Lista recibida:\n${listData}`);
            
            console.log("[TEST AUTOMÁTICO] Finalizando sesión...");
            await cliente.quit();
        } catch (err) {
            console.error("[TEST AUTOMÁTICO ERROR]:", err.message);
        }
    })();

    
}