#!/usr/bin/env node
/* eslint-disable */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { generateIcons } = require('./generate-icons');

function alphaAt(buffer, width, x, y) {
  return buffer[(y * width + x) * 4 + 3];
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moontv-icons-'));

  try {
    const sourcePath = path.join(tempDir, 'source.png');
    const outputPath = path.join(tempDir, 'icon.png');
    const faviconPath = path.join(tempDir, 'favicon.ico');

    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(sourcePath);

    await generateIcons({
      sourcePath,
      targets: [{ size: 32, output: outputPath }],
      faviconPath,
      faviconSizes: [16],
    });

    const { data, info } = await sharp(outputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.strictEqual(info.width, 32);
    assert.strictEqual(info.height, 32);
    assert.strictEqual(alphaAt(data, info.width, 0, 0), 0);
    assert.strictEqual(alphaAt(data, info.width, 31, 0), 0);
    assert.strictEqual(alphaAt(data, info.width, 0, 31), 0);
    assert.strictEqual(alphaAt(data, info.width, 16, 16), 255);
    assert.strictEqual(fs.existsSync(faviconPath), true);

    console.log('Circular icon generation verified.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
