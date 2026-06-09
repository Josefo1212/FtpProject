export const parseFTPResponse = (line) => {
    const cleanLine = line.replace(/\r$/, '');
    const codeStr = cleanLine.substring(0, 3);
    const code = parseInt(codeStr, 10);
    
    const separator = cleanLine.length > 3 ? cleanLine.charAt(3) : ' ';
    const message = cleanLine.length > 4 ? cleanLine.substring(4) : '';
    
    return {
        code: isNaN(code) ? 0 : code,
        separator,
        message,
        raw: line
    };
}

export const parsePASVResponse = (message) => {
    const match = message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
        throw new Error(`Respuesta PASV con formato inválido: "${message}"`);
    }
    
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5], 10) * 256 + parseInt(match[6], 10);
    
    return { host, port };
}
