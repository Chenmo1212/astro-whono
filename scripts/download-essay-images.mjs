#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const ESSAY_DIR = path.join(__dirname, '../src/content/essay');
const PUBLIC_IMAGES_DIR = path.join(__dirname, '../public/images/essay');

/**
 * Extract image URLs from markdown content
 * @param {string} content - Markdown content
 * @returns {Array<{url: string, alt: string}>} - Array of image objects
 */
function extractImageUrls(content) {
    const images = [];

    // Match markdown image syntax: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
        const alt = match[1] || 'image';
        const url = match[2];

        // Only process external URLs (http/https)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            images.push({ url, alt });
        }
    }

    return images;
}

/**
 * Download image from URL
 * @param {string} url - Image URL
 * @param {string} destPath - Destination file path
 * @returns {Promise<void>}
 */
function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirects
                downloadImage(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${url} (Status: ${response.statusCode})`));
                return;
            }

            const fileStream = fs.createWriteStream(destPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => { }); // Delete partial file
                reject(err);
            });
        }).on('error', reject);
    });
}

/**
 * Get file extension from URL or content-type
 * @param {string} url - Image URL
 * @returns {string} - File extension
 */
function getFileExtension(url) {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath);

    if (ext && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(ext)) {
        return ext;
    }

    // Default to .jpg if no extension found
    return '.jpg';
}

/**
 * Process a single essay file
 * @param {string} filename - Essay filename
 */
async function processEssayFile(filename) {
    const filePath = path.join(ESSAY_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    const images = extractImageUrls(content);

    if (images.length === 0) {
        console.log(`📄 ${filename}: No external images found`);
        return;
    }

    console.log(`\n📄 Processing: ${filename}`);
    console.log(`   Found ${images.length} external image(s)`);

    // Create folder for this essay (remove .md extension)
    const essayName = filename.replace(/\.md$/, '');
    const essayImageDir = path.join(PUBLIC_IMAGES_DIR, essayName);

    if (!fs.existsSync(essayImageDir)) {
        fs.mkdirSync(essayImageDir, { recursive: true });
        console.log(`   ✅ Created directory: ${essayImageDir}`);
    }

    // Download each image
    for (let i = 0; i < images.length; i++) {
        const { url, alt } = images[i];
        const ext = getFileExtension(url);

        // Use alt text as filename, or fallback to image1, image2, etc.
        let imageName = alt || `image${i + 1}`;
        // Sanitize filename
        imageName = imageName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const destFilename = `${imageName}${ext}`;
        const destPath = path.join(essayImageDir, destFilename);

        try {
            console.log(`   ⬇️  Downloading: ${url}`);
            await downloadImage(url, destPath);
            console.log(`   ✅ Saved to: ${destFilename}`);
        } catch (error) {
            console.error(`   ❌ Failed to download ${url}: ${error.message}`);
        }
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🚀 Starting essay image download script...\n');

    // Ensure public images directory exists
    if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
        fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
        console.log(`✅ Created base directory: ${PUBLIC_IMAGES_DIR}\n`);
    }

    // Get all markdown files in essay directory
    const files = fs.readdirSync(ESSAY_DIR).filter(file => file.endsWith('.md'));

    console.log(`📚 Found ${files.length} essay file(s)\n`);

    // Process each file
    for (const file of files) {
        await processEssayFile(file);
    }

    console.log('\n✨ Done! All images have been processed, meow.');
}

// Run the script
main().catch(console.error);

// Made with Bob
