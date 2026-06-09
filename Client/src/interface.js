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
    console.log(`${BOLD}${CYAN}${RESET}  ${BOLD}${YELLOW}login ${GREEN}<user> <pass>${RESET}  Autentica tus credenciales.   ${BOLD}${CYAN}${RESET}`);
    console.log(`${BOLD}${CYAN}${RESET}  ${BOLD}${YELLOW}ls${RESET}                   Lista archivos del servidor.  ${BOLD}${CYAN}${RESET}`);
    console.log(`${BOLD}${CYAN}${RESET}  ${BOLD}${YELLOW}get ${GREEN}<archivo>${RESET}         Descarga un archivo remoto.  ${BOLD}${CYAN}${RESET}`);
    console.log(`${BOLD}${CYAN}${RESET}  ${BOLD}${YELLOW}quit${RESET} / ${BOLD}${YELLOW}exit${RESET}          Cierra sesión y sale.        ${BOLD}${CYAN}${RESET}`);
};