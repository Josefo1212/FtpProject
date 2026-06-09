// Códigos estéticos ANSI para la consola de usuario (UX)
export const UI_COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    CYAN: '\x1b[36m',
    MAGENTA: '\x1b[35m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};

export const obtenerPromptDinamico = (host = 'desconectado', cwd = '/') => {
    const { CYAN, GREEN, BOLD, RESET } = UI_COLORS;
    if (host === 'desconectado') {
        return `${BOLD}${CYAN}ftp-client>${RESET} `;
    }
    return `${BOLD}${GREEN}ftp@${host}:${CYAN}${cwd}${RESET}${BOLD}> ${RESET}`;
};

export const imprimirRespuestaServidor = (code, msg) => {
    const { GREEN, RED, YELLOW, BOLD, RESET } = UI_COLORS;
    let color = RESET;

    if (code >= 100 && code < 300) color = GREEN;  // Éxitos o acciones en curso
    if (code >= 300 && code < 400) color = YELLOW; // Se requiere más información (Auth)
    if (code >= 400) color = RED;                  // Errores de sintaxis o de disco

    console.log(`${BOLD}${color}[Servidor ${code}]${RESET} ${msg}`);
};

export const mostrarMenuAyuda = () => {
    const { YELLOW, BOLD, RESET, CYAN, GREEN } = UI_COLORS;
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

export const mostrarBienvenida = (host, port) => {
    const { BOLD, CYAN, YELLOW, RESET } = UI_COLORS;
    console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}       Cliente FTP — users Josefo, Laura & Luismileo    ${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`  Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos disponibles.\n`);
    console.log(`${CYAN}[INFO] Conectando automáticamente a ${host}:${port} (FileZilla Server)...${RESET}`);
};

export const mostrarMensajeInformativo = (msg) => {
    const { CYAN, RESET } = UI_COLORS;
    console.log(`${CYAN}[INFO] ${msg}${RESET}`);
};

export const mostrarMensajeExito = (msg) => {
    const { GREEN, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] ${msg}${RESET}`);
};

export const mostrarExitoLogin = (user) => {
    const { GREEN, BOLD, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] ¡Sesión iniciada correctamente! Bienvenido, ${BOLD}${user}${RESET}${GREEN}.${RESET}`);
};

export const mostrarMensajeAviso = (msg) => {
    const { YELLOW, RESET } = UI_COLORS;
    console.log(`${YELLOW}[AVISO] ${msg}${RESET}`);
};

export const mostrarAvisoLoginRequerido = () => {
    const { YELLOW, BOLD, RESET } = UI_COLORS;
    console.log(`${YELLOW}[AVISO] Debes iniciar sesión primero. Usa: ${BOLD}login <usuario> <contraseña>${RESET}`);
};

export const mostrarMensajeError = (msg, extra = '') => {
    const { RED, RESET } = UI_COLORS;
    console.error(`${RED}[ERROR] ${msg}${RESET}`);
    if (extra) {
        console.error(`${RED}        ${extra}${RESET}`);
    }
};

export const mostrarUsoComando = (uso, extra = '') => {
    const { YELLOW, BOLD, RESET } = UI_COLORS;
    console.log(`${YELLOW}Uso: ${BOLD}${uso}${RESET}`);
    if (extra) {
        console.log(`${YELLOW}     ${extra}${RESET}`);
    }
};

export const mostrarUsoPut = (uploadsDir) => {
    const { YELLOW, BOLD, RESET } = UI_COLORS;
    console.log(`${YELLOW}Uso: ${BOLD}put <nombre_archivo>${RESET}`);
    console.log(`${YELLOW}     El archivo debe estar en: ${BOLD}${uploadsDir}${RESET}`);
};

export const mostrarErrorArchivoNoEncontrado = (localPath, uploadsDir) => {
    const { RED, YELLOW, BOLD, RESET } = UI_COLORS;
    console.error(`${RED}[ERROR] Archivo no encontrado: ${localPath}${RESET}`);
    console.log(`${YELLOW}        Coloca el archivo en la carpeta: ${BOLD}${uploadsDir}${RESET}`);
};

export const mostrarComandoNoReconocido = (command) => {
    const { RED, BOLD, YELLOW, RESET } = UI_COLORS;
    console.log(`${RED}Comando no reconocido: "${command}".${RESET} Escribe ${BOLD}${YELLOW}help${RESET} para ver los comandos disponibles.`);
};

export const mostrarMensajeDespedida = () => {
    const { GREEN, BOLD, RESET } = UI_COLORS;
    console.log(`${GREEN}${BOLD}GOODBYE BRO${RESET}`);
};

export const mostrarListadoRemoto = (data) => {
    const { BOLD, CYAN, YELLOW, RESET } = UI_COLORS;
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
};

export const mostrarModoEdicion = (localPath) => {
    const { BOLD, MAGENTA, YELLOW, RESET } = UI_COLORS;
    console.log(`\n${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${MAGENTA}  MODO EDICIÓN                                        ${RESET}`);
    console.log(`${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${YELLOW}  Abre el archivo en tu editor de texto favorito:${RESET}`);
    console.log(`${BOLD}  ${localPath}${RESET}`);
    console.log(`${YELLOW}  Edítalo, guárdalo y luego presiona [ENTER] aquí.${RESET}`);
    console.log(`${BOLD}${MAGENTA}══════════════════════════════════════════════════════${RESET}\n`);
};

export const obtenerPromptEdicion = () => {
    const { BOLD, GREEN, RESET } = UI_COLORS;
    return `${BOLD}${GREEN}  >>> Presiona [ENTER] cuando hayas terminado de editar... ${RESET}`;
};

export const mostrarExitoDescarga = (localPath) => {
    const { GREEN, BOLD, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Archivo descargado correctamente en: ${BOLD}${localPath}${RESET}`);
};

export const mostrarExitoDescargaEdicion = (localPath) => {
    const { GREEN, BOLD, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Archivo descargado en: ${BOLD}${localPath}${RESET}`);
};

export const mostrarExitoSubida = (remoteName) => {
    const { GREEN, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Archivo "${remoteName}" subido exitosamente al servidor.${RESET}`);
};

export const mostrarExitoSubidaEditado = (remoteFile) => {
    const { GREEN, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Archivo "${remoteFile}" actualizado exitosamente en el servidor.${RESET}`);
};

export const mostrarExitoEliminacion = (remoteFile) => {
    const { GREEN, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Archivo "${remoteFile}" eliminado del servidor.${RESET}`);
};

export const mostrarExitoCrearDirectorio = (msg) => {
    const { GREEN, RESET } = UI_COLORS;
    console.log(`${GREEN}[OK] Directorio creado: ${msg}${RESET}`);
};