# Blog Encryption Feature Guide

## Overview

This project implements a client-side decryption feature for blog posts. Encrypted content is stored in the frontend, and only users with the correct password can decrypt and view the content in their browser.

## Encryption Scheme

- **Encryption Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 (100,000 iterations, SHA-256)
- **Decryption Location**: Client-side (browser)
- **Password Storage**: Environment variable (.env file)
- **Security**: Encrypted content is stored in the frontend, password is stored in server environment variables, decrypted content never transmitted over network

## Workflow

### Automatic Encryption (Recommended)

1. **Write Article**
   - Create or edit markdown file in `src/content/essay/` directory
   - Set `encrypted: true` in frontmatter

2. **Automatic Encryption**
   - Run `npm run build` - the `prebuild` script automatically executes
   - `scripts/auto-encrypt.mjs` scans all essays marked with `encrypted: true` but without `encryptedContent`
   - Automatically encrypts content using the password from environment variables
   - Writes encrypted data to the article's frontmatter

3. **Password Verification** (Online)
   - User visits encrypted article and enters password
   - Frontend calls `/api/decrypt` API to verify password
   - Backend validates password against environment variable

4. **Client-side Decryption** (Online)
   - After password verification succeeds, backend returns success status
   - Frontend uses Web Crypto API to decrypt content in the browser
   - Decrypted content is rendered directly in the browser without network transmission

### Manual Encryption (Optional)

If you need to manually encrypt specific content:

1. **Content Encryption** (Offline)
   - Use `scripts/encrypt-content.mjs` tool to encrypt article content
   - Generates encrypted data (encrypted, salt, iv, authTag)
   - Manually copy to article frontmatter

## Usage

### 0. Configure Encryption Password

First, create a `.env` file in the project root (if it doesn't exist) and set the encryption password:

```bash
# .env
ENCRYPTION_PASSWORD=your-secure-password-here

# Optional: API Base URL (if API is hosted separately)
# PUBLIC_API_BASE_URL=https://api.example.com
```

**Important Notes**:
- `.env` file is in `.gitignore` and won't be committed to version control
- Use a strong password (at least 12 characters, including uppercase, lowercase, numbers, and special characters)
- Never hardcode passwords in code or documentation
- `PUBLIC_API_BASE_URL` is optional - only set it if your API server is hosted separately from the frontend
- If `PUBLIC_API_BASE_URL` is not set, the component will use relative URLs (same domain)

### 1. Create Encrypted Article (Automatic Encryption)

Create or edit a markdown file in `src/content/essay/` directory, and simply set `encrypted: true` in the frontmatter:

```markdown
---
title: 'My Encrypted Article'
description: 'This is an encrypted article'
date: '2024-01-01'
encrypted: true
---

This is the article body content.
When you run npm run build, this content will be automatically encrypted.
```

**Important**:
- Only need to set `encrypted: true`, no need to manually add `encryptedContent` field
- Content will be automatically encrypted during build
- After encryption, original content is removed, only encrypted data remains

### 2. Build Project

Run the build command, auto-encryption script executes before build:

```bash
npm run build
```

Output example:

```
🔐 Auto-Encryption Script

Scanning directory: /path/to/astro-whono/src/content/essay

○ first-post.md - Skipped (Not marked for encryption or already encrypted)
✓ my-secret-post.md - Encrypted
○ third-post.md - Skipped (Not marked for encryption or already encrypted)

==================================================
Total files: 3
Encrypted: 1
Skipped: 2
Errors: 0
==================================================
```

After encryption, the file is automatically updated to:

```markdown
---
title: 'My Encrypted Article'
description: 'This is an encrypted article'
date: '2024-01-01'
encrypted: true
encryptedContent:
  encrypted: "base64_encrypted_content_here"
  salt: "base64_salt_here"
  iv: "base64_iv_here"
  authTag: "base64_auth_tag_here"
  algorithm: "aes-256-gcm"
  iterations: 100000
---
```

### 3. Access Encrypted Article

1. Visit the article page
2. See password input form
3. Enter the correct password
4. Content is decrypted and displayed in the browser

### 4. Using the Component in Your Layout

To display encrypted content in your essay layout, use the `EncryptedPostClient` component:

```astro
---
import EncryptedPostClient from '@/components/EncryptedPostClient.astro';

// In your essay page
const { entry } = Astro.props;
const { data } = entry;
---

{data.encrypted && data.encryptedContent ? (
  <EncryptedPostClient 
    postId={entry.id}
    encryptedContent={data.encryptedContent}
  />
) : (
  <!-- Regular content display -->
  <Content />
)}
```

## Technical Details

### Encryption Process (Offline)

```javascript
// 1. Generate random salt and IV
const salt = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

// 2. Derive key from password using PBKDF2
const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

// 3. Encrypt content using AES-256-GCM
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = cipher.update(content, 'utf8', 'base64') + cipher.final('base64');
const authTag = cipher.getAuthTag();
```

### Decryption Process (Online)

```javascript
// 1. Verify password (backend API)
// User's input password is compared with environment variable password
POST /api/v1/blog/verify
{ password }
→ { success: true }

// 2. Derive key in browser
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  passwordKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt']
);

// 3. Decrypt content
const decrypted = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv, tagLength: 128 },
  key,
  ciphertext
);
```

## Manual Encryption (Optional)

If you need to manually encrypt specific content instead of using automatic encryption:

```bash
node scripts/encrypt-content.mjs "Your article content"
```

Example:

```bash
node scripts/encrypt-content.mjs "This is secret article content"
```

Output example:

```
Encrypting content...

Encrypted Data (copy this to your markdown frontmatter):
---
encrypted: true
encryptedContent:
  encrypted: "base64_encrypted_content_here"
  salt: "base64_salt_here"
  iv: "base64_iv_here"
  authTag: "base64_auth_tag_here"
  algorithm: "aes-256-gcm"
  iterations: 100000
---

Note: Do NOT include the password in the frontmatter.
The password is stored securely in the .env file.

Testing decryption...
✓ Decryption successful!
```

Then manually copy the output frontmatter to your markdown file.

## File Structure

```
├── .env                                    # Environment variables (contains encryption password)
├── .env.example                            # Environment variable template
├── package.json                            # Contains prebuild script
├── scripts/
│   ├── auto-encrypt.mjs                   # Auto-encryption script (runs before build)
│   └── encrypt-content.mjs                # Manual encryption tool script
├── src/
│   ├── components/
│   │   └── EncryptedPostClient.astro      # Client-side decryption component
│   ├── pages/
│   │   └── api/
│   │       └── decrypt.ts                 # Password verification API
│   ├── content/
│   │   └── essay/
│   │       └── *.md                       # Essay articles (can contain encrypted content)
│   └── content.config.ts                  # Content configuration (includes encryption field definitions)
```

## Security Notes

1. **Password Strength**: Use strong passwords (at least 12 characters, including uppercase, lowercase, numbers, and special characters)
2. **Password Storage**: Password is stored in `.env` file and won't be committed to version control
3. **Environment Variables**: Ensure `.env` file is in `.gitignore` to avoid leaking to public repositories
4. **Encrypted Content**: Encrypted content is stored in the frontend, anyone can obtain it, but cannot decrypt without password
5. **Client-side Decryption**: Decryption happens in the browser, decrypted content is not sent to the server
6. **Session Cache**: Decrypted content is cached in sessionStorage and automatically cleared when tab is closed
7. **Production Environment**: In production, set `ENCRYPTION_PASSWORD` via environment variables or key management service

## Browser Compatibility

Requires support for the following Web APIs:
- Web Crypto API (crypto.subtle)
- PBKDF2
- AES-GCM

Supported browsers:
- Chrome 37+
- Firefox 34+
- Safari 11+
- Edge 79+

## Complete Example (Automatic Encryption)

1. Create `.env` file:
```bash
ENCRYPTION_PASSWORD=MySecurePassword123!

# Optional: If API is on a different server
# PUBLIC_API_BASE_URL=https://api.example.com
```

2. Create encrypted article `src/content/essay/my-secret.md`:
```markdown
---
title: 'My Secret'
description: 'This is an encrypted article'
date: '2024-01-01'
encrypted: true
---

This is my secret content, only people who know the password can see it.
```

3. Run build command:
```bash
npm run build
```

4. File is automatically updated to encrypted version:
```markdown
---
title: 'My Secret'
description: 'This is an encrypted article'
date: '2024-01-01'
encrypted: true
encryptedContent:
  encrypted: "..."
  salt: "..."
  iv: "..."
  authTag: "..."
  algorithm: "aes-256-gcm"
  iterations: 100000
---
```

5. Enter password `MySecurePassword123!` when visiting the article to view content

## Workflow Summary

### Daily Usage (Recommended)

1. Set `encrypted: true` in frontmatter when writing articles
2. Run `npm run build` for automatic encryption
3. Deploy to production environment
4. Users enter password to view when visiting

### Advantages

- ✅ **Seamless Operation**: Only need to set `encrypted: true`, everything else is automatic
- ✅ **Automated**: Content is automatically encrypted during build, no need to run scripts manually
- ✅ **Secure**: Password is stored in environment variables and won't leak
- ✅ **Simple**: No need to remember complex encryption commands
- ✅ **Reliable**: Every build checks and encrypts articles that need encryption

## Troubleshooting

### Issue: Cannot decrypt content
- Check if password in `.env` file is correct
- Check if encryption parameters are complete
- Check browser console for error messages
- Ensure server can read environment variables

### Issue: Encryption tool won't run
- Ensure Node.js is installed
- Ensure running command in project root directory
- Check if `.env` file exists and contains `ENCRYPTION_PASSWORD`
- Check script permissions: `chmod +x scripts/encrypt-content.mjs`

### Issue: Environment variables not taking effect
- Restart development server to load new environment variables
- In production, ensure `ENCRYPTION_PASSWORD` and `PUBLIC_API_BASE_URL` (if needed) are set via platform configuration
- Check `.env` file format is correct (no spaces, use equals sign)

### Issue: API request fails with CORS error
- If using separate API server, ensure CORS is properly configured on the backend
- Check that `PUBLIC_API_BASE_URL` is set correctly in `.env`
- Verify the API endpoint is accessible from the frontend domain

## Developer Information

- Encryption Algorithm: AES-256-GCM
- Key Derivation: PBKDF2-SHA256 (100,000 iterations)
- Key Length: 256 bits
- IV Length: 128 bits
- Salt Length: 256 bits
- Auth Tag Length: 128 bits