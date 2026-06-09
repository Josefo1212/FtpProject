import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { FtpClient } from './ftpClient.js';
import * as ui from './interface.js';

const HOST = '127.0.0.1';
const PORT = 21;

const DOWNLOADS_DIR = path.resolve('./downloads');
const UPLOADS_DIR = path.resolve('./uploads');

// Crear directorios de forma compacta
[DOWNLOADS_DIR, UPLOADS_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ui.obtenerPromptDinamico()
});

const cliente = new FtpClient(HOST, PORT);

const pregunta = (texto) => new Promise(resolve => rl.question(texto, resolve));

const iniciar = async () => {
    ui.mostrarBienvenida(HOST, PORT);
    try {
        const welcome = await cliente.conectar();
        ui.mostrarMensajeExito('Conectado exitosamente.');
        ui.imprimirRespuestaServidor(220, welcome.message.trim());
    } catch (err) {
        ui.mostrarMensajeError(
            `No se pudo conectar al servidor: ${err.message}`,
            `Asegúrate de que FileZilla Server esté corriendo en ${HOST}:${PORT}`
        );
        process.exit(1);
    }
    rl.setPrompt(ui.obtenerPromptDinamico(cliente.host, '/'));
    rl.prompt();
};

const asegurarAutenticado = () => {
    if (!cliente.isAuthenticated) ui.mostrarAvisoLoginRequerido();
    return cliente.isAuthenticated;
};

rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const command = args[0]?.toLowerCase();

    if (!command) return rl.prompt();

    try {
        switch (command) {
            case 'help':
                ui.mostrarMenuAyuda();
                break;

            case 'login': {
                const [_, user, pass = ''] = args;
                if (!user) {
                    ui.mostrarUsoComando('login <usuario> <contraseña>');
                } else if (cliente.isAuthenticated) {
                    ui.mostrarMensajeAviso('Ya tienes una sesión activa.');
                } else {
                    ui.mostrarMensajeInformativo(`Autenticando usuario "${user}"...`);
                    (await cliente.login(user, pass)) ? ui.mostrarExitoLogin(user) : ui.mostrarMensajeError('Credenciales incorrectas o rechazadas por el servidor.');
                }
                break;
            }

            case 'ls':
            case 'list':
            case 'dir':
                if (asegurarAutenticado()) {
                    ui.mostrarMensajeInformativo('Solicitando listado de archivos al servidor...');
                    ui.mostrarListadoRemoto(await cliente.list());
                }
                break;

            case 'get': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    ui.mostrarUsoComando('get <nombre_archivo>');
                    break;
                }
                const localPath = path.resolve(DOWNLOADS_DIR, path.basename(remoteFile));
                ui.mostrarMensajeInformativo(`Descargando "${remoteFile}" → "${localPath}"...`);
                if (await cliente.download(remoteFile, localPath)) ui.mostrarExitoDescarga(localPath);
                break;
            }

            case 'put': {
                if (!asegurarAutenticado()) break;
                const fileName = args[1];
                if (!fileName) {
                    ui.mostrarUsoPut(UPLOADS_DIR);
                    break;
                }
                const localPath = path.resolve(UPLOADS_DIR, path.basename(fileName));
                if (!fs.existsSync(localPath)) {
                    ui.errorArchivoNoEncontrado ? ui.errorArchivoNoEncontrado(localPath, UPLOADS_DIR) : ui.mostrarErrorArchivoNoEncontrado(localPath, UPLOADS_DIR);
                    break;
                }
                const remoteName = path.basename(fileName);
                ui.mostrarMensajeInformativo(`Subiendo "${localPath}" → servidor como "${remoteName}"...`);
                if (await cliente.upload(remoteName, localPath)) ui.mostrarExitoSubida(remoteName);
                break;
            }

            case 'delete':
            case 'del': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    ui.mostrarUsoComando('delete <nombre_archivo>');
                    break;
                }
                ui.mostrarMensajeInformativo(`Eliminando "${remoteFile}" del servidor...`);
                if (await cliente.deleteFile(remoteFile)) ui.mostrarExitoEliminacion(remoteFile);
                break;
            }

            case 'mkdir': {
                if (!asegurarAutenticado()) break;
                const dirName = args[1];
                if (!dirName) {
                    ui.mostrarUsoComando('mkdir <nombre_carpeta>');
                    break;
                }
                ui.mostrarMensajeInformativo(`Creando directorio "${dirName}" en el servidor...`);
                ui.mostrarExitoCrearDirectorio(await cliente.makeDirectory(dirName));
                break;
            }

            case 'edit': {
                if (!asegurarAutenticado()) break;
                const remoteFile = args[1];
                if (!remoteFile) {
                    ui.mostrarUsoComando('edit <nombre_archivo>');
                    break;
                }
                const localPath = path.resolve(DOWNLOADS_DIR, path.basename(remoteFile));
                ui.mostrarMensajeInformativo(`Descargando "${remoteFile}" para edición...`);
                
                await cliente.download(remoteFile, localPath);
                ui.mostrarExitoDescargaEdicion(localPath);
                ui.mostrarModoEdicion(localPath);

                await pregunta(ui.obtenerPromptEdicion());

                ui.mostrarMensajeInformativo(`Subiendo archivo editado "${remoteFile}" al servidor...`);
                if (await cliente.upload(remoteFile, localPath)) ui.mostrarExitoSubidaEditado(remoteFile);
                break;
            }

            case 'quit':
            case 'exit':
                ui.mostrarMensajeInformativo('Cerrando sesión y desconectando...');
                await cliente.quit();
                ui.mostrarMensajeDespedida();
                process.exit(0);
                break;

            default:
                ui.mostrarComandoNoReconocido(command);
                break;
        }
    } catch (err) {
        ui.mostrarMensajeError(err.message);
    }

    rl.setPrompt(ui.obtenerPromptDinamico(cliente.host, '/'));
    rl.prompt();
});

iniciar();