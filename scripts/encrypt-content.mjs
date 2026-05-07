#!/usr/bin/env node
/**
 * Content Encryption Tool
 *
 * This script encrypts blog post content using AES-256-GCM with PBKDF2 key derivation.
 * Password is read from ENCRYPTION_PASSWORD environment variable.
 *
 * Usage:
 *   node scripts/encrypt-content.mjs <content>
 *
 * Example:
 *   node scripts/encrypt-content.mjs "My secret content"
 */

import crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Configuration
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Encrypt content with AES-256-GCM
 */
function encryptContent(content, password) {
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from password
  const key = deriveKey(password, salt);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt content
  let encrypted = cipher.update(content, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine all components
  const result = {
    encrypted: encrypted,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: ALGORITHM,
    iterations: PBKDF2_ITERATIONS
  };
  
  return result;
}

/**
 * Decrypt content with AES-256-GCM
 */
function decryptContent(encryptedData, password) {
  // Parse encrypted data
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const encrypted = encryptedData.encrypted;
  
  // Derive key from password
  const key = deriveKey(password, salt);
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt content
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  // Get password from environment variable
  const password = process.env.ENCRYPTION_PASSWORD;
  
  if (!password) {
    console.error('Error: ENCRYPTION_PASSWORD environment variable is not set');
    console.error('');
    console.error('Please create a .env file with:');
    console.error('  ENCRYPTION_PASSWORD=your-password-here');
    process.exit(1);
  }
  
  if (args.length < 1) {
    console.error('Usage: node encrypt-content.mjs <content>');
    console.error('');
    console.error('Example:');
    console.error('  node encrypt-content.mjs "My secret content"');
    console.error('');
    console.error('Note: Password is read from ENCRYPTION_PASSWORD environment variable');
    process.exit(1);
  }
  
  const content = args[0];
  
  console.log('Encrypting content...\n');
  
  const encrypted = encryptContent(content, password);
  
  console.log('Encrypted Data (copy this to your markdown frontmatter):');
  console.log('---');
  console.log('encrypted: true');
  console.log('encryptedContent:');
  console.log('  encrypted: "' + encrypted.encrypted + '"');
  console.log('  salt: "' + encrypted.salt + '"');
  console.log('  iv: "' + encrypted.iv + '"');
  console.log('  authTag: "' + encrypted.authTag + '"');
  console.log('  algorithm: "' + encrypted.algorithm + '"');
  console.log('  iterations: ' + encrypted.iterations);
  console.log('---');
  console.log('');
  console.log('Note: Do NOT include the password in the frontmatter.');
  console.log('The password is stored securely in the .env file.');
  console.log('');
  
  // Test decryption
  console.log('Testing decryption...');
  try {
    const decrypted = decryptContent(encrypted, password);
    if (decrypted === content) {
      console.log('✓ Decryption successful!');
    } else {
      console.error('✗ Decryption failed: content mismatch');
    }
  } catch (error) {
    console.error('✗ Decryption failed:', error.message);
  }
}

export { encryptContent, decryptContent, deriveKey };

// Made with Bob
