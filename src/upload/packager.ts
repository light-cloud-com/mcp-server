// src/upload/packager.ts - Source code packaging for upload

import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { DEFAULT_EXCLUDES, parseGitignore, gitignoreToGlob } from './excludes.js';
import type { PackageResult } from '../types.js';

interface PackageOptions {
  directory?: string;
  additionalExcludes?: string[];
}

export async function packageSource(options: PackageOptions = {}): Promise<PackageResult> {
  const directory = options.directory || process.cwd();
  const additionalExcludes = options.additionalExcludes || [];

  // Build exclude patterns
  const excludePatterns = buildExcludePatterns(directory, additionalExcludes);

  // Create archive
  return createArchive(directory, excludePatterns);
}

function buildExcludePatterns(directory: string, additionalExcludes: string[]): string[] {
  const patterns = [...DEFAULT_EXCLUDES, ...additionalExcludes];

  // Parse .gitignore if exists
  const gitignorePath = path.join(directory, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      const gitignorePatterns = parseGitignore(gitignoreContent);

      // Convert gitignore patterns to glob patterns
      for (const pattern of gitignorePatterns) {
        patterns.push(...gitignoreToGlob(pattern));
      }
    } catch {
      // Failed to parse .gitignore, continue with default excludes
    }
  }

  return [...new Set(patterns)]; // Deduplicate
}

function createArchive(directory: string, excludePatterns: string[]): Promise<PackageResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let fileCount = 0;
    let totalSize = 0;
    let excludedCount = 0;

    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    archive.on('entry', (entry) => {
      if (entry.stats) {
        fileCount++;
        totalSize += entry.stats.size;
      }
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        // File not found, skip it
        excludedCount++;
      } else {
        reject(err);
      }
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString('base64');

      resolve({
        buffer,
        base64,
        fileCount,
        totalSize,
        excludedCount,
      });
    });

    // Add files from directory with glob patterns
    archive.glob('**/*', {
      cwd: directory,
      ignore: excludePatterns,
      dot: true, // Include dotfiles
      nodir: true, // Only include files, not directories
    });

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Get the size of a directory in bytes (excluding ignored patterns)
 */
export async function getDirectorySize(directory: string): Promise<{ totalSize: number; fileCount: number }> {
  const excludePatterns = buildExcludePatterns(directory, []);
  let totalSize = 0;
  let fileCount = 0;

  function walkDir(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      // Check if should be excluded
      const shouldExclude = excludePatterns.some((pattern) => {
        // Simple pattern matching (not full glob)
        if (pattern === entry.name) return true;
        if (pattern === relPath) return true;
        if (pattern.endsWith('/**') && relPath.startsWith(pattern.slice(0, -3))) return true;
        return false;
      });

      if (shouldExclude) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
          fileCount++;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  walkDir(directory);

  return { totalSize, fileCount };
}
