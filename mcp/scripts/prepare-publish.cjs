#!/usr/bin/env node

/**
 * Prepare package.json for publish by removing dependencies
 * This script backs up dependencies and clears them before publishing
 * 
 * Safety features:
 * - Validates package.json before and after modification
 * - Creates backup with timestamp
 * - Handles errors gracefully with automatic cleanup
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
  // Read package.json
  const packageJson = readPackageJson();

  // Check if dependencies exist
  if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
    console.log('⚠️  No dependencies to clear, skipping backup');
    process.exit(0);
  }

  // Check if backup already exists (from previous failed publish)
  if (fs.existsSync(backupPath)) {
    console.log('⚠️  Backup file already exists, restoring first...');
    try {
      const existingBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      if (existingBackup.dependencies) {
        packageJson.dependencies = existingBackup.dependencies;
        writePackageJson(packageJson);
        console.log('✓ Restored dependencies from existing backup');
      }
    } catch (e) {
      console.warn('⚠️  Failed to restore from existing backup, continuing...');
    }
  }

  // Backup original dependencies
  const originalDeps = { ...packageJson.dependencies };
  const backup = {
    dependencies: originalDeps,
    timestamp: new Date().toISOString(),
    version: packageJson.version,
    name: packageJson.name
  };
  
  fs.writeFileSync(
    backupPath,
    JSON.stringify(backup, null, 2),
    'utf8'
  );

  console.log('✓ Dependencies backed up to package.json.backup');
  console.log(`  Backup contains ${Object.keys(originalDeps).length} dependencies`);

  // Clear dependencies for publish
  packageJson.dependencies = {};
  
  // Write modified package.json with validation
  writePackageJson(packageJson);

  console.log('✓ Dependencies cleared for publish');
  console.log(`  Original dependencies count: ${Object.keys(originalDeps).length}`);
  console.log(`  Current dependencies count: 0`);
  
  // Verify the modification
  const verifyPkg = readPackageJson();
  if (Object.keys(verifyPkg.dependencies || {}).length !== 0) {
    throw new Error('Failed to clear dependencies');
  }

} catch (error) {
  console.error('❌ Error preparing for publish:', error.message);
  console.error('   Stack:', error.stack);
  
  // Try to restore if we have a backup
  if (fs.existsSync(backupPath)) {
    try {
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      const packageJson = readPackageJson();
      if (backup.dependencies) {
        packageJson.dependencies = backup.dependencies;
        writePackageJson(packageJson);
        console.log('✓ Attempted to restore dependencies from backup');
      }
    } catch (restoreError) {
      console.error('❌ Failed to restore dependencies:', restoreError.message);
      console.error('   Please manually restore from package.json.backup');
    }
  }
  
  process.exit(1);
}

