const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const clearBtn = document.getElementById('clear-btn');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

async function render() {
  const entries = await window.historyAPI.get();

  if (entries.length === 0) {
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';

  const groups = [];
  let lastLabel = null;
  for (const entry of entries) {
    const label = dayLabel(entry.visitedAt);
    if (label !== lastLabel) {
      groups.push({ label, entries: [] });
      lastLabel = label;
    }
    groups[groups.length - 1].entries.push(entry);
  }

  listEl.innerHTML = groups
    .map(
      (group) => `
      <div class="day-group">
        <div class="day-label">${escapeHtml(group.label)}</div>
        ${group.entries
          .map(
            (entry) => `
          <div class="entry" data-url="${escapeHtml(entry.url)}">
            <div class="dot"></div>
            <div class="title">${escapeHtml(entry.title)}</div>
            <div class="url">${escapeHtml(entry.url)}</div>
            <div class="time">${timeLabel(entry.visitedAt)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('.entry').forEach((el) => {
    el.addEventListener('click', () => {
      window.historyAPI.open(el.dataset.url);
    });
  });
}

clearBtn.addEventListener('click', async () => {
  if (confirm('Clear all browsing history? This cannot be undone.')) {
    await window.historyAPI.clear();
    render();
  }
});

window.historyAPI.onUpdated(() => render());
render();
