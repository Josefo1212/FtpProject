import net from 'node:net';

class FtpClient {
    constructor(host = '127.0.0.1', port = 3000) {
        this.host = host;
        this.port = port;
        this.controlSocket = null;
    }

    conectar() {
        return new Promise((resolve, reject) => {
            // Creamos el socket de conexión hacia el canal de control del servidor
            this.controlSocket = net.createConnection({ host: this.host, port: this.port }, () => {
                console.log(`[SISTEMA] Conectado físicamente al servidor ${this.host}:${this.port}`);
            });

            this.controlSocket.setEncoding('utf-8');

            // ESCUCHA DE RESPUESTAS DEL SERVIDOR
            this.controlSocket.on('data', (data) => {
                // Imprime directamente lo que responde el servidor (ej: "220 Servicio listo")
                console.log(`\n[SERVIDOR]: ${data.trim()}`);
                
                // AQUÍ EL INTEGRANTE 2 INTERCEPTARÁ LOS CÓDIGOS (220, 230, etc.)
                if (data.startsWith('220')) {
                    resolve(true); // Conexión y saludo exitoso
                }
            });

            // MANEJO DE CIERRE
            this.controlSocket.on('close', () => {
                console.log('\n[SISTEMA] Conexión con el servidor finalizada.');
                process.exit(0);
            });

            // MANEJO DE ERRORES DE CONEXIÓN INICIAL
            this.controlSocket.on('error', (err) => {
                console.error(`[ERROR CLIENTE] No se pudo conectar: ${err.message}`);
                reject(err);
            });
        });
    }

    /**
     * Envía un comando formateado bajo el estándar FTP (\r\n al final)
     * @param {string} comando - El comando plano (ej: "USER anonimo")
     */
    enviarComando(comando) {
        if (!this.controlSocket || this.controlSocket.destroyed) {
            console.error('[ERROR] No hay una conexión activa con el servidor.');
            return;
        }
        // El protocolo FTP exige imperativamente terminar cada línea con Carriage Return y Line Feed
        this.controlSocket.write(`${comando.trim()}\r\n`);
    }
}

// =================================================================
// EJECUCIÓN DE PRUEBA (Para validar tu Hito 1)
// =================================================================
const cliente = new FtpClient('127.0.0.1', 3000);

async function iniciarPrueba() {
    try {
        await cliente.conectar();
        
        // Simulamos que el usuario escribe comandos en la consola tras recibir el saludo
        setTimeout(() => {
            console.log("[TEST] Enviando comando de prueba USER...");
            cliente.enviarComando("USER josefo");
        }, 1500);

        setTimeout(() => {
            console.log("[TEST] Cerrando sesión con QUIT...");
            cliente.enviarComando("QUIT");
        }, 4000);

    } catch (error) {
        console.error("Fallo la inicialización del cliente de prueba.");
    }
}

iniciarPrueba();