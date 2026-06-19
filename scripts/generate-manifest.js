#!/usr/bin/env node
/* eslint-disable */

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  path.resolve(__dirname, '..'),
  'public',
  'manifest.json'
);

try {
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
    console.log('Removed static manifest.json; dynamic /manifest.json is used.');
  } else {
    console.log('Dynamic /manifest.json is used; no static manifest generated.');
  }
} catch (error) {
  console.error('Error preparing dynamic manifest route:', error);
  process.exit(1);
}
