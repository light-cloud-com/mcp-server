// src/config/config-manager.ts - .lightcloud config file management

import * as fs from 'fs';
import * as path from 'path';
import type { LightCloudConfig } from '../types.js';

const CONFIG_FILENAME = '.lightcloud';

/**
 * Read .lightcloud config file from a directory
 */
export function readConfig(directory: string = process.cwd()): LightCloudConfig | null {
  const configPath = path.join(directory, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as LightCloudConfig;

    // Validate config structure
    if (typeof config !== 'object' || config === null) {
      return null;
    }

    return config;
  } catch {
    // Invalid JSON or read error
    return null;
  }
}

/**
 * Write .lightcloud config file to a directory
 */
export function writeConfig(config: LightCloudConfig, directory: string = process.cwd()): void {
  const configPath = path.join(directory, CONFIG_FILENAME);

  // Merge with existing config if present
  const existingConfig = readConfig(directory) || {};
  const mergedConfig = { ...existingConfig, ...config };

  // Remove undefined values
  const cleanConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mergedConfig)) {
    if (value !== undefined) {
      cleanConfig[key] = value;
    }
  }

  const content = JSON.stringify(cleanConfig, null, 2) + '\n';
  fs.writeFileSync(configPath, content, 'utf-8');
}

/**
 * Check if a .lightcloud config file exists
 */
export function configExists(directory: string = process.cwd()): boolean {
  const configPath = path.join(directory, CONFIG_FILENAME);
  return fs.existsSync(configPath);
}

/**
 * Delete .lightcloud config file
 */
export function deleteConfig(directory: string = process.cwd()): boolean {
  const configPath = path.join(directory, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return false;
  }

  try {
    fs.unlinkSync(configPath);
    return true;
  } catch {
    return false;
  }
}
