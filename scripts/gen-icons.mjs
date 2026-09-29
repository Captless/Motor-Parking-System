import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#111827"/>
<rect x="216" y="136" width="56" height="240" fill="#ffffff"/>
<path d="M216 136 H330 A52 52 0 0 1 330 240 H216 Z" fill="#ffffff"/>
</svg>`;
const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(buf).resize(192, 192).png().toFile('public/icon-192.png');
for (const f of ['public/icon-512.png', 'public/icon-192.png']) {
  const m = await sharp(f).metadata();
  console.log(f, m.width, 'x', m.height, m.format);
}
