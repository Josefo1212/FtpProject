import net from 'node:net';

export const crearCanalPasivo = () => {
    return new Promise((resolve, reject) => {
        // Creamos un servidor temporal para los datos
        const dataServer = net.createServer();

        // Al escuchar en el puerto 0, el sistema operativo le asigna un puerto libre aleatorio de forma automática
        dataServer.listen(0, '127.0.0.1', () => {
            const puertoAsignado = dataServer.address().port;
            
            // Creamos una promesa interna que se resolverá SOLOS cuando el cliente se conecte a este puerto
            const dataSocketPromise = new Promise((resolveSocket) => {
                dataServer.once('connection', (socket) => {
                    socket.setKeepAlive(true, 30000);
                    // IMPORTANTE: Cerramos el mini-servidor para que no acepte más conexiones;
                    // el socket actual seguirá vivo transfiriendo los datos.
                    dataServer.close(); 
                    resolveSocket(socket);
                });
            });

            // Retornamos los datos necesarios para el flujo del servidor
            resolve({
                puerto: puertoAsignado,
                dataSocketPromise, // El Integrante 3 usará esto para saber cuándo empezar a escribir el archivo
                server: dataServer
            });
        });

        dataServer.on('error', (err) => {
            reject(err);
        });
    });
}