#!/usr/bin/env node
/**
 * SimpleSpa Password Hash Generator
 *
 * Generates a bcrypt hash for admin passwords
 *
 * Usage:
 *   node generate-password-hash.js "YourPassword123"
 *
 * Or interactive:
 *   node generate-password-hash.js
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');

// Check if password provided as argument
const passwordArg = process.argv[2];

async function generateHash(password) {
  try {
    console.log('\n🔐 Generating bcrypt hash (10 rounds)...\n');

    const hash = await bcrypt.hash(password, 10);

    console.log('✓ Password hash generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Copy this hash to use in SQL or environment variables:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(hash);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Usage examples:\n');
    console.log('1. SQL Insert:');
    console.log(`   INSERT INTO users (email, password, role, status)`);
    console.log(`   VALUES ('user@example.com', '${hash}', 'super_admin', 'approved');\n`);

    console.log('2. SQL Update:');
    console.log(`   UPDATE users SET password = '${hash}'`);
    console.log(`   WHERE email = 'user@example.com';\n`);

    // Verify the hash works
    const isValid = await bcrypt.compare(password, hash);
    console.log(`✓ Hash verification: ${isValid ? 'PASSED' : 'FAILED'}\n`);

  } catch (error) {
    console.error('❌ Error generating hash:', error.message);
    process.exit(1);
  }
}

if (passwordArg) {
  // Password provided as argument
  generateHash(passwordArg);
} else {
  // Interactive mode - prompt for password
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   SimpleSpa Password Hash Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  rl.question('Enter password to hash: ', (password) => {
    rl.close();

    if (!password || password.trim() === '') {
      console.error('❌ Error: Password cannot be empty');
      process.exit(1);
    }

    if (password.length < 8) {
      console.warn('⚠️  Warning: Password is less than 8 characters');
    }

    generateHash(password);
  });

  // Hide password input (doesn't work in all terminals)
  rl._writeToOutput = function _writeToOutput(stringToWrite) {
    if (stringToWrite.startsWith('Enter password')) {
      rl.output.write(stringToWrite);
    } else {
      rl.output.write('*');
    }
  };
}
