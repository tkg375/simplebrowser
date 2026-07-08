const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const TOOLBAR_HEIGHT = 88;
const DEFAULT_URL = 'https://www.google.com';

let mainWindow;
let tabs = []; // { id, view, title, url, isLoading }
let activeTabId = null;
let nextTabId = 1;

function sendState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('tabs:state', {
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      isLoading: t.isLoading,
      canGoBack: t.view.webContents.navigationHistory.canGoBack(),
      canGoForward: t.view.webContents.navigationHistory.canGoForward(),
    })),
    activeTabId,
  });
}

function layoutActiveView() {
  const [w, h] = mainWindow.getContentSize();
  const active = tabs.find((t) => t.id === activeTabId);
  tabs.forEach((t) => {
    const visible = t.id === activeTabId;
    t.view.setVisible(visible);
    if (visible) {
      t.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT });
    }
  });
}

function createTab(url = DEFAULT_URL, makeActive = true) {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  const tab = { id: nextTabId++, view, title: 'New Tab', url, isLoading: false };
  tabs.push(tab);
  mainWindow.contentView.addChildView(view);

  const wc = view.webContents;

  wc.on('did-start-loading', () => {
    tab.isLoading = true;
    sendState();
  });
  wc.on('did-stop-loading', () => {
    tab.isLoading = false;
    sendState();
  });
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    sendState();
  });
  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl;
    sendState();
  });
  wc.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl;
    sendState();
  });
  wc.setWindowOpenHandler(({ url: newUrl }) => {
    createTab(newUrl, true);
    return { action: 'deny' };
  });

  wc.loadURL(url);

  if (makeActive) {
    activeTabId = tab.id;
  }
  layoutActiveView();
  sendState();
  return tab;
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();

  if (activeTabId === id) {
    if (tabs.length === 0) {
      createTab(DEFAULT_URL, true);
    } else {
      const newActive = tabs[Math.max(0, idx - 1)];
      activeTabId = newActive.id;
    }
  }
  layoutActiveView();
  sendState();
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId);
}

function normalizeInput(input) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const toolbarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.contentView.addChildView(toolbarView);
  toolbarView.webContents.loadFile(path.join(__dirname, 'toolbar.html'));
  mainWindow.__toolbarView = toolbarView;

  const resize = () => {
    const [w] = mainWindow.getContentSize();
    toolbarView.setBounds({ x: 0, y: 0, width: w, height: TOOLBAR_HEIGHT });
    layoutActiveView();
  };
  mainWindow.on('resize', resize);
  toolbarView.webContents.once('did-finish-load', () => {
    resize();
    createTab(DEFAULT_URL, true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('tabs:new', (_e, url) => {
  createTab(url || DEFAULT_URL, true);
});
ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
ipcMain.handle('tabs:activate', (_e, id) => {
  activeTabId = id;
  layoutActiveView();
  sendState();
});
ipcMain.handle('nav:go', (_e, input) => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.loadURL(normalizeInput(input));
});
ipcMain.handle('nav:back', () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
});
ipcMain.handle('nav:forward', () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
});
ipcMain.handle('nav:reload', () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.reload();
});
ipcMain.handle('nav:stop', () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.stop();
});

function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && mainWindow.__toolbarView) {
    mainWindow.__toolbarView.webContents.send('update:status', { status, ...extra });
  }
}

autoUpdater.autoDownload = true;
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version }));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('ready', { version: info.version }));
autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err == null ? 'unknown' : err.message }));

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});
ipcMain.handle('update:check', () => {
  autoUpdater.checkForUpdates().catch(() => {});
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
