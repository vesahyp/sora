// Renders public/icon.svg to the PNGs the home screen needs. `make icon`.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const svg = await readFile('public/icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const [size, path] of [[512, 'public/icon-512.png'], [192, 'public/icon-192.png'], [180, 'public/apple-touch-icon.png']]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.locator('svg').screenshot({ path, omitBackground: true });
}
await b.close();
console.log('icon rendered');
