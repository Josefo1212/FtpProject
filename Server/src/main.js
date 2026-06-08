import net from 'node:net';
import { manejarNuevaConexion } from './connection.js';

// Usamos el puerto 2121 para evitar problemas de permisos de Administrador/Root
const PORT = 3000;
const HOST = '127.0.0.1';

const server = net.createServer((socket) => {
    // Cada vez que un cliente se conecta, delegamos el socket al gestor de conexiones
    manejarNuevaConexion(socket);
});

// Manejo de errores globales del servidor (ej. puerto ocupado)
server.on('error', (err) => {
    console.error(`[SERVER ERROR] Ocurrió un fallo en el servidor: ${err.message}`);
});

// Encendemos el servidor
server.listen(PORT, HOST, () => {
    console.log(`==================================================`);
    console.log(`   Servidor FTP iniciado y escuchando en tcp://${HOST}:${PORT}`);
    console.log(`==================================================`);
});