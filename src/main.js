const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const TOOLBAR_HEIGHT = 76;
const DEFAULT_URL = 'https://www.google.com';

let mainWindow;
let tabs = []; // { id, view, title, url, isLoading }
let activeTabId = null;
let nextTabId = 1;
let history = []; // { url, title, visitedAt }
let historyPath = null;

function loadHistory() {
  historyPath = path.join(app.getPath('userData'), 'history.json');
  try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(historyPath, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

function addHistoryEntry(url, title) {
  if (!/^https?:\/\//i.test(url)) return;
  history.unshift({ url, title: title || url, visitedAt: Date.now() });
  if (history.length > 2000) history.length = 2000;
  saveHistory();
  if (mainWindow && mainWindow.__toolbarView) {
    mainWindow.__toolbarView.webContents.send('history:updated');
  }
}

function sendState() {
  if (!mainWindow || !mainWindow.__toolbarView) return;
  mainWindow.__toolbarView.webContents.send('tabs:state', {
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

function raiseToolbar() {
  if (!mainWindow || !mainWindow.__toolbarView) return;
  mainWindow.contentView.removeChildView(mainWindow.__toolbarView);
  mainWindow.contentView.addChildView(mainWindow.__toolbarView);
}

function setToolbarExpanded(expanded) {
  if (!mainWindow || !mainWindow.__toolbarView) return;
  const [w] = mainWindow.getContentSize();
  const height = expanded ? TOOLBAR_HEIGHT + 260 : TOOLBAR_HEIGHT;
  mainWindow.__toolbarView.setBounds({ x: 0, y: 0, width: w, height });
}

function createTab(url = DEFAULT_URL, makeActive = true) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'tab-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const tab = { id: nextTabId++, view, title: 'New Tab', url, isLoading: false };
  tabs.push(tab);
  mainWindow.contentView.addChildView(view);
  raiseToolbar();

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
    const entry = history.find((h) => h.url === tab.url);
    if (entry) {
      entry.title = title;
      saveHistory();
    }
  });
  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl;
    sendState();
    addHistoryEntry(navUrl, tab.title);
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

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSameSite(hostA, hostB) {
  if (!hostA || !hostB) return false;
  if (hostA === hostB) return true;
  return hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function isThirdPartyRequest(details) {
  if (!details.url.startsWith('http')) return false;
  const tab = tabs.find((t) => t.view.webContents.id === details.webContentsId);
  if (!tab) return false;
  const topHost = getHostname(tab.url);
  const reqHost = getHostname(details.url);
  if (!topHost || !reqHost) return false;
  return !isSameSite(topHost, reqHost);
}

async function setupAdblocker() {
  const cachePath = path.join(app.getPath('userData'), 'adblocker-engine.bin');
  const blocker = await ElectronBlocker.fromLists(
    fetch,
    [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist.to/easylist/easyprivacy.txt',
    ],
    {},
    {
      path: cachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    }
  );
  blocker.enableBlockingInSession(session.defaultSession);
}

function setupPrivacyAndSecurity() {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (isThirdPartyRequest(details) && details.requestHeaders.Cookie) {
      delete details.requestHeaders.Cookie;
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    if (isThirdPartyRequest(details) && details.responseHeaders) {
      delete details.responseHeaders['set-cookie'];
      delete details.responseHeaders['Set-Cookie'];
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame') {
      callback({ redirectURL: details.url.replace(/^http:\/\//, 'https://') });
    } else {
      callback({});
    }
  });

  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function sendWindowState() {
  if (mainWindow && mainWindow.__toolbarView) {
    mainWindow.__toolbarView.webContents.send('window:state', {
      isMaximized: mainWindow.isMaximized(),
      platform: process.platform,
    });
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    backgroundColor: '#101114',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.on('maximize', () => sendWindowState());
  mainWindow.on('unmaximize', () => sendWindowState());

  const toolbarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  toolbarView.setBackgroundColor('#00000000');
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
    sendWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('menu:setOpen', (_e, expanded) => setToolbarExpanded(expanded));

ipcMain.handle('tabs:new', (_e, url) => {
  createTab(url || DEFAULT_URL, true);
});
ipcMain.handle('tabs:openHistory', () => {
  const existing = tabs.find((t) => t.url.startsWith('file:') && t.url.endsWith('history.html'));
  if (existing) {
    activeTabId = existing.id;
    layoutActiveView();
    sendState();
  } else {
    createTab(pathToFileURL(path.join(__dirname, 'history.html')).href, true);
  }
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

ipcMain.handle('history:get', () => history);
ipcMain.handle('history:clear', () => {
  history = [];
  saveHistory();
});
ipcMain.handle('history:open', (_e, url) => {
  createTab(url, true);
});

function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && mainWindow.__toolbarView) {
    mainWindow.__toolbarView.webContents.send('update:status', { status, ...extra });
  }
}

autoUpdater.autoDownload = true;
autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version }));
autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('ready', { version: info.version }));
autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err == null ? 'unknown' : err.message }));

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});
ipcMain.handle('update:check', () => {
  if (!app.isPackaged) {
    sendUpdateStatus('not-available');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus('error', { message: err.message }));
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  loadHistory();
  setupPrivacyAndSecurity();
  try {
    await setupAdblocker();
  } catch (err) {
    console.error('Adblocker setup failed:', err);
  }
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
