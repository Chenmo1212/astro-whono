#!/usr/bin/env node
/**
 * Auto-Encryption Script
 *
 * Automatically encrypts essay posts that have `encrypted: true` in frontmatter
 * but don't have `encryptedContent` yet. Runs before build.
 *
 * Before encrypting, calls generate_teaser.py to populate `summary` for any
 * encrypted post that is missing one (requires DEEPSEEK_API_KEY in env).
 *
 * Usage: node scripts/auto-encrypt.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { encryptContent } from './encrypt-content.mjs';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

const CONTENT_DIRS = [
  path.join(__dirname, '../src/content/essay'),
  path.join(__dirname, '../src/content/bits'),
];

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
 * Run generate_teaser.py to populate `summary` for encrypted posts before encryption.
 * Skips gracefully if DEEPSEEK_API_KEY is not set.
 */
function generateSummaries() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.log('⚠️  DEEPSEEK_API_KEY not set — skipping AI summary generation\n');
    return;
  }

  const scriptPath = path.join(__dirname, 'weibo-diary-crawler', 'generate_teaser.py');
  if (!fs.existsSync(scriptPath)) {
    console.log(`⚠️  generate_teaser.py not found at ${scriptPath} — skipping\n`);
    return;
  }

  console.log('🤖 Generating summaries for encrypted posts...\n');
  const result = spawnSync('python3', [scriptPath, '--all', '--apply'], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  if (result.error) {
    console.error(`⚠️  Failed to run generate_teaser.py: ${result.error.message}\n`);
  } else if (result.status !== 0) {
    console.error(`⚠️  generate_teaser.py exited with code ${result.status} — summaries may be incomplete\n`);
  } else {
    console.log('');
  }
}

/**
 * Process all markdown files in the given directories
 */
function processAllFiles() {
  console.log('🔐 Auto-Encryption Script\n');

  generateSummaries();

  let totalFiles = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const dir of CONTENT_DIRS) {
    console.log(`Scanning directory: ${dir}\n`);

    if (!fs.existsSync(dir)) {
      console.log('Directory not found. Skipping.\n');
      continue;
    }

    const files = fs.readdirSync(dir);
    const markdownFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

    if (markdownFiles.length === 0) {
      console.log('No markdown files found. Skipping.\n');
      continue;
    }

    totalFiles += markdownFiles.length;

    for (const file of markdownFiles) {
      const filePath = path.join(dir, file);

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

    console.log('');
  }

  console.log('='.repeat(50));
  console.log(`Total files: ${totalFiles}`);
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


