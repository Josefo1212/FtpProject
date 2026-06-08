import crypto from 'node:crypto';
import { crearCanalPasivo } from './dataChannel.js';

const clientesConectados = new Map();

export const manejarNuevaConexion = (socket) => {
    const clientId = crypto.randomUUID();
    console.log(`[CONEXIÓN] Nuevo cliente (ID: ${clientId}) desde ${socket.remoteAddress}:${socket.remotePort}`);

    const estadoCliente = {
        id: clientId,
        socket: socket,
        isAuthenticated: false,
        dataServer: null,
        dataSocket: null
    };

    clientesConectados.set(clientId, estadoCliente);

    socket.setEncoding('utf-8');
    socket.setKeepAlive(true, 60000);

    // Saludo inicial
    socket.write("220 Servicio FTP de Josefo listo.\r\n");

    socket.on('data', async (data) => {
        const comando = data.trim().toUpperCase();
        console.log(`[CLIENTE Control]: ${comando}`);

        // --- SIMULACIÓN DEL COMANDO PASV ---
        if (comando.startsWith('PASV')) {
            try {
                // 1. Llamamos a tu función para abrir el puerto aleatorio
                const { puerto, dataSocketPromise, server } = await crearCanalPasivo();
                estadoCliente.dataServer = server;

                console.log(`[SERVER] Canal de datos abierto esperando en el puerto: ${puerto}`);
                
                // 2. Le respondemos al cliente por el canal de CONTROL diciéndole a dónde conectarse
                // Nota: Usamos un formato simple para la prueba: (IP,PUERTO)
                socket.write(`227 Entering Passive Mode (127,0,0,1,${puerto})\r\n`);

                // 3. Nos quedamos esperando a que el cliente se conecte a ese segundo tubo
                const dataSocket = await dataSocketPromise;
                estadoCliente.dataSocket = dataSocket;
                console.log(`[SERVER-DATA] ¡El cliente se conectó físicamente al puerto de datos ${puerto}!`);

                // 4. Simulamos un envío de datos (Aquí el Integrante 3 mandaría un archivo)
                dataSocket.write("Contenido del archivo: ¡Felicidades, el canal de datos funciona!\r\n");
                
                // 5. El protocolo dicta que al terminar de transferir, se cierra el canal de datos
                dataSocket.end(); 

            } catch (err) {
                console.error(`Error al crear canal pasivo: ${err.message}`);
                socket.write("425 Can't open data connection.\r\n");
            }
        } 
        // --- OTROS COMANDOS TEMPORALES ---
        else if (comando.startsWith('QUIT')) {
            socket.write("221 Goodbye.\r\n");
            socket.end();
        } else {
            socket.write("500 Comando no implementado aún.\r\n");
        }
    });

    socket.on('close', () => {
        console.log(`[DESCONEXIÓN] Cliente ${clientId} desconectado.`);
        limpiarRecursosCliente(clientId);
    });

    socket.on('error', (err) => {
        console.error(`[SOCKET ERROR]: ${err.message}`);
    });
};

const limpiarRecursosCliente = (clientId) => {
    const cliente = clientesConectados.get(clientId);
    if (cliente) {
        if (cliente.dataServer) cliente.dataServer.close();
        if (cliente.dataSocket) cliente.dataSocket.destroy();
        clientesConectados.delete(clientId);
    }
};