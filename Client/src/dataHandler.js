import net from 'node:net';

export const conectarCanalDatos = (host, puerto) => {
    return new Promise((resolve, reject) => {
        console.log(`[DATA] Conectando al canal de datos en ${host}:${puerto}...`);
        
        const dataSocket = net.createConnection({ host, port: puerto }, () => {
            console.log(`[DATA] ¡Conexión de datos establecida con éxito!`);
            resolve(dataSocket); // Le entregamos el socket al Integrante 3 para que descargue/suba los bytes
        });

        dataSocket.on('error', (err) => {
            console.error(`[DATA ERROR] Error en el canal de datos: ${err.message}`);
            reject(err);
        });
    });
}