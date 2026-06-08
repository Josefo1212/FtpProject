/**
 * Analiza una línea cruda recibida del socket de control FTP.
 * Remueve saltos de línea y separa el comando del argumento.
 * Ej: "RETR foto.png\r\n" -> { command: "RETR", arg: "foto.png" }
 * 
 * @param {string} line - La línea recibida desde el control socket.
 * @returns {{ command: string, arg: string }} El comando en mayúsculas y su argumento.
 */
export function parseFTPLine(line) {
    const cleanLine = line.replace(/\r$/, '').trim();
    const spaceIndex = cleanLine.indexOf(' ');
    
    if (spaceIndex === -1) {
        return {
            command: cleanLine.toUpperCase(),
            arg: ''
        };
    }
    
    const command = cleanLine.substring(0, spaceIndex).toUpperCase();
    const arg = cleanLine.substring(spaceIndex + 1);
    
    return {
        command,
        arg
    };
}

/**
 * Formatea una IP y puerto al formato requerido por el comando PASV (RFC 959).
 * Ej: "127.0.0.1", 50001 -> "(127,0,0,1,195,81)"
 * 
 * @param {string} ip - Dirección IP (ej. '127.0.0.1')
 * @param {number} port - Puerto asignado (ej. 50001)
 * @returns {string} La representación en formato (h1,h2,h3,h4,p1,p2)
 */
export function formatPASVResponse(ip, port) {
    const ipParts = ip.split('.');
    const p1 = Math.floor(port / 256);
    const p2 = port % 256;
    return `(${ipParts.join(',')},${p1},${p2})`;
}
