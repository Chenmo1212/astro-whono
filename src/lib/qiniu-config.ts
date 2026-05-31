// Load environment variables from .env file
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
config({ path: join(__dirname, '../../.env') });

export const getQiniuConfig = () => {
  return {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || '',
    domain: process.env.QINIU_DOMAIN || ''
  };
};

export const isQiniuConfigured = () => {
  const config = getQiniuConfig();
  return !!(config.accessKey && config.secretKey && config.bucket && config.domain);
};