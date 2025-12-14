/**
 * Verify Expo Project Association
 * 
 * This script checks if the local project is correctly associated with
 * the Expo project that has APNs credentials configured.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Expo Project Association\n');

// Read app.json
const appJsonPath = path.join(__dirname, '..', 'app.json');
if (!fs.existsSync(appJsonPath)) {
  console.error('❌ app.json not found!');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const projectId = appJson?.expo?.extra?.eas?.projectId;
const appSlug = appJson?.expo?.slug;
const bundleId = appJson?.expo?.ios?.bundleIdentifier;

console.log('📋 Local Configuration:');
console.log(`   Project ID: ${projectId || 'NOT SET'}`);
console.log(`   App Slug: ${appSlug || 'NOT SET'}`);
console.log(`   Bundle ID: ${bundleId || 'NOT SET'}`);
console.log(`   Owner: odedchem (from eas whoami)`);
console.log('');

if (!projectId) {
  console.error('❌ ERROR: projectId is not set in app.json!');
  console.error('   Add it to app.json:');
  console.error('   {');
  console.error('     "expo": {');
  console.error('       "extra": {');
  console.error('         "eas": {');
  console.error('           "projectId": "<your-project-id>"');
  console.error('         }');
  console.error('       }');
  console.error('     }');
  console.error('   }');
  process.exit(1);
}

console.log('✅ Project ID is configured');
console.log('');

console.log('📝 Next Steps:');
console.log('   1. Check which Expo project this projectId belongs to:');
console.log('      - Go to https://expo.dev/accounts/odedchem/projects');
console.log('      - Find the project with projectId:', projectId);
console.log('      - Note the project slug (e.g., "expiryx" or "expiryx-clean")');
console.log('');
console.log('   2. Check which project has APNs credentials:');
console.log('      - Run: eas credentials -p ios');
console.log('      - Look for the project that has the push key for bundle ID:', bundleId);
console.log('');
console.log('   3. If they don\'t match:');
console.log('      Option A: Upload APNs key to the project that matches projectId');
console.log('      Option B: Update projectId in app.json to match the project with APNs key');
console.log('');
console.log('   4. After fixing, rebuild:');
console.log('      eas build -p ios --profile development');
console.log('');

console.log('🔗 Expected Project Association:');
console.log(`   The projectId "${projectId}" should belong to the same Expo project`);
console.log(`   that has APNs credentials for bundle ID "${bundleId}"`);
console.log('');

if (appSlug && appSlug.includes('expiryx-clean')) {
  console.log('⚠️  WARNING: App slug is "expiryx-clean"');
  console.log('   If the error shows "@odedchem/expiryx" (without "-clean"),');
  console.log('   the projectId belongs to a different project!');
  console.log('');
}

console.log('💡 To verify project association:');
console.log('   - Check Expo dashboard: https://expo.dev/accounts/odedchem/projects');
console.log('   - Each project shows its projectId in the settings');
console.log('   - Match the projectId from app.json with the project in dashboard');
console.log('');

