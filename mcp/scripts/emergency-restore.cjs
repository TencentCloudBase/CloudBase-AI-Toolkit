#!/usr/bin/env node

/**
 * Emergency restore script
 * Use this if dependencies were not restored after a failed publish
 * 
 * Usage: node scripts/emergency-restore.js
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const backupPath = path.join(__dirname, '../package.json.backup');

console.log('🔧 Emergency Dependency Restore Script');
console.log('');

if (!fs.existsSync(backupPath)) {
  console.error('❌ No backup file found at:', backupPath);
  console.error('   Cannot restore dependencies');
  process.exit(1);
}

try {
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  if (!backup.dependencies) {
    console.error('❌ Backup file does not contain dependencies');
    process.exit(1);
  }

  console.log('📦 Backup information:');
  console.log(`   Package: ${backup.name || 'unknown'}`);
  console.log(`   Version: ${backup.version || 'unknown'}`);
  console.log(`   Timestamp: ${backup.timestamp || 'unknown'}`);
  console.log(`   Dependencies count: ${Object.keys(backup.dependencies).length}`);
  console.log('');

  packageJson.dependencies = backup.dependencies;
  
  fs.writeFileSync(
    packagePath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  );

  console.log('✓ Dependencies restored successfully');
  console.log(`   Restored ${Object.keys(backup.dependencies).length} dependencies`);
  console.log('');
  console.log('⚠️  Backup file still exists. Remove it manually if restoration was successful:');
  console.log(`   rm ${backupPath}`);

} catch (error) {
  console.error('❌ Error during emergency restore:', error.message);
  process.exit(1);
}

