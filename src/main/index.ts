import { app, BrowserWindow, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { resolveWindowLaunchPreferences } from './windowPreferences';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-web-security');

let mainWindow: BrowserWindow | null = null;

interface AppPreferences {
  fullscreenOnLaunch: boolean;
}

function createWindow() {
  const store = new Store<AppPreferences>({
    defaults: {
      fullscreenOnLaunch: false,
    },
  });
  const launchPreferences = resolveWindowLaunchPreferences(
    process.argv,
    store.get('fullscreenOnLaunch'),
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: launchPreferences.autoHideMenuBar,
    fullscreen: launchPreferences.fullscreen,
    kiosk: launchPreferences.kiosk,
    frame: launchPreferences.frame,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Log renderer errors to help debug blank-window issues
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason);
  });

  mainWindow.on('enter-full-screen', () => {
    store.set('fullscreenOnLaunch', true);
  });

  mainWindow.on('leave-full-screen', () => {
    store.set('fullscreenOnLaunch', false);
  });

  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_DEV_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load index.html:', err);
      console.error('Tried path:', indexPath);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});
