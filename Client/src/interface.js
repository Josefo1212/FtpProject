import readline from 'node:readline';

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

/**
 * Genera un prompt interactivo personalizado según el estado actual de la sesión
 * @param {string} host - Servidor conectado
 * @param {string} cwd - Directorio de trabajo en el servidor
 */
export function obtenerPromptDinamico(host = 'desconectado', cwd = '/') {
    const { CYAN, GREEN, BOLD, RESET } = UI_COLORS;
    if (host === 'desconectado') {
        return `${BOLD}${CYAN}ftp-client>${RESET} `;
    }
    return `${BOLD}${GREEN}ftp@${host}:${CYAN}${cwd}${RESET}${BOLD}> ${RESET}`;
}

/**
 * Formatea de forma amigable las respuestas numéricas crudas del servidor FTP
 * @param {number} code - Código numérico de respuesta FTP
 * @param {string} msg - Texto descriptivo del estado
 */
export function imprimirRespuestaServidor(code, msg) {
    const { GREEN, RED, YELLOW, BOLD, RESET } = UI_COLORS;
    let color = RESET;

    if (code >= 100 && code < 300) color = GREEN;  // Éxitos o acciones en curso
    if (code >= 300 && code < 400) color = YELLOW; // Se requiere más información (Auth)
    if (code >= 400) color = RED;                  // Errores de sintaxis o de disco

    console.log(`${BOLD}${color}[Servidor ${code}]${RESET} ${msg}`);
}

/**
 * Despliega el menú estructurado con soporte interactivo
 */
export function mostrarMenuAyuda() {
    const { YELLOW, BOLD, RESET, CYAN } = UI_COLORS;
    console.log(`\n${BOLD}${CYAN}--- COMANDOS DISPONIBLES DE LA INTERFAZ ---${RESET}`);
    console.log(`  ${BOLD}${YELLOW}connect <host> [port]${RESET} : Abre el canal de control con el servidor.`);
    console.log(`  ${BOLD}${YELLOW}login <user> <pass>${RESET}    : Autentica tus credenciales en el sistema.`);
    console.log(`  ${BOLD}${YELLOW}pwd${RESET}                  : Imprime tu ubicación en el servidor.`);
    console.log(`  ${BOLD}${YELLOW}cd <path>${RESET}             : Cambia la ubicación remota.`);
    console.log(`  ${BOLD}${YELLOW}ls [path]${RESET}            : Lista los archivos en el servidor remoto.`);
    console.log(`  ${BOLD}${YELLOW}get <remoto> [local]${RESET} : Descarga el archivo remoto en tu carpeta 'downloads/'.`);
    console.log(`  ${BOLD}${YELLOW}put <local> [remoto]${RESET} : Sube un archivo de tu carpeta 'downloads/' al servidor.`);
    console.log(`  ${BOLD}${YELLOW}raw <comando>${RESET}         : Envía texto crudo directo al socket de control.`);
    console.log(`  ${BOLD}${YELLOW}clear${RESET}                : Limpia la terminal de la consola.`);
    console.log(`  ${BOLD}${YELLOW}quit / exit${RESET}          : Cierra la sesión y detiene la aplicación.\n`);
}