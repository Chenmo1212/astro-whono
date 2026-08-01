import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const viteCachePath = path.resolve(projectRoot, 'node_modules/.vite');

const isInsideProject = (targetPath) => {
  const relativePath = path.relative(projectRoot, targetPath);
  return relativePath.length > 0
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
};

if (!isInsideProject(viteCachePath)) {
  console.error(`[dev:clean] Refusing to delete outside project root: ${viteCachePath}`);
  process.exit(1);
}

if (!existsSync(viteCachePath)) {
  console.log('[dev:clean] Vite cache not found, continuing.');
  process.exit(0);
}

try {
  rmSync(viteCachePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dev:clean] Failed to remove ${path.relative(projectRoot, viteCachePath)}.`);
  console.error('[dev:clean] Stop the dev server and close any process using node_modules/.vite, then run again.');
  console.error(`[dev:clean] ${message}`);
  process.exit(1);
}

console.log(`[dev:clean] Removed ${path.relative(projectRoot, viteCachePath)}`);
