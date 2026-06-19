#!/usr/bin/env node

/**
 * Restore package.json dependencies after publish
 * This script restores dependencies from backup file
 * 
 * Safety features:
 * - Validates backup and package.json before restoration
 * - Verifies restoration was successful
 * - Handles errors gracefully
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const backupPath = path.join(__dirname, '../package.json.backup');

// Validate package.json structure
function validatePackageJson(pkg) {
  if (!pkg.name || !pkg.version) {
    throw new Error('Invalid package.json: missing name or version');
  }
  return true;
}

// Read and parse package.json with validation
function readPackageJson() {
  if (!fs.existsSync(packagePath)) {
    throw new Error(`package.json not found at ${packagePath}`);
  }
  
  const content = fs.readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(content);
  validatePackageJson(pkg);
  return pkg;
}

// Write package.json with validation
function writePackageJson(pkg) {
  validatePackageJson(pkg);
  const content = JSON.stringify(pkg, null, 2) + '\n';
  
  // Verify we can parse it back
  try {
    JSON.parse(content);
  } catch (e) {
    throw new Error(`Generated invalid JSON: ${e.message}`);
  }
  
  fs.writeFileSync(packagePath, content, 'utf8');
}

try {
  // Check if backup exists
  if (!fs.existsSync(backupPath)) {
    console.log('⚠️  No backup file found, skipping restore');
    console.log('   This is normal if dependencies were already empty');
    process.exit(0);
  }

  // Read backup and package.json
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const packageJson = readPackageJson();

  // Validate backup structure
  if (!backup.dependencies || typeof backup.dependencies !== 'object') {
    console.log('⚠️  Backup file exists but contains no valid dependencies');
    fs.unlinkSync(backupPath);
    process.exit(0);
  }

  // Verify package name and version match (safety check)
  if (backup.name && backup.name !== packageJson.name) {
    console.warn(`⚠️  Package name mismatch: backup=${backup.name}, current=${packageJson.name}`);
  }
  if (backup.version && backup.version !== packageJson.version) {
    console.warn(`⚠️  Package version mismatch: backup=${backup.version}, current=${packageJson.version}`);
    console.warn('   This might be expected if version was updated during publish');
  }

  // Restore dependencies
  const originalDepsCount = Object.keys(packageJson.dependencies || {}).length;
  packageJson.dependencies = { ...backup.dependencies };
  
  // Write restored package.json with validation
  writePackageJson(packageJson);

  // Verify restoration
  const verifyPkg = readPackageJson();
  const restoredDepsCount = Object.keys(verifyPkg.dependencies || {}).length;
  const expectedDepsCount = Object.keys(backup.dependencies).length;
  
  if (restoredDepsCount !== expectedDepsCount) {
    throw new Error(`Restoration verification failed: expected ${expectedDepsCount} dependencies, got ${restoredDepsCount}`);
  }

  console.log('✓ Dependencies restored');
  console.log(`  Previous dependencies count: ${originalDepsCount}`);
  console.log(`  Restored dependencies count: ${restoredDepsCount}`);
  if (backup.timestamp) {
    console.log(`  Backup timestamp: ${backup.timestamp}`);
  }

  // Remove backup file
  fs.unlinkSync(backupPath);
  console.log('✓ Backup file removed');

} catch (error) {
  console.error('❌ Error restoring dependencies:', error.message);
  console.error('   Stack:', error.stack);
  console.error('');
  console.error('⚠️  IMPORTANT: Dependencies may not be restored!');
  console.error('   Please check package.json and manually restore from package.json.backup if needed');
  console.error('');
  console.error('   To manually restore:');
  console.error('   1. Check if package.json.backup exists');
  console.error('   2. Copy dependencies from backup to package.json');
  console.error('   3. Run: node scripts/restore-deps.js');
  
  process.exit(1);
}

