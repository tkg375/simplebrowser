const { execFileSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

const GH = process.env.GH_CLI || 'gh';
const REPO = 'tkg375/simplebrowser';
const version = pkg.version;
const tag = `v${version}`;
const distDir = path.join(__dirname, '..', 'dist');

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

console.log(`Building ${tag}...`);
run('npx', ['electron-builder', '--publish', 'never'], { shell: true });

const assets = [
  path.join(distDir, `Simple-Browser-Setup-${version}.exe`),
  path.join(distDir, `Simple-Browser-Setup-${version}.exe.blockmap`),
  path.join(distDir, 'latest.yml'),
];

console.log(`\nCreating GitHub release ${tag}...`);
run(GH, [
  'release', 'create', tag,
  ...assets,
  '--repo', REPO,
  '--title', version,
  '--notes', `Release ${version}`,
]);

console.log(`\nDone: https://github.com/${REPO}/releases/tag/${tag}`);
