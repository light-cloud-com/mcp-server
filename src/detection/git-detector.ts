// src/detection/git-detector.ts - Local Git repository detection

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { LocalGitDetection } from '../types.js';

export function detectLocalGit(directory: string = process.cwd()): LocalGitDetection {
  const gitDir = path.join(directory, '.git');

  if (!fs.existsSync(gitDir)) {
    return { hasGit: false };
  }

  const result: LocalGitDetection = {
    hasGit: true,
  };

  // Get remote URL
  result.remoteUrl = getRemoteUrl(gitDir);

  // Parse GitHub info from URL
  if (result.remoteUrl) {
    const gitHubInfo = parseGitHubUrl(result.remoteUrl);
    if (gitHubInfo) {
      result.isGitHub = true;
      result.owner = gitHubInfo.owner;
      result.repo = gitHubInfo.repo;
    } else {
      result.isGitHub = false;
    }
  }

  // Get current branch
  result.branch = getCurrentBranch(gitDir);

  // Check dirty status
  result.isDirty = checkDirtyStatus(directory);

  return result;
}

function getRemoteUrl(gitDir: string): string | undefined {
  const configPath = path.join(gitDir, 'config');

  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const config = fs.readFileSync(configPath, 'utf-8');

    // Parse the git config file to find remote "origin" URL
    const lines = config.split('\n');
    let inOriginSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[remote "origin"]') {
        inOriginSection = true;
        continue;
      }

      if (inOriginSection) {
        if (trimmed.startsWith('[')) {
          // Exited the origin section
          break;
        }

        const urlMatch = trimmed.match(/^\s*url\s*=\s*(.+)$/);
        if (urlMatch) {
          return urlMatch[1].trim();
        }
      }
    }
  } catch {
    // Failed to read config
  }

  return undefined;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle HTTPS URLs: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // Handle SSH URLs: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

function getCurrentBranch(gitDir: string): string | undefined {
  const headPath = path.join(gitDir, 'HEAD');

  if (!fs.existsSync(headPath)) {
    return undefined;
  }

  try {
    const head = fs.readFileSync(headPath, 'utf-8').trim();

    // HEAD can be a ref (branch) or a commit hash (detached HEAD)
    const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (refMatch) {
      return refMatch[1];
    }

    // Detached HEAD - return the commit hash
    if (/^[0-9a-f]{40}$/.test(head)) {
      return head.substring(0, 7); // Return short hash
    }
  } catch {
    // Failed to read HEAD
  }

  return undefined;
}

function checkDirtyStatus(directory: string): boolean | undefined {
  try {
    // Use git status --porcelain to check for uncommitted changes
    const output = execSync('git status --porcelain', {
      cwd: directory,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // If output is non-empty, there are uncommitted changes
    return output.trim().length > 0;
  } catch {
    // Git command failed, return undefined
    return undefined;
  }
}
