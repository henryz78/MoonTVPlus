#!/usr/bin/env node
/* eslint-disable */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const defaultSource = path.join(rootDir, 'public', 'brand', 'icon.png');

const defaultPngTargets = [
  { size: 512, output: path.join(rootDir, 'public', 'logo.png') },
  {
    size: 192,
    output: path.join(rootDir, 'public', 'icons', 'icon-192x192.png'),
  },
  {
    size: 256,
    output: path.join(rootDir, 'public', 'icons', 'icon-256x256.png'),
  },
  {
    size: 384,
    output: path.join(rootDir, 'public', 'icons', 'icon-384x384.png'),
  },
  {
    size: 512,
    output: path.join(rootDir, 'public', 'icons', 'icon-512x512.png'),
  },
  {
    size: 512,
    output: path.join(
      rootDir,
      'apps',
      'android-tv',
      'app',
      'src',
      'main',
      'res',
      'drawable',
      'logo.png'
    ),
  },
];

const defaultFaviconSizes = [16, 32, 48];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function makeCircleMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${
      size / 2
    }" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
}

async function makePngBuffer(sourcePath, size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: makeCircleMask(size), blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function makePng(sourcePath, size, output) {
  ensureDir(output);
  const buffer = await makePngBuffer(sourcePath, size);
  fs.writeFileSync(output, buffer);
}

function makeIco(entries) {
  const headerLength = 6 + entries.length * 16;
  const header = Buffer.alloc(headerLength);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let imageOffset = headerLength;
  entries.forEach((entry, index) => {
    const entryOffset = 6 + index * 16;
    const widthByte = entry.size >= 256 ? 0 : entry.size;
    const heightByte = entry.size >= 256 ? 0 : entry.size;

    header.writeUInt8(widthByte, entryOffset);
    header.writeUInt8(heightByte, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(entry.buffer.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);

    imageOffset += entry.buffer.length;
  });

  return Buffer.concat([header, ...entries.map((entry) => entry.buffer)]);
}

async function generateIcons(options = {}) {
  const sourcePath = options.sourcePath || defaultSource;
  const targets = options.targets || defaultPngTargets;
  const faviconPath =
    options.faviconPath || path.join(rootDir, 'public', 'favicon.ico');
  const faviconSizes = options.faviconSizes || defaultFaviconSizes;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Icon source not found: ${sourcePath}`);
  }

  await Promise.all(
    targets.map((target) => makePng(sourcePath, target.size, target.output))
  );

  const faviconEntries = await Promise.all(
    faviconSizes.map(async (size) => ({
      size,
      buffer: await makePngBuffer(sourcePath, size),
    }))
  );

  ensureDir(faviconPath);
  fs.writeFileSync(faviconPath, makeIco(faviconEntries));
}

async function main() {
  const sourcePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultSource;

  await generateIcons({ sourcePath });
  console.log(`Generated icons from ${path.relative(rootDir, sourcePath)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error generating icons:', error);
    process.exit(1);
  });
}

module.exports = {
  generateIcons,
};
