import net from 'node:net';

export const crearCanalPasivo = () => {
    return new Promise((resolve, reject) => {
        const dataServer = net.createServer();

        dataServer.listen(0, '127.0.0.1', () => {
            const puertoAsignado = dataServer.address().port;
            
            const dataSocketPromise = new Promise((resolveSocket) => {
                dataServer.once('connection', (socket) => {
                    socket.setKeepAlive(true, 30000);
                    dataServer.close(); 
                    resolveSocket(socket);
                });
            });

            resolve({
                puerto: puertoAsignado,
                dataSocketPromise, 
                server: dataServer
            });
        });

        dataServer.on('error', (err) => {
            reject(err);
        });
    });
}