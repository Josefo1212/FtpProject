import net from 'node:net';
import { manejarNuevaConexion } from './connection.js';

const PORT = 3000;
const HOST = '127.0.0.1';

const server = net.createServer((socket) => {
    manejarNuevaConexion(socket);
}); 

server.on('error', (err) => {
    console.error(`[SERVER ERROR] Ocurrió un fallo en el servidor: ${err.message}`);
});

server.listen(PORT, HOST, () => {
    console.log(`Servidor FTP iniciado y escuchando en tcp://${HOST}:${PORT}`);
});