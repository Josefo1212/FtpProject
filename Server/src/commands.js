import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearCanalPasivo } from './dataChannel.js';
import { formatPASVResponse } from './ftpProtocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.resolve(__dirname, '../storage');

if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

function resolverRutaSegura(cwd, rutaSolicitada) {
    const parts = (rutaSolicitada.startsWith('/') ? rutaSolicitada : path.join(cwd, rutaSolicitada))
        .split(/[/\\]/);
    
    const stack = [];
    for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    
    return path.resolve(STORAGE_ROOT, ...stack);
}

const USUARIOS_VALIDOS = {
    'laura': 'laura123',
    'josefo': 'josefo1212',
    'luismi': 'luismi123'
};

const finalizarTransferencia = (estadoCliente) => {
    if (estadoCliente.dataSocket) {
        estadoCliente.dataSocket.destroy();
        estadoCliente.dataSocket = null;
    }
    if (estadoCliente.dataServer) {
        estadoCliente.dataServer.close();
        estadoCliente.dataServer = null;
    }
};

const comandos = {
    USER: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (estadoCliente.isAuthenticated) {
            socket.write("530 Can't change user. Already logged in.\r\n");
            return;
        }
        if (!arg) {
            socket.write("501 Syntax error in parameters or arguments.\r\n");
            return;
        }
        estadoCliente.username = arg;
        estadoCliente.state = 'NEED_PASS';
        socket.write("331 User name okay, need password.\r\n");
    },
    
    PASS: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (estadoCliente.isAuthenticated) {
            socket.write("530 Already logged in.\r\n");
            return;
        }
        if (estadoCliente.state !== 'NEED_PASS' || !estadoCliente.username) {
            socket.write("503 Bad sequence of commands.\r\n");
            return;
        }
        
        const user = estadoCliente.username.toLowerCase();
        const expectedPass = USUARIOS_VALIDOS[user];
        
        if (expectedPass !== undefined && expectedPass === arg) {
            estadoCliente.isAuthenticated = true;
            estadoCliente.state = 'LOGGED_IN';
            estadoCliente.cwd = '/';
            socket.write("230 User logged in, proceed.\r\n");
        } else {
            estadoCliente.state = 'NOT_LOGGED_IN';
            estadoCliente.username = null;
            socket.write("530 Login incorrect.\r\n");
        }
    },
    
    PASV: async (estadoCliente) => {
        const socket = estadoCliente.socket;
        
        // Limpiar recursos previos del canal pasivo si existían
        finalizarTransferencia(estadoCliente);
        
        try {
            const { puerto, dataSocketPromise, server } = await crearCanalPasivo();
            estadoCliente.dataServer = server;
            estadoCliente.dataSocketPromise = dataSocketPromise;
            
            const pasvAddress = formatPASVResponse('127.0.0.1', puerto);
            socket.write(`227 Entering Passive Mode ${pasvAddress}\r\n`);
        } catch (err) {
            console.error("Error al abrir canal pasivo:", err);
            socket.write("425 Can't open data connection.\r\n");
        }
    },

    LIST: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!estadoCliente.dataSocketPromise) {
            socket.write("425 Can't open data connection. Run PASV first.\r\n");
            return;
        }

        socket.write("150 Opening ASCII mode data connection for directory list.\r\n");

        try {
            // Esperamos a que el cliente se conecte efectivamente al puerto asignado por PASV
            const dataSocket = await estadoCliente.dataSocketPromise;
            const rutaFisica = resolverRutaSegura(estadoCliente.cwd, arg || '');

            if (!fs.existsSync(rutaFisica)) {
                socket.write("550 Directory not found.\r\n");
                dataSocket.destroy();
                return;
            }

            const archivos = fs.readdirSync(rutaFisica);
            let payload = '';

            for (const archivo of archivos) {
                const stats = fs.statSync(path.join(rutaFisica, archivo));
                const esDirectorio = stats.isDirectory() ? 'd' : '-';
                // Formato estandarizado simplificado para la respuesta de listas (Estilo ls -l)
                const tamano = stats.size.toString().padStart(8, ' ');
                const mtime = stats.mtime;
                const meses = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const mes = meses[mtime.getMonth()];
                const dia = mtime.getDate().toString().padStart(2, ' ');
                const hora = mtime.getHours().toString().padStart(2, '0');
                const min = mtime.getMinutes().toString().padStart(2, '0');
                payload += `${esDirectorio}rwxr-xr-x 1 ftpuser ftpgroup ${tamano} ${mes} ${dia} ${hora}:${min} ${archivo}\r\n`;
            }

            // Enviamos los datos mapeados por el canal de datos y cerramos el canal al finalizar
            dataSocket.write(payload, () => {
                dataSocket.end();
                socket.write("226 Closing data connection. Directory send OK.\r\n");
            });

        } catch (err) {
            console.error(`[LIST ERROR]: ${err.message}`);
            socket.write("550 Local error listing directory.\r\n");
        } finally {
            estadoCliente.dataSocketPromise = null;
        }
    },

    RETR: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters or arguments.\r\n");
            return;
        }
        if (!estadoCliente.dataSocketPromise) {
            socket.write("425 Can't open data connection. Run PASV first.\r\n");
            return;
        }

        const rutaFisica = resolverRutaSegura(estadoCliente.cwd, arg);

        if (!fs.existsSync(rutaFisica) || fs.statSync(rutaFisica).isDirectory()) {
            socket.write("550 File not found or is a directory.\r\n");
            return;
        }

        socket.write("150 Opening BINARY mode data connection for requested file.\r\n");

        try {
            const dataSocket = await estadoCliente.dataSocketPromise;
            // Lectura eficiente en disco por flujos (Streams) para evitar colapsar la RAM
            const readStream = fs.createReadStream(rutaFisica);

            readStream.pipe(dataSocket);

            readStream.on('end', () => {
                socket.write("226 Transfer complete.\r\n");
            });

            readStream.on('error', (err) => {
                console.error(`[RETR STREAM ERROR]: ${err.message}`);
                socket.write("551 Error reading file from storage.\r\n");
                dataSocket.destroy();
            });

        } catch (err) {
            console.error(`[RETR ERROR]: ${err.message}`);
            socket.write("451 Local error in processing file download.\r\n");
        } finally {
            estadoCliente.dataSocketPromise = null;
        }
    },
    
    QUIT: async (estadoCliente) => {
        const socket = estadoCliente.socket;
        socket.write("221 Goodbye.\r\n");
        socket.end();
        finalizarTransferencia(estadoCliente);
    }
};
    
export const ejecutarComandoFTP = async (estadoCliente, cmd, arg) => {
    const socket = estadoCliente.socket;
    
    // Verificar si el comando requiere autenticación previa
    const sinAuth = ['USER', 'PASS', 'QUIT'];
    
    if (!sinAuth.includes(cmd) && !estadoCliente.isAuthenticated) {
        socket.write("530 Please login with USER and PASS.\r\n");
        return;
    }
    
    const handler = comandos[cmd];
    if (handler) {
        try {
            await handler(estadoCliente, arg);
        } catch (err) {
            console.error(`[ERROR COMANDO ${cmd}]:`, err);
            socket.write("550 Internal error processing command.\r\n");
        }
    } else {
        socket.write("502 Command not implemented.\r\n");
    }
};
