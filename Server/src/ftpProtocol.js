export const parseFTPLine = (line) => {
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

export const formatPASVResponse = (ip, port) => {
    const ipParts = ip.split('.');
    const p1 = Math.floor(port / 256);
    const p2 = port % 256;
    return `(${ipParts.join(',')},${p1},${p2})`;
}
