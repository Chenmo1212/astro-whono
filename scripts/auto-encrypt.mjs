#!/usr/bin/env node
/**
 * Auto-Encryption Script
 * 
 * Automatically encrypts essay posts that have `encrypted: true` in frontmatter
 * but don't have `encryptedContent` yet. Runs before build.
 * 
 * Usage: node scripts/auto-encrypt.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptContent } from './encrypt-content.mjs';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

const ESSAY_DIR = path.join(__dirname, '../src/content/essay');

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: '', body: content, hasFrontmatter: false };
  }
  
  return {
    frontmatter: match[1],
    body: match[2],
    hasFrontmatter: true
  };
}

/**
 * Check if frontmatter has encrypted: true
 */
function shouldEncrypt(frontmatter) {
  const encryptedMatch = frontmatter.match(/^encrypted:\s*(true|false)/m);
  const hasEncryptedContent = frontmatter.includes('encryptedContent:');
  
  return encryptedMatch && encryptedMatch[1] === 'true' && !hasEncryptedContent;
}

/**
 * Generate encrypted frontmatter
 */
function generateEncryptedFrontmatter(originalFrontmatter, body, password) {
  // Encrypt the body content
  const encrypted = encryptContent(body.trim(), password);
  
  // Build the encrypted frontmatter section
  const encryptedSection = `encryptedContent:
  encrypted: "${encrypted.encrypted}"
  salt: "${encrypted.salt}"
  iv: "${encrypted.iv}"
  authTag: "${encrypted.authTag}"
  algorithm: "${encrypted.algorithm}"
  iterations: ${encrypted.iterations}`;
  
  // Add encrypted section to frontmatter
  return `${originalFrontmatter}\n${encryptedSection}`;
}

/**
 * Process a single markdown file
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body, hasFrontmatter } = parseFrontmatter(content);
  
  if (!hasFrontmatter) {
    return { processed: false, reason: 'No frontmatter found' };
  }
  
  if (!shouldEncrypt(frontmatter)) {
    return { processed: false, reason: 'Not marked for encryption or already encrypted' };
  }
  
  // Get password from environment
  const password = process.env.ENCRYPTION_PASSWORD;
  if (!password) {
    throw new Error('ENCRYPTION_PASSWORD environment variable is not set');
  }
  
  // Generate new frontmatter with encrypted content
  const newFrontmatter = generateEncryptedFrontmatter(frontmatter, body, password);
  
  // Create new file content (frontmatter only, body is now encrypted)
  const newContent = `---\n${newFrontmatter}\n---\n`;
  
  // Write back to file
  fs.writeFileSync(filePath, newContent, 'utf-8');
  
  return { processed: true, reason: 'Successfully encrypted' };
}

/**
 * Process all markdown files in essay directory
 */
function processAllFiles() {
  console.log('🔐 Auto-Encryption Script\n');
  console.log(`Scanning directory: ${ESSAY_DIR}\n`);
  
  if (!fs.existsSync(ESSAY_DIR)) {
    console.log('Essay directory not found. Skipping encryption.');
    return;
  }
  
  const files = fs.readdirSync(ESSAY_DIR);
  const markdownFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  
  if (markdownFiles.length === 0) {
    console.log('No markdown files found. Skipping encryption.');
    return;
  }
  
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const file of markdownFiles) {
    const filePath = path.join(ESSAY_DIR, file);
    
    try {
      const result = processFile(filePath);
      
      if (result.processed) {
        console.log(`✓ ${file} - Encrypted`);
        processedCount++;
      } else {
        console.log(`○ ${file} - Skipped (${result.reason})`);
        skippedCount++;
      }
    } catch (error) {
      console.error(`✗ ${file} - Error: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total files: ${markdownFiles.length}`);
  console.log(`Encrypted: ${processedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('='.repeat(50) + '\n');
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    processAllFiles();
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

export { processFile, processAllFiles };


