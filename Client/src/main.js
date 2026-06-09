import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { FtpClient } from './ftpClient.js';
import { obtenerPromptDinamico, mostrarMenuAyuda, UI_COLORS } from './interface.js';

// Extraemos los mismos nombres de variables directamente de tu archivo interface.js
const { RED, GREEN, YELLOW, CYAN, RESET, BOLD } = UI_COLORS;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: obtenerPromptDinamico() // <- Llama a la función sin parámetros para el estado desconectado
});

let cliente = null;

console.log(`===========================================================`);
console.log(`       ${BOLD}${CYAN}Cliente FTP Interactivo - Proyecto Josefo & Laura${RESET}`);
console.log(`   Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos soportados.`);
console.log(`   Por defecto, puedes conectar escribiendo: ${BOLD}${GREEN}connect${RESET}`);
console.log(`===========================================================`);

rl.prompt();

rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    
    if (!command) {
        rl.prompt();
        return;
    }

    try {
        switch (command) {
            case 'help':
                mostrarMenuAyuda();
                break;
                
            case 'connect': {
                const host = args[1] || '127.0.0.1';
                const port = parseInt(args[2], 10) || 3000;
                console.log(`${CYAN}[INFO] Conectando a ${host}:${port}...${RESET}`);
                cliente = new FtpClient(host, port);
                
                try {
                    const welcome = await cliente.conectar();
                    console.log(`${GREEN}[OK] Conectado exitosamente. Saludo del servidor:${RESET}`);
                    console.log(welcome.raw.trim());
                } catch (err) {
                    console.error(`${RED}[ERROR] No se pudo establecer la conexión: ${err.message}${RESET}`);
                    cliente = null;
                }
                break;
            }
            
            case 'login': {
                if (!asegurarConectado()) break;
                const user = args[1];
                const pass = args[2] || '';
                if (!user) {
                    console.log(`${YELLOW}Uso: login <usuario> <contraseña>${RESET}`);
                    break;
                }
                console.log(`${CYAN}[INFO] Autenticando usuario "${user}"...${RESET}`);
                const ok = await cliente.login(user, pass);
                if (ok) {
                    console.log(`${GREEN}[OK] ¡Sesión iniciada correctamente!${RESET}`);
                    cliente.currentCwd = await cliente.pwd();
                } else {
                    console.error(`${RED}[ERROR] Credenciales incorrectas o rechazadas por el servidor.${RESET}`);
                }
                break;
            }
            
            case 'pwd': {
                if (!asegurarConectado()) break;
                const curDir = await cliente.pwd();
                console.log(`${GREEN}[OK] Directorio remoto actual: "${curDir}"${RESET}`);
                break;
            }
            
            case 'ls':
            case 'dir':
            case 'list': {
                if (!asegurarConectado()) break;
                const pathDir = args.slice(1).join(' ');
                console.log(`${CYAN}[INFO] Obteniendo listado de directorio...${RESET}`);
                const data = await cliente.list(pathDir);
                console.log(`${CYAN}--- INICIO DEL LISTADO REMOTE ---${RESET}`);
                console.log(data || '(Directorio vacío)');
                console.log(`${CYAN}--- FIN DEL LISTADO REMOTO ---${RESET}`);
                break;
            }
            
            case 'cd': {
                if (!asegurarConectado()) break;
                const pathDir = args.slice(1).join(' ');
                if (!pathDir) {
                    console.log(`${YELLOW}Uso: cd <directorio>${RESET}`);
                    break;
                }
                const ok = await cliente.cwd(pathDir);
                if (ok) {
                    console.log(`${GREEN}[OK] Directorio cambiado correctamente.${RESET}`);
                    cliente.currentCwd = await cliente.pwd();
                } else {
                    console.error(`${RED}[ERROR] No se pudo cambiar de directorio.${RESET}`);
                }
                break;
            }
            
            case 'cdup': {
                if (!asegurarConectado()) break;
                const ok = await cliente.cdup();
                if (ok) {
                    console.log(`${GREEN}[OK] Subido un nivel en el directorio.${RESET}`);
                    cliente.currentCwd = await cliente.pwd();
                } else {
                    console.error(`${RED}[ERROR] No se pudo subir de nivel.${RESET}`);
                }
                break;
            }
            
            case 'type': {
                if (!asegurarConectado()) break;
                const mode = (args[1] || '').toUpperCase();
                if (mode !== 'A' && mode !== 'I') {
                    console.log(`${YELLOW}Uso: type <A|I> (A = ASCII, I = Binary/Image)${RESET}`);
                    break;
                }
                const ok = await cliente.type(mode);
                if (ok) {
                    console.log(`${GREEN}[OK] Modo cambiado a: ${mode === 'A' ? 'ASCII' : 'Binario'}${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] Modo no soportado.${RESET}`);
                }
                break;
            }
            
            case 'get':
            case 'recv': {
                if (!asegurarConectado()) break;
                const remoteFile = args[1];
                let localPath = args[2] || remoteFile;
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: get <archivo_remoto> [ruta_local]${RESET}`);
                    break;
                }
                
                // Si la ruta local es relativa o es solo un nombre, la guardamos localmente en la carpeta Client
                if (!path.isAbsolute(localPath)) {
                    localPath = path.resolve('Client', localPath);
                }
                
                console.log(`${CYAN}[INFO] Descargando "${remoteFile}" hacia "${localPath}"...${RESET}`);
                const ok = await cliente.download(remoteFile, localPath);
                if (ok) {
                    console.log(`${GREEN}[OK] Descarga completada correctamente.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] Error al descargar el archivo.${RESET}`);
                }
                break;
            }
            
            case 'put':
            case 'send': {
                if (!asegurarConectado()) break;
                let localPath = args[1];
                const remoteFile = args[2] || (localPath ? path.basename(localPath) : '');
                
                if (!localPath) {
                    console.log(`${YELLOW}Uso: put <archivo_local> [archivo_remoto]${RESET}`);
                    break;
                }
                
                // Si la ruta es relativa y no existe localmente, buscamos dentro de la carpeta Client
                if (!fs.existsSync(localPath)) {
                    const fallbackPath = path.resolve('Client', localPath);
                    if (fs.existsSync(fallbackPath)) {
                        localPath = fallbackPath;
                    } else {
                        console.error(`${RED}[ERROR] El archivo local no existe en ninguna ruta: ${localPath}${RESET}`);
                        break;
                    }
                }
                
                console.log(`${CYAN}[INFO] Subiendo "${localPath}" como "${remoteFile}"...${RESET}`);
                const ok = await cliente.upload(localPath, remoteFile);
                if (ok) {
                    console.log(`${GREEN}[OK] Subida completada correctamente.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] Error al subir el archivo.${RESET}`);
                }
                break;
            }
            
            case 'delete':
            case 'del': {
                if (!asegurarConectado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: delete <archivo_remoto>${RESET}`);
                    break;
                }
                const ok = await cliente.delete(remoteFile);
                if (ok) {
                    console.log(`${GREEN}[OK] Archivo remoto eliminado.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] No se pudo eliminar el archivo remoto.${RESET}`);
                }
                break;
            }
            
            case 'mkdir': {
                if (!asegurarConectado()) break;
                const remoteDir = args[1];
                if (!remoteDir) {
                    console.log(`${YELLOW}Uso: mkdir <carpeta_remota>${RESET}`);
                    break;
                }
                const ok = await cliente.mkd(remoteDir);
                if (ok) {
                    console.log(`${GREEN}[OK] Directorio creado correctamente.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] No se pudo crear el directorio remoto.${RESET}`);
                }
                break;
            }
            
            case 'rmdir': {
                if (!asegurarConectado()) break;
                const remoteDir = args[1];
                if (!remoteDir) {
                    console.log(`${YELLOW}Uso: rmdir <carpeta_remota>${RESET}`);
                    break;
                }
                const ok = await cliente.rmd(remoteDir);
                if (ok) {
                    console.log(`${GREEN}[OK] Directorio remoto eliminado.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] No se pudo eliminar el directorio remoto.${RESET}`);
                }
                break;
            }
            
            case 'raw': {
                if (!asegurarConectado()) break;
                const rawCmd = args.slice(1).join(' ');
                if (!rawCmd) {
                    console.log(`${YELLOW}Uso: raw <comando_ftp_crudo>${RESET}`);
                    break;
                }
                console.log(`${CYAN}[CONTROL] Enviando: "${rawCmd}"${RESET}`);
                const res = await cliente.enviarComando(rawCmd);
                console.log(`${YELLOW}[CONTROL RESP]: Code=${res.code}, Msg="${res.message.trim()}"${RESET}`);
                break;
            }
            
            case 'quit':
            case 'exit':
            case 'bye':
                if (cliente) {
                    console.log(`${CYAN}[INFO] Cerrando sesión y desconectando...${RESET}`);
                    await cliente.quit();
                }
                console.log(`${GREEN}¡Hasta luego!${RESET}`);
                process.exit(0);
                break;
                
            default:
                console.log(`${RED}Comando no reconocido: "${command}". Escribe "help" para ver comandos disponibles.${RESET}`);
                break;
        }
    } catch (err) {
        console.error(`${RED}[ERROR DE CONTROL]: ${err.message}${RESET}`);
    }

    rl.setPrompt(obtenerPromptDinamico(cliente?.host, cliente?.currentCwd));
    rl.prompt();
});

function asegurarConectado() {
    if (!cliente || !cliente.controlSocket || cliente.controlSocket.destroyed) {
        console.error(`${RED}[ERROR] No estás conectado a ningún servidor. Usa primero: connect [host] [puerto]${RESET}`);
        return false;
    }
    return true;
}

