const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function main() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  const iconsetDir = path.join(__dirname, 'icons');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const pngPaths = {};
  for (const size of SIZES) {
    const buf = await sharp(svgBuffer, { density: 384 }).resize(size, size).png().toBuffer();
    const filePath = path.join(iconsetDir, `${size}x${size}.png`);
    fs.writeFileSync(filePath, buf);
    pngPaths[size] = filePath;
    if (size === 1024) fs.writeFileSync(path.join(__dirname, 'icon.png'), buf);
  }
  console.log('Rendered PNG sizes:', SIZES.join(', '));

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffer = await pngToIco(icoSizes.map((s) => pngPaths[s]));
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), icoBuffer);
  console.log('Wrote icon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
