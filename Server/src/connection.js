import { v4 as uuidv4 } from 'uuid'; // Si no usas uuid, puedes usar crypto.randomUUID() de Node nativo

// Mapa en memoria para rastrear a todos los clientes conectados actualmente
const clientesConectados = new Map();

export const manejarNuevaConexion = (socket) => {
    // Generamos un ID único para esta sesión de cliente
    const clientId = crypto.randomUUID();
    
    console.log(`[CONEXIÓN] Nuevo cliente conectado desde ${socket.remoteAddress}:${socket.remotePort} (ID: ${clientId})`);

    // Creamos el objeto de estado inicial del cliente
    const estadoCliente = {
        id: clientId,
        socket: socket,
        username: null,
        isAuthenticated: false,
        isPassiveMode: false,
        dataServer: null, // Guardará el mini-servidor temporal para el canal de datos
        dataSocket: null  // Guardará el socket de datos una vez conectado
    };

    // Guardamos al cliente en nuestro mapa de control activo
    clientesConectados.set(clientId, estadoCliente);

    // Configuración inicial del socket
    socket.setEncoding('utf-8'); // Para recibir strings y no Buffers crudos de bytes
    socket.setKeepAlive(true, 60000); // Mantiene la conexión viva y detecta caídas de red

    // 1. SALUDO INICIAL: Según el protocolo FTP, el servidor DEBE hablar primero
    socket.write("220 Servicio FTP de Josefo listo.\r\n");

    // 2. ESCUCHA DE COMANDOS (Canal de Control)
    socket.on('data', (data) => {
        console.log(`[CLIENTE ${clientId}]: ${data.trim()}`);
        
        // AQUÍ ES DONDE EL INTEGRANTE 2 INTERCEPTARÁ EL TEXTO
        // Por ahora, una respuesta temporal para que veas el eco
        if (data.toUpperCase().startsWith('QUIT')) {
            socket.write("221 Goodbye.\r\n");
            socket.end();
        } else {
            // El Integrante 2 reemplazará esta línea con su procesador de comandos
            socket.write("500 Comando no implementado aún en esta fase.\r\n");
        }
    });

    // 3. MANEJO DE CIERRE DE CONEXIÓN
    socket.on('close', () => {
        console.log(`[DESCONEXIÓN] El cliente ${clientId} ha cerrado la sesión.`);
        limpiarRecursosCliente(clientId);
    });

    // 4. MANEJO DE ERRORES DEL SOCKET CLIENTE
    socket.on('error', (err) => {
        console.error(`[SOCKET ERROR] Error en cliente ${clientId}: ${err.message}`);
        // No hace falta llamar a socket.end(), el evento 'close' se disparará automáticamente
    });
}

// Función auxiliar para evitar fugas de memoria si el cliente se cae abruptamente
const limpiarRecursosCliente = (clientId) => {
    const cliente = clientesConectados.get(clientId);
    if (cliente) {
        // Si dejó un servidor pasivo abierto, lo cerramos
        if (cliente.dataServer) cliente.dataServer.close();
        if (cliente.dataSocket) cliente.dataSocket.destroy();
        
        clientesConectados.delete(clientId);
        console.log(`[MEMORIA] Recursos liberados para el cliente ${clientId}. Total activos: ${clientesConectados.size}`);
    }
}