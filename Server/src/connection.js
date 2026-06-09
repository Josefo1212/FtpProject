import crypto from 'node:crypto';
import { parseFTPLine } from './ftpProtocol.js';
import { ejecutarComandoFTP } from './commands.js';

const clientesConectados = new Map();

export const manejarNuevaConexion = (socket) => {
    const clientId = crypto.randomUUID();
    console.log(`[CONEXIÓN] Nuevo cliente conectado (ID: ${clientId}) desde ${socket.remoteAddress}:${socket.remotePort}`);

    // Inicializamos el estado del cliente según el protocolo FTP
    const estadoCliente = {
        id: clientId,
        socket: socket,
        isAuthenticated: false,
        state: 'NOT_LOGGED_IN',
        username: null,
        cwd: '/',
        dataServer: null,
        dataSocketPromise: null,
        dataSocket: null
    };

    clientesConectados.set(clientId, estadoCliente);

    socket.setEncoding('utf-8');
    socket.setKeepAlive(true, 60000);

    // Mensaje de bienvenida estándar (Código 220)
    socket.write("220 Servicio FTP de Josefo y Laura listo.\r\n");

    // Buffer para reconstruir líneas completas (\r\n)
    let buffer = '';

    socket.on('data', async (chunk) => {
        buffer += chunk;
        let newlineIndex;
        
        // Mientras haya saltos de línea, extraemos y procesamos comandos
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, newlineIndex);
            buffer = buffer.substring(newlineIndex + 1);
            
            // Omitir líneas vacías (ej: ping de red, etc.)
            if (line.trim() === '') continue;

            const { command, arg } = parseFTPLine(line);
            console.log(`[CLIENTE Control - ID: ${clientId.substring(0, 8)}]: CMD=${command} ARG="${arg}"`);

            try {
                await ejecutarComandoFTP(estadoCliente, command, arg);
            } catch (err) {
                console.error(`[ERROR EXEC] Error al ejecutar comando "${command}":`, err.message);
                if (!socket.destroyed) {
                    socket.write("550 Error interno al procesar el comando.\r\n");
                }
            }
        }
    });

    socket.on('close', () => {
        console.log(`[DESCONEXIÓN] Cliente ${clientId.substring(0, 8)} desconectado.`);
        limpiarRecursosCliente(clientId);
    });

    socket.on('error', (err) => {
        console.error(`[SOCKET ERROR - ID: ${clientId.substring(0, 8)}]: ${err.message}`);
    });
};

const limpiarRecursosCliente = (clientId) => {
    const cliente = clientesConectados.get(clientId);
    if (cliente) {
        try {
            if (cliente.dataSocket) {
                cliente.dataSocket.destroy();
            }
            if (cliente.dataServer) {
                cliente.dataServer.close();
            }
        } catch (err) {
            console.error(`Error al limpiar recursos del cliente ${clientId.substring(0, 8)}:`, err.message);
        }
        clientesConectados.delete(clientId);
    }
};