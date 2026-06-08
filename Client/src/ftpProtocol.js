/**
 * Analiza una respuesta de control FTP recibida del servidor.
 * 
 * @param {string} line - Línea cruda recibida (ej: "220 Servicio listo\r\n")
 * @returns {{ code: number, separator: string, message: string, raw: string }}
 */
export function parseFTPResponse(line) {
    const cleanLine = line.replace(/\r$/, '');
    const codeStr = cleanLine.substring(0, 3);
    const code = parseInt(codeStr, 10);
    
    // El cuarto carácter suele ser un espacio (' ') o un guion ('-') para respuestas multilínea
    const separator = cleanLine.length > 3 ? cleanLine.charAt(3) : ' ';
    const message = cleanLine.length > 4 ? cleanLine.substring(4) : '';
    
    return {
        code: isNaN(code) ? 0 : code,
        separator,
        message,
        raw: line
    };
}

/**
 * Parsea el mensaje del comando 227 (PASV) para extraer el host y el puerto asignado.
 * Admite el formato estándar RFC 959: "227 Entering Passive Mode (127,0,0,1,195,81)"
 * 
 * @param {string} message - El mensaje de la respuesta 227 (ej: "Entering Passive Mode (127,0,0,1,195,81)")
 * @returns {{ host: string, port: number }} El host (IP) y el puerto numérico decodificado.
 */
export function parsePASVResponse(message) {
    const match = message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
        throw new Error(`Respuesta PASV con formato inválido: "${message}"`);
    }
    
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5], 10) * 256 + parseInt(match[6], 10);
    
    return { host, port };
}
