import readline from 'node:readline';
import path from 'node:path';
import { FtpClient } from './ftpClient.js';
import { obtenerPromptDinamico, mostrarMenuAyuda, imprimirRespuestaServidor, UI_COLORS } from './interface.js';

const { RED, GREEN, YELLOW, CYAN, RESET, BOLD } = UI_COLORS;

const HOST = '127.0.0.1';
const PORT = 3000;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: obtenerPromptDinamico()
});

const cliente = new FtpClient(HOST, PORT);

const iniciar = async () => {
    console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}       Cliente FTP — users Josefo, Laura & Luismileo    ${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`  Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos disponibles.\n`);

    console.log(`${CYAN}[INFO] Conectando automáticamente a ${HOST}:${PORT}...${RESET}`);

    try {
        const welcome = await cliente.conectar();
        console.log(`${GREEN}[OK] Conectado exitosamente.${RESET}`);
        imprimirRespuestaServidor(220, welcome.message.trim());
    } catch (err) {
        console.error(`${RED}[ERROR] No se pudo conectar al servidor: ${err.message}${RESET}`);
        console.error(`${RED}        Asegúrate de que el servidor esté corriendo en ${HOST}:${PORT}${RESET}`);
        process.exit(1);
    }

    rl.setPrompt(obtenerPromptDinamico(cliente.host, '/'));
    rl.prompt();
};

const asegurarAutenticado = () => {
    if (!cliente.isAuthenticated) {
        console.log(`${YELLOW}[AVISO] Debes iniciar sesión primero. Usa: ${BOLD}login <usuario> <contraseña>${RESET}`);
        return false;
    }
    return true;
};

rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const command = args[0]?.toLowerCase();
    
    if (!command) {
        rl.prompt();
        return;
    }

    try {
        switch (command) {
            case 'help':
                mostrarMenuAyuda();
                break;

            case 'login': {
                const user = args[1];
                const pass = args[2] || '';
                if (!user) {
                    console.log(`${YELLOW}Uso: ${BOLD}login <usuario> <contraseña>${RESET}`);
                    break;
                }
                if (cliente.isAuthenticated) {
                    console.log(`${YELLOW}[AVISO] Ya tienes una sesión activa.${RESET}`);
                    break;
                }
                console.log(`${CYAN}[INFO] Autenticando usuario "${user}"...${RESET}`);
                const ok = await cliente.login(user, pass);
                if (ok) {
                    console.log(`${GREEN}[OK] ¡Sesión iniciada correctamente! Bienvenido, ${BOLD}${user}${RESET}${GREEN}.${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] Credenciales incorrectas o rechazadas por el servidor.${RESET}`);
                }
                break;
            }

            case 'ls':
            case 'list':
            case 'dir': {
                if (!asegurarAutenticado()) break;
                console.log(`${CYAN}[INFO] Solicitando listado de archivos al servidor...${RESET}`);
                const data = await cliente.list();
                console.log(`${BOLD}${CYAN}┌── LISTADO REMOTO ──────────────────────────────────────┐${RESET}`);
                if (data && data.trim()) {
                    const lineas = data.trim().split('\n');
                    for (const linea of lineas) {
                        console.log(`${CYAN}│${RESET} ${linea.trim()}`);
                    }
                } else {
                    console.log(`${CYAN}│${RESET} ${YELLOW}(Directorio vacío)${RESET}`);
                }
                console.log(`${BOLD}${CYAN}└───────────────────────────────────────────────────────┘${RESET}`);
                break;
            }

            case 'get': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: ${BOLD}get <nombre_archivo>${RESET}`);
                    break;
                }
                const localPath = path.resolve('./downloads', path.basename(remoteFile));
                console.log(`${CYAN}[INFO] Descargando "${remoteFile}" → "${localPath}"...${RESET}`);
                const ok = await cliente.download(remoteFile, localPath);
                if (ok) {
                    console.log(`${GREEN}[OK] Archivo descargado correctamente en: ${BOLD}${localPath}${RESET}`);
                } else {
                    console.error(`${RED}[ERROR] Fallo al descargar el archivo.${RESET}`);
                }
                break;
            }

            case 'quit':
            case 'exit': {
                console.log(`${CYAN}[INFO] Cerrando sesión y desconectando...${RESET}`);
                await cliente.quit();
                console.log(`${GREEN}${BOLD}GOODBYE BRO${RESET}`);
                process.exit(0);
                break;
            }

            default:
                console.log(`${RED}Comando no reconocido: "${command}".${RESET} Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos disponibles.`);
                break;
        }
    } catch (err) {
        console.error(`${RED}[ERROR]: ${err.message}${RESET}`);
    }

    rl.setPrompt(obtenerPromptDinamico(cliente.host, '/'));
    rl.prompt();
});

iniciar();
