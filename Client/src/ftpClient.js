import net from 'node:net';
import { conectarCanalDatos } from './dataHandler.js';

class FtpClient {
    constructor(host = '127.0.0.1', port = 3000) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;
    }

    conectar() {
        return new Promise((resolve, reject) => {
            this.controlSocket = net.createConnection({ host: this.host, port: this.port }, () => {
                console.log(`[SISTEMA] Conectado al canal de control en ${this.host}:${this.port}`);
            });

            this.controlSocket.setEncoding('utf-8');

            this.controlSocket.on('data', async (data) => {
                console.log(`[SERVIDOR Control]: ${data.trim()}`);
                
                // Si es el saludo inicial, resolvemos la promesa
                if (data.startsWith('220')) {
                    resolve(true);
                }

                // --- SI EL SERVIDOR RESPONDE QUE ENTRÓ EN MODO PASIVO ---
                if (data.startsWith('227')) {
                    // Extraemos el puerto usando una expresión regular sencilla
                    const matches = data.match(/127,0,0,1,(\d+)/);
                    if (matches) {
                        const puertoDatos = parseInt(matches[1], 10);
                        
                        // ¡Llamamos a tu función para conectar el segundo tubo!
                        const dataSocket = await conectarCanalDatos(this.host, puertoDatos);
                        
                        // Nos quedamos escuchando lo que venga por el tubo de DATOS
                        dataSocket.on('data', (dataBytes) => {
                            console.log(`\n[SERVIDOR Datos Devuelve]:\n--> ${dataBytes.toString().trim()}`);
                        });

                        dataSocket.on('close', () => {
                            console.log("[DATA] Canal de datos cerrado por el servidor de forma limpia.");
                        });
                    }
                }
            });

            this.controlSocket.on('close', () => {
                console.log('[SISTEMA] Conexión de control finalizada.');
                process.exit(0);
            });

            this.controlSocket.on('error', (err) => {
                reject(err);
            });
        });
    }

    enviarComando(comando) {
        if (this.controlSocket && !this.controlSocket.destroyed) {
            this.controlSocket.write(`${comando.trim()}\r\n`);
        }
    }
}

// =================================================================
// FLUJO DE LA PRUEBA FINAL
// =================================================================
const cliente = new FtpClient('127.0.0.1', 3000);

async function iniciar() {
    try {
        await cliente.conectar();
        
        // A los 2 segundos, el cliente solicita entrar en Modo Pasivo
        setTimeout(() => {
            console.log("\n[TEST] Solicitando Modo Pasivo (PASV)...");
            cliente.enviarComando("PASV");
        }, 2000);

        // A los 6 segundos, cerramos la app de forma ordenada
        setTimeout(() => {
            console.log("\n[TEST] Terminando simulación...");
            cliente.enviarComando("QUIT");
        }, 6000);

    } catch (err) {
        console.error("Error en la ejecución:", err.message);
    }
}

iniciar();