#!/usr/bin/env node

/**
 * Quick bundle size analysis script
 * Provides insights based on known dependencies and their typical sizes
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build', 'static', 'js');

console.log('📦 Bundle Analysis Helper\n');
console.log('To get actual bundle sizes, run:');
console.log('  1. npm run build');
console.log('  2. npm run analyze:html\n');

// Check if build exists
if (!fs.existsSync(buildDir)) {
  console.log('❌ Build directory not found. Please run "npm run build" first.\n');
  process.exit(1);
}

const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js'));
if (files.length === 0) {
  console.log('❌ No JS bundles found. Please run "npm run build" first.\n');
  process.exit(1);
}

console.log('✅ Found build files. Analyzing...\n');

// Get file sizes
const fileSizes = files.map(file => {
  const filePath = path.join(buildDir, file);
  const stats = fs.statSync(filePath);
  return {
    name: file,
    size: stats.size,
    sizeKB: (stats.size / 1024).toFixed(2),
    sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
  };
});

// Sort by size
fileSizes.sort((a, b) => b.size - a.size);

console.log('📊 Bundle Sizes:\n');
fileSizes.forEach(file => {
  const sizeStr = file.sizeMB > 1 
    ? `${file.sizeMB} MB` 
    : `${file.sizeKB} KB`;
  console.log(`  ${file.name}: ${sizeStr}`);
});

const totalSize = fileSizes.reduce((sum, f) => sum + f.size, 0);
console.log(`\n📦 Total Bundle Size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`);

console.log('💡 For detailed analysis, run: npm run analyze:html\n');

