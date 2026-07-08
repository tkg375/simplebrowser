const REPO = 'tkg375/simplebrowser';

const btn = document.getElementById('download-btn');
const label = document.getElementById('download-label');
const meta = document.getElementById('version-meta');
const otherPlatforms = document.getElementById('other-platforms');

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'win';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return 'win';
}

function matchAsset(assets, platform) {
  const matchers = {
    win: (name) => name.endsWith('.exe') && !name.endsWith('.blockmap'),
    mac: (name) => name.endsWith('.dmg'),
    linux: (name) => name.endsWith('.AppImage'),
  };
  return assets.find((a) => matchers[platform](a.name));
}

const PLATFORM_LABEL = { win: 'Windows', mac: 'macOS', linux: 'Linux' };

async function init() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const release = await res.json();
    const platform = detectPlatform();
    const asset = matchAsset(release.assets, platform);

    if (!asset) {
      label.textContent = 'No build available for your platform';
      btn.disabled = true;
      return;
    }

    label.textContent = `Download for ${PLATFORM_LABEL[platform]}`;
    btn.disabled = false;
    btn.onclick = () => {
      window.location.href = asset.browser_download_url;
    };

    meta.textContent = `Version ${release.tag_name.replace(/^v/, '')}`;

    const otherLinks = Object.keys(PLATFORM_LABEL)
      .filter((p) => p !== platform)
      .map((p) => {
        const a = matchAsset(release.assets, p);
        return a ? `<a href="${a.browser_download_url}">${PLATFORM_LABEL[p]}</a>` : null;
      })
      .filter(Boolean);
    otherPlatforms.innerHTML = otherLinks.join('');
  } catch (err) {
    label.textContent = 'Could not load latest release';
    meta.textContent = String(err.message || err);
  }
}

init();
