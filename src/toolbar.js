const tabbarEl = document.getElementById('tabbar');
const tabsListEl = document.getElementById('tabs-list');
const windowControlsEl = document.getElementById('window-controls');
const winMinimizeBtn = document.getElementById('win-minimize');
const winMaximizeBtn = document.getElementById('win-maximize');
const winCloseBtn = document.getElementById('win-close');
const addressEl = document.getElementById('address');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const reloadBtn = document.getElementById('reload');
const newTabBtn = document.getElementById('new-tab');
const updatePill = document.getElementById('update-pill');
const updatePillText = document.getElementById('update-pill-text');
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const menuHistory = document.getElementById('menu-history');
const menuCheckUpdates = document.getElementById('menu-check-updates');

let currentState = { tabs: [], activeTabId: null };
let addressFocused = false;

function render(state) {
  currentState = state;
  tabsListEl.innerHTML = '';

  state.tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.isLoading ? ' loading' : '');
    el.innerHTML = `
      <div class="favicon"></div>
      <div class="title">${escapeHtml(tab.title || 'New Tab')}</div>
      <div class="close">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      </div>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.close')) return;
      window.browser.activateTab(tab.id);
    });
    el.querySelector('.close').addEventListener('click', (e) => {
      e.stopPropagation();
      window.browser.closeTab(tab.id);
    });
    tabsListEl.appendChild(el);
  });

  const active = state.tabs.find((t) => t.id === state.activeTabId);
  if (active) {
    backBtn.disabled = !active.canGoBack;
    forwardBtn.disabled = !active.canGoForward;
    if (!addressFocused) {
      addressEl.value = active.url === 'about:blank' ? '' : active.url;
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.browser.onState(render);

addressEl.addEventListener('focus', () => {
  addressFocused = true;
  addressEl.select();
});
addressEl.addEventListener('blur', () => {
  addressFocused = false;
});
addressEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    window.browser.go(addressEl.value);
    addressEl.blur();
  }
  if (e.key === 'Escape') {
    addressEl.blur();
  }
});

backBtn.addEventListener('click', () => window.browser.back());
forwardBtn.addEventListener('click', () => window.browser.forward());
reloadBtn.addEventListener('click', () => window.browser.reload());
newTabBtn.addEventListener('click', () => window.browser.newTab());

let updateReady = false;
let transientHideTimer = null;

window.browser.onUpdateStatus((status) => {
  clearTimeout(transientHideTimer);

  if (status.status === 'ready') {
    updateReady = true;
    updatePillText.textContent = `Update to ${status.version} – Restart`;
    updatePill.style.display = 'flex';
  } else if (status.status === 'not-available' && !updateReady) {
    updatePillText.textContent = "You're up to date";
    updatePill.style.display = 'flex';
    updatePill.classList.add('info');
    transientHideTimer = setTimeout(() => {
      updatePill.style.display = 'none';
      updatePill.classList.remove('info');
    }, 2500);
  } else if (status.status === 'error' && !updateReady) {
    updatePillText.textContent = 'Update check failed';
    updatePill.style.display = 'flex';
    updatePill.classList.add('info');
    transientHideTimer = setTimeout(() => {
      updatePill.style.display = 'none';
      updatePill.classList.remove('info');
    }, 2500);
  }
});

updatePill.addEventListener('click', () => {
  if (updateReady) window.browser.installUpdate();
});

function setMenuOpen(open) {
  settingsMenu.style.display = open ? 'block' : 'none';
  window.browser.setMenuOpen(open);
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(settingsMenu.style.display !== 'block');
});

document.addEventListener('click', (e) => {
  if (settingsMenu.style.display === 'block' && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
    setMenuOpen(false);
  }
});

menuHistory.addEventListener('click', () => {
  setMenuOpen(false);
  window.browser.openHistory();
});

menuCheckUpdates.addEventListener('click', () => {
  setMenuOpen(false);
  window.browser.checkForUpdate();
});

window.browser.onWindowState((state) => {
  if (state.platform === 'darwin') {
    tabbarEl.classList.add('mac');
    windowControlsEl.style.display = 'none';
  } else {
    tabbarEl.classList.remove('mac');
    windowControlsEl.style.display = 'flex';
    winMaximizeBtn.title = state.isMaximized ? 'Restore' : 'Maximize';
  }
});

winMinimizeBtn.addEventListener('click', () => window.browser.minimizeWindow());
winMaximizeBtn.addEventListener('click', () => window.browser.maximizeWindow());
winCloseBtn.addEventListener('click', () => window.browser.closeWindow());
