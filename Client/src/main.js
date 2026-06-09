import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { FtpClient } from './ftpClient.js';
import { obtenerPromptDinamico, imprimirRespuestaServidor, UI_COLORS } from './interface.js';

const { RED, GREEN, YELLOW, CYAN, MAGENTA, RESET, BOLD } = UI_COLORS;

const HOST = '127.0.0.1';
const PORT = 21;

const DOWNLOADS_DIR = path.resolve('./downloads');
const UPLOADS_DIR = path.resolve('./uploads');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: obtenerPromptDinamico()
});

const cliente = new FtpClient(HOST, PORT);

const pregunta = (texto) => {
    return new Promise((resolve) => {
        rl.question(texto, (respuesta) => {
            resolve(respuesta);
        });
    });
};

const mostrarAyuda = () => {
    console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}        COMANDOS DISPONIBLES — Cliente FTP            ${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`  ${BOLD}${YELLOW}login ${GREEN}<user> <pass>${RESET}  Autentica tus credenciales.`);
    console.log(`  ${BOLD}${YELLOW}ls${RESET}                   Lista archivos del servidor.`);
    console.log(`  ${BOLD}${YELLOW}get ${GREEN}<archivo>${RESET}         Descarga un archivo (RETR).`);
    console.log(`  ${BOLD}${YELLOW}put ${GREEN}<archivo>${RESET}         Sube un archivo desde ./uploads (STOR).`);
    console.log(`  ${BOLD}${YELLOW}delete ${GREEN}<archivo>${RESET}      Borra un archivo del servidor (DELE).`);
    console.log(`  ${BOLD}${YELLOW}mkdir ${GREEN}<nombre>${RESET}        Crea un directorio remoto (MKD).`);
    console.log(`  ${BOLD}${YELLOW}edit ${GREEN}<archivo>${RESET}        Descarga, edita localmente y re-sube.`);
    console.log(`  ${BOLD}${YELLOW}quit${RESET} / ${BOLD}${YELLOW}exit${RESET}          Cierra sesión y sale (QUIT).`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}\n`);
};

const iniciar = async () => {
    console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}       Cliente FTP — users Josefo, Laura & Luismileo    ${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`  Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos disponibles.\n`);

    console.log(`${CYAN}[INFO] Conectando automáticamente a ${HOST}:${PORT} (FileZilla Server)...${RESET}`);

    try {
        const welcome = await cliente.conectar();
        console.log(`${GREEN}[OK] Conectado exitosamente.${RESET}`);
        imprimirRespuestaServidor(220, welcome.message.trim());
    } catch (err) {
        console.error(`${RED}[ERROR] No se pudo conectar al servidor: ${err.message}${RESET}`);
        console.error(`${RED}        Asegúrate de que FileZilla Server esté corriendo en ${HOST}:${PORT}${RESET}`);
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

            // ─── AYUDA ───
            case 'help':
                mostrarAyuda();
                break;

            // ─── AUTENTICACIÓN ───
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

            // ─── LISTAR ARCHIVOS (LIST via PASV) ───
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

            // ─── DESCARGAR ARCHIVO (RETR via PASV) ───
            case 'get': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: ${BOLD}get <nombre_archivo>${RESET}`);
                    break;
                }
                const localPath = path.resolve(DOWNLOADS_DIR, path.basename(remoteFile));
                console.log(`${CYAN}[INFO] Descargando "${remoteFile}" → "${localPath}"...${RESET}`);
                const okGet = await cliente.download(remoteFile, localPath);
                if (okGet) {
                    console.log(`${GREEN}[OK] Archivo descargado correctamente en: ${BOLD}${localPath}${RESET}`);
                }
                break;
            }

            // ─── SUBIR ARCHIVO (STOR via PASV) ───
            case 'put': {
                if (!asegurarAutenticado()) break;
                const fileName = args[1];
                if (!fileName) {
                    console.log(`${YELLOW}Uso: ${BOLD}put <nombre_archivo>${RESET}`);
                    console.log(`${YELLOW}     El archivo debe estar en: ${BOLD}${UPLOADS_DIR}${RESET}`);
                    break;
                }
                const localPath = path.resolve(UPLOADS_DIR, path.basename(fileName));
                if (!fs.existsSync(localPath)) {
                    console.error(`${RED}[ERROR] Archivo no encontrado: ${localPath}${RESET}`);
                    console.log(`${YELLOW}        Coloca el archivo en la carpeta: ${BOLD}${UPLOADS_DIR}${RESET}`);
                    break;
                }
                const remoteName = path.basename(fileName);
                console.log(`${CYAN}[INFO] Subiendo "${localPath}" → servidor como "${remoteName}"...${RESET}`);
                const okPut = await cliente.upload(remoteName, localPath);
                if (okPut) {
                    console.log(`${GREEN}[OK] Archivo "${remoteName}" subido exitosamente al servidor.${RESET}`);
                }
                break;
            }

            // ─── BORRAR ARCHIVO (DELE) ───
            case 'delete':
            case 'del': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: ${BOLD}delete <nombre_archivo>${RESET}`);
                    break;
                }
                console.log(`${CYAN}[INFO] Eliminando "${remoteFile}" del servidor...${RESET}`);
                const okDel = await cliente.deleteFile(remoteFile);
                if (okDel) {
                    console.log(`${GREEN}[OK] Archivo "${remoteFile}" eliminado del servidor.${RESET}`);
                }
                break;
            }

            // ─── CREAR DIRECTORIO (MKD) ───
            case 'mkdir': {
                if (!asegurarAutenticado()) break;
                const dirName = args[1];
                if (!dirName) {
                    console.log(`${YELLOW}Uso: ${BOLD}mkdir <nombre_carpeta>${RESET}`);
                    break;
                }
                console.log(`${CYAN}[INFO] Creando directorio "${dirName}" en el servidor...${RESET}`);
                const msg = await cliente.makeDirectory(dirName);
                console.log(`${GREEN}[OK] Directorio creado: ${msg}${RESET}`);
                break;
            }

            // ─── EDITAR ARCHIVO (RETR → edición local → STOR) ───
            case 'edit': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    console.log(`${YELLOW}Uso: ${BOLD}edit <nombre_archivo>${RESET}`);
                    break;
                }

                // Paso 1: Descargar el archivo a ./downloads
                const localPath = path.resolve(DOWNLOADS_DIR, path.basename(remoteFile));
                console.log(`${CYAN}[INFO] Descargando "${remoteFile}" para edición...${RESET}`);
                await cliente.download(remoteFile, localPath);
                console.log(`${GREEN}[OK] Archivo descargado en: ${BOLD}${localPath}${RESET}`);

                // Paso 2: Pausar y esperar que el usuario edite el archivo
                console.log(`\n${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}`);
                console.log(`${BOLD}${MAGENTA}  MODO EDICIÓN                                        ${RESET}`);
                console.log(`${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}`);
                console.log(`${YELLOW}  Abre el archivo en tu editor de texto favorito:${RESET}`);
                console.log(`${BOLD}  ${localPath}${RESET}`);
                console.log(`${YELLOW}  Edítalo, guárdalo y luego presiona [ENTER] aquí.${RESET}`);
                console.log(`${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}\n`);

                await pregunta(`${BOLD}${GREEN}  >>> Presiona [ENTER] cuando hayas terminado de editar... ${RESET}`);

                // Paso 3: Re-subir el archivo editado al servidor (STOR sobrescribe)
                console.log(`${CYAN}[INFO] Subiendo archivo editado "${remoteFile}" al servidor...${RESET}`);
                const okEdit = await cliente.upload(remoteFile, localPath);
                if (okEdit) {
                    console.log(`${GREEN}[OK] Archivo "${remoteFile}" actualizado exitosamente en el servidor.${RESET}`);
                }
                break;
            }

            // ─── SALIR (QUIT) ───
            case 'quit':
            case 'exit': {
                console.log(`${CYAN}[INFO] Cerrando sesión y desconectando...${RESET}`);
                await cliente.quit();
                console.log(`${GREEN}${BOLD}GOODBYE BRO${RESET}`);
                process.exit(0);
                break;
            }

            // ─── COMANDO DESCONOCIDO ───
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

// Arrancar el cliente
iniciar();
