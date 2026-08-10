// src/upload/excludes.ts - Default exclude patterns for source packaging

export const DEFAULT_EXCLUDES: string[] = [
  // Version control
  '.git',
  '.git/**',
  '.svn',
  '.svn/**',
  '.hg',
  '.hg/**',

  // Dependencies
  'node_modules',
  'node_modules/**',
  'vendor',
  'vendor/**',
  'bower_components',
  'bower_components/**',

  // Python
  '__pycache__',
  '__pycache__/**',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.Python',
  'venv',
  'venv/**',
  '.venv',
  '.venv/**',
  'env',
  'env/**',
  '.env',
  'pip-wheel-metadata',
  '*.egg-info',
  '*.egg-info/**',

  // Build outputs
  'dist',
  'dist/**',
  'build',
  'build/**',
  'out',
  'out/**',
  '.next',
  '.next/**',
  '.nuxt',
  '.nuxt/**',
  '.svelte-kit',
  '.svelte-kit/**',
  '.cache',
  '.cache/**',
  '.parcel-cache',
  '.parcel-cache/**',

  // IDE and editors
  '.idea',
  '.idea/**',
  '.vscode',
  '.vscode/**',
  '*.swp',
  '*.swo',
  '*~',
  '.project',
  '.classpath',
  '.settings',
  '.settings/**',

  // OS files
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',

  // Logs
  '*.log',
  'logs',
  'logs/**',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',

  // Test coverage
  'coverage',
  'coverage/**',
  '.nyc_output',
  '.nyc_output/**',
  'htmlcov',
  'htmlcov/**',

  // Temporary files
  'tmp',
  'tmp/**',
  'temp',
  'temp/**',
  '.tmp',
  '.tmp/**',

  // Light Cloud config (include but not necessarily exclude)
  // '.lightcloud' is intentionally NOT excluded

  // Large binary files
  '*.zip',
  '*.tar',
  '*.tar.gz',
  '*.tgz',
  '*.rar',
  '*.7z',
];

/**
 * Parse .gitignore file and return patterns
 */
export function parseGitignore(content: string): string[] {
  const patterns: string[] = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Handle negation patterns (we ignore them for now as they're complex)
    if (trimmed.startsWith('!')) {
      continue;
    }

    patterns.push(trimmed);
  }

  return patterns;
}

/**
 * Convert a gitignore pattern to a glob pattern for archiver
 */
export function gitignoreToGlob(pattern: string): string[] {
  const patterns: string[] = [];

  // Remove leading slash (gitignore uses it for root-relative patterns)
  let normalized = pattern.replace(/^\//, '');

  // If pattern ends with /, it's a directory - match the directory and its contents
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
    patterns.push(normalized);
    patterns.push(`${normalized}/**`);
  } else {
    patterns.push(normalized);
    // Also match if it's a directory
    patterns.push(`${normalized}/**`);
  }

  return patterns;
}
