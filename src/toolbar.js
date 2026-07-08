const tabbarEl = document.getElementById('tabbar');
const addressEl = document.getElementById('address');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const reloadBtn = document.getElementById('reload');
const newTabBtn = document.getElementById('new-tab');
const updatePill = document.getElementById('update-pill');
const updatePillText = document.getElementById('update-pill-text');

let currentState = { tabs: [], activeTabId: null };
let addressFocused = false;

function render(state) {
  currentState = state;
  tabbarEl.innerHTML = '';

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
    tabbarEl.appendChild(el);
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

window.browser.onUpdateStatus((status) => {
  if (status.status === 'ready') {
    updatePillText.textContent = `Update to ${status.version} – Restart`;
    updatePill.style.display = 'flex';
  }
});

updatePill.addEventListener('click', () => {
  window.browser.installUpdate();
});
