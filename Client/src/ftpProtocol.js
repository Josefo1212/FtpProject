export const parseFTPResponse = (line) => {
    const cleanLine = line.trimEnd();
    const code = parseInt(cleanLine.substring(0, 3), 10);
    
    const separator = cleanLine[3] ?? ' ';
    const message = cleanLine.substring(4);
    
    return {
        code: isNaN(code) ? 0 : code,
        separator,
        message,
        raw: line
    };
};

export const parsePASVResponse = (message) => {
    const match = message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    
    if (!match) throw new Error(`Respuesta PASV con formato inválido: "${message}"`);
    
    const [_, p1, p2, p3, p4, p5, p6] = match;
    
    return { 
        host: `${p1}.${p2}.${p3}.${p4}`, 
        port: (parseInt(p5, 10) * 256) + parseInt(p6, 10) 
    };
};