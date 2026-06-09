import net from 'node:net';

export const conectarCanalDatos = (host, port) => {
    return new Promise((resolve, reject) => {
        console.log(`[DATA] Conectando al canal de datos en ${host}:${port}...`);
        
        const dataSocket = net.createConnection({ host, port }, () => {
            console.log(`[DATA] ¡Conexión de datos establecida con éxito!`);
            resolve(dataSocket);
        });

        dataSocket.once('error', reject);
    });
};