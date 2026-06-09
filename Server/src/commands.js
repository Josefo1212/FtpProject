import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearCanalPasivo } from './dataChannel.js';
import { formatPASVResponse } from './ftpProtocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.resolve(__dirname, '../storage');

// Asegurarse de que exista el directorio de almacenamiento raíz
if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

/**
 * Resuelve una ruta FTP en su correspondiente ruta FTP normalizada y en la ruta física real
 * dentro de la carpeta 'storage' del servidor. Previene vulnerabilidades de Directory Traversal (chroot).
 * 
 * @param {string} cwd - Directorio de trabajo actual del cliente en formato FTP (ej: '/').
 * @param {string} rutaSolicitada - Ruta provista por el comando del cliente.
 * @returns {{ rutaFTP: string, rutaFisica: string }}
 */
export function resolverRutaSegura(cwd, rutaSolicitada) {
    // Dividimos por barras / o \
    const parts = (rutaSolicitada.startsWith('/') ? rutaSolicitada : path.join(cwd, rutaSolicitada))
        .split(/[/\\]/);
    
    const stack = [];
    for (const part of parts) {
        if (part === '' || part === '.') {
            continue;
        }
        if (part === '..') {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    
    const rutaFTP = '/' + stack.join('/');
    const rutaFisica = path.resolve(STORAGE_ROOT, ...stack);
    
    return {
        rutaFTP,
        rutaFisica
    };
}

// Catálogo de usuarios válidos para pruebas académicas
const USUARIOS_VALIDOS = {
    'laura': '12345',
    'josefo': 'josefo1212',
    'anonymous': ''
};

// Formateador de listados estilo Unix 'ls -l'
const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatearFicheroLista(nombre, stats) {
    const esDir = stats.isDirectory();
    const permisos = esDir ? "drwxr-xr-x" : "-rw-r--r--";
    const enlaces = "1";
    const usuario = "ftpuser";
    const grupo = "ftpgroup";
    const tamano = stats.size.toString().padStart(8, ' ');
    
    const mtime = stats.mtime;
    const mes = MESES[mtime.getMonth()];
    const dia = mtime.getDate().toString().padStart(2, ' ');
    const hora = mtime.getHours().toString().padStart(2, '0');
    const min = mtime.getMinutes().toString().padStart(2, '0');
    const fechaStr = `${mes} ${dia} ${hora}:${min}`;
    
    return `${permisos} ${enlaces.padStart(3, ' ')} ${usuario.padEnd(8, ' ')} ${grupo.padEnd(8, ' ')} ${tamano} ${fechaStr} ${nombre}`;
}

// Helpers para obtención y liberación del canal de datos pasivo
async function obtenerDataSocket(estadoCliente) {
    if (estadoCliente.dataSocket) {
        return estadoCliente.dataSocket;
    }
    if (!estadoCliente.dataSocketPromise) {
        throw new Error("NO_PASSIVE");
    }
    
    // Esperar conexión física con un timeout de 10 segundos
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("TIMEOUT")), 10000);
    });
    
    const dataSocket = await Promise.race([
        estadoCliente.dataSocketPromise,
        timeoutPromise
    ]);
    
    estadoCliente.dataSocket = dataSocket;
    estadoCliente.dataSocketPromise = null; // Consumida
    return dataSocket;
}

function finalizarTransferencia(estadoCliente) {
    if (estadoCliente.dataSocket) {
        estadoCliente.dataSocket.destroy();
        estadoCliente.dataSocket = null;
    }
    if (estadoCliente.dataServer) {
        estadoCliente.dataServer.close();
        estadoCliente.dataServer = null;
    }
}

// Diccionario de Handlers de comandos FTP
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
        
        if (expectedPass !== undefined && (user === 'anonymous' || expectedPass === arg)) {
            estadoCliente.isAuthenticated = true;
            estadoCliente.state = 'LOGGED_IN';
            estadoCliente.cwd = '/';
            estadoCliente.representationType = 'I';
            socket.write("230 User logged in, proceed.\r\n");
        } else {
            estadoCliente.state = 'NOT_LOGGED_IN';
            estadoCliente.username = null;
            socket.write("530 Login incorrect.\r\n");
        }
    },
    
    SYST: async (estadoCliente) => {
        estadoCliente.socket.write("215 UNIX Type: L8\r\n");
    },
    
    FEAT: async (estadoCliente) => {
        estadoCliente.socket.write("211-Features:\r\n UTF8\r\n211 End\r\n");
    },
    
    NOOP: async (estadoCliente) => {
        estadoCliente.socket.write("200 NOOP ok.\r\n");
    },
    
    PWD: async (estadoCliente) => {
        estadoCliente.socket.write(`257 "${estadoCliente.cwd}" is current directory.\r\n`);
    },
    
    CWD: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters.\r\n");
            return;
        }
        
        const { rutaFTP, rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);
        
        try {
            const stats = await fs.promises.stat(rutaFisica);
            if (stats.isDirectory()) {
                estadoCliente.cwd = rutaFTP;
                socket.write(`250 Directory successfully changed to "${rutaFTP}".\r\n`);
            } else {
                socket.write("550 Not a directory.\r\n");
            }
        } catch (err) {
            socket.write("550 Directory not found.\r\n");
        }
    },
    
    CDUP: async (estadoCliente) => {
        await comandos.CWD(estadoCliente, '..');
    },
    
    TYPE: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        const type = arg.toUpperCase();
        if (type === 'A' || type === 'I') {
            estadoCliente.representationType = type;
            socket.write(`200 Type set to ${type}.\r\n`);
        } else {
            socket.write("504 Command not implemented for that parameter.\r\n");
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
    
    DELE: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters.\r\n");
            return;
        }
        
        const { rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);
        
        try {
            const stats = await fs.promises.stat(rutaFisica);
            if (stats.isDirectory()) {
                socket.write("550 Cannot delete directory. Use RMD.\r\n");
                return;
            }
            await fs.promises.unlink(rutaFisica);
            socket.write("250 File deleted successfully.\r\n");
        } catch (err) {
            socket.write("550 File not found.\r\n");
        }
    },
    
    MKD: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters.\r\n");
            return;
        }
        const { rutaFTP, rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);
        try {
            await fs.promises.mkdir(rutaFisica);
            socket.write(`257 "${rutaFTP}" created.\r\n`);
        } catch (err) {
            socket.write("550 Directory could not be created.\r\n");
        }
    },
    
    RMD: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters.\r\n");
            return;
        }
        const { rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);
        try {
            const stats = await fs.promises.stat(rutaFisica);
            if (!stats.isDirectory()) {
                socket.write("550 Not a directory.\r\n");
                return;
            }
            await fs.promises.rmdir(rutaFisica);
            socket.write("250 Directory removed successfully.\r\n");
        } catch (err) {
            socket.write("550 Directory not found or not empty.\r\n");
        }
    },
    
    QUIT: async (estadoCliente) => {
        await comandos.QUIT_INTERNAL(estadoCliente);
    },
    
    QUIT_INTERNAL: async (estadoCliente) => {
        const socket = estadoCliente.socket;
        socket.write("221 Goodbye.\r\n");
        socket.end();
        finalizarTransferencia(estadoCliente);
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
            const { rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg || '');

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
                payload += `${esDirectorio}rwxr-xr-x 1 owner group ${stats.size} Jun 08 19:19 ${archivo}\r\n`;
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

        const { rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);

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

    STOR: async (estadoCliente, arg) => {
        const socket = estadoCliente.socket;
        if (!arg) {
            socket.write("501 Syntax error in parameters or arguments.\r\n");
            return;
        }
        if (!estadoCliente.dataSocketPromise) {
            socket.write("425 Can't open data connection. Run PASV first.\r\n");
            return;
        }

        socket.write("150 Ok to send data. Ready for incoming stream.\r\n");

        try {
            const dataSocket = await estadoCliente.dataSocketPromise;
            const { rutaFisica } = resolverRutaSegura(estadoCliente.cwd, arg);
            
            // Escritura directa en disco conforme llegan los fragmentos binarios por la red
            const writeStream = fs.createWriteStream(rutaFisica);

            dataSocket.pipe(writeStream);

            dataSocket.on('end', () => {
                socket.write("226 Transfer complete. File written to storage successfully.\r\n");
            });

            dataSocket.on('error', (err) => {
                console.error(`[STOR NETWORK ERROR]: ${err.message}`);
                socket.write("426 Connection closed; transfer aborted.\r\n");
                writeStream.destroy();
            });

            writeStream.on('error', (err) => {
                console.error(`[STOR DISK ERROR]: ${err.message}`);
                socket.write("552 Requested file action aborted. Disk error.\r\n");
                dataSocket.destroy();
            });

        } catch (err) {
            console.error(`[STOR ERROR]: ${err.message}`);
            socket.write("451 Local error in processing file upload.\r\n");
        } finally {
            estadoCliente.dataSocketPromise = null;
        }
    }
};

/**
 * Despacha un comando FTP recibido del cliente, validando previamente el estado de autenticación.
 * 
 * @param {object} estadoCliente - Estado asociado a la conexión del cliente.
 * @param {string} cmd - Comando FTP en mayúsculas (ej: 'USER').
 * @param {string} arg - Argumento del comando (ej: 'laura').
 */
export async function ejecutarComandoFTP(estadoCliente, cmd, arg) {
    const socket = estadoCliente.socket;
    
    // Verificar si el comando requiere autenticación previa
    const requiereAuth = !['USER', 'PASS', 'QUIT', 'SYST', 'FEAT', 'NOOP'].includes(cmd);
    
    if (requiereAuth && !estadoCliente.isAuthenticated) {
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
}
