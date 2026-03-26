#!/usr/bin/env node
/**
 * Post-sync script: removes the "server" block from capacitor.config.json
 * Usage: node scripts/post-sync.js
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'capacitor.config.json');

try {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);

  if (config.server) {
    delete config.server;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log('✅ Removed "server" block from capacitor.config.json');
  } else {
    console.log('ℹ️  No "server" block found — config is already clean');
  }
} catch (err) {
  console.error('❌ Failed to process capacitor.config.json:', err.message);
  process.exit(1);
}
