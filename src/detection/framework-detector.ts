// src/detection/framework-detector.ts - Local framework detection

import * as fs from 'fs';
import * as path from 'path';
import type { LocalFrameworkDetection, Framework, Runtime } from '../types.js';

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

interface PyProjectToml {
  tool?: {
    poetry?: {
      dependencies?: Record<string, string>;
    };
  };
  project?: {
    dependencies?: string[];
    'requires-python'?: string;
  };
}

export function detectLocalFramework(directory: string = process.cwd()): LocalFrameworkDetection {
  const result: LocalFrameworkDetection = {
    deploymentType: 'static',
  };

  // Detect env files
  result.envFiles = detectEnvFiles(directory);

  // Check for Dockerfile first (takes precedence)
  if (fileExists(directory, 'Dockerfile')) {
    result.hasDockerfile = true;
    result.deploymentType = 'container';
  }

  // Detect package manager and Node.js projects
  const packageJsonPath = path.join(directory, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      detectFromPackageJson(packageJson, result, directory);
    } catch {
      // Invalid package.json, continue with other detection
    }
  }

  // Detect Python projects
  if (fileExists(directory, 'requirements.txt') || fileExists(directory, 'pyproject.toml')) {
    detectPythonProject(directory, result);
  }

  // Detect Go projects
  if (fileExists(directory, 'go.mod')) {
    result.runtime = 'go';
    result.deploymentType = 'container';
    result.buildCommand = 'go build -o app .';
    result.startCommand = './app';
  }

  return result;
}

function fileExists(directory: string, filename: string): boolean {
  return fs.existsSync(path.join(directory, filename));
}

function detectEnvFiles(directory: string): string[] {
  const envFiles: string[] = [];
  const possibleEnvFiles = ['.env', '.env.local', '.env.example', '.env.development', '.env.production'];

  for (const envFile of possibleEnvFiles) {
    if (fileExists(directory, envFile)) {
      envFiles.push(envFile);
    }
  }

  return envFiles;
}

function detectFromPackageJson(
  packageJson: PackageJson,
  result: LocalFrameworkDetection,
  directory: string
): void {
  result.runtime = 'nodejs';

  // Detect package manager
  if (fileExists(directory, 'pnpm-lock.yaml')) {
    result.packageManager = 'pnpm';
  } else if (fileExists(directory, 'yarn.lock')) {
    result.packageManager = 'yarn';
  } else if (fileExists(directory, 'package-lock.json')) {
    result.packageManager = 'npm';
  } else {
    result.packageManager = 'npm';
  }

  // Detect Node version
  if (packageJson.engines?.node) {
    result.nodeVersion = packageJson.engines.node;
  }

  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = packageJson.scripts || {};

  // Detect framework from dependencies
  if (deps['next']) {
    result.framework = 'nextjs';
    result.deploymentType = 'container';
    result.buildCommand = `${result.packageManager} run build`;
    result.startCommand = `${result.packageManager} start`;
    result.outputDirectory = '.next';
  } else if (deps['react']) {
    result.framework = 'react';
    result.deploymentType = 'static';
    result.buildCommand = `${result.packageManager} run build`;
    result.outputDirectory = detectReactOutputDir(deps);
  } else if (deps['vue']) {
    result.framework = 'vue';
    result.deploymentType = 'static';
    result.buildCommand = `${result.packageManager} run build`;
    result.outputDirectory = 'dist';
  } else if (deps['@angular/core']) {
    result.framework = 'angular';
    result.deploymentType = 'static';
    result.buildCommand = `${result.packageManager} run build`;
    result.outputDirectory = 'dist';
  } else if (deps['svelte']) {
    result.framework = 'svelte';
    result.deploymentType = 'static';
    result.buildCommand = `${result.packageManager} run build`;
    result.outputDirectory = deps['@sveltejs/kit'] ? '.svelte-kit' : 'public/build';
  } else if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi']) {
    result.framework = 'express';
    result.deploymentType = 'container';
    result.buildCommand = scripts['build'] ? `${result.packageManager} run build` : undefined;
    result.startCommand = scripts['start'] ? `${result.packageManager} start` : 'node index.js';
  }

  // Check if there's a custom build script
  if (!result.buildCommand && scripts['build']) {
    result.buildCommand = `${result.packageManager} run build`;
  }

  // Detect if it's a pure HTML project
  if (!result.framework && fileExists(directory, 'index.html')) {
    result.framework = 'html';
    result.deploymentType = 'static';
    result.outputDirectory = '.';
  }
}

function detectReactOutputDir(deps: Record<string, string>): string {
  // Create React App uses 'build', Vite uses 'dist'
  if (deps['vite']) {
    return 'dist';
  }
  return 'build';
}

function detectPythonProject(directory: string, result: LocalFrameworkDetection): void {
  result.runtime = 'python';
  result.deploymentType = 'container';

  // Detect package manager
  if (fileExists(directory, 'poetry.lock')) {
    result.packageManager = 'poetry';
    result.buildCommand = 'poetry install';
  } else {
    result.packageManager = 'pip';
    result.buildCommand = 'pip install -r requirements.txt';
  }

  // Check pyproject.toml for Python version
  const pyprojectPath = path.join(directory, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const pythonVersionMatch = content.match(/python\s*=\s*["']([^"']+)["']/);
      if (pythonVersionMatch) {
        result.pythonVersion = pythonVersionMatch[1];
      }
    } catch {
      // Continue without Python version
    }
  }

  // Detect framework from requirements.txt
  const requirementsPath = path.join(directory, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    try {
      const requirements = fs.readFileSync(requirementsPath, 'utf-8').toLowerCase();

      if (requirements.includes('fastapi')) {
        result.framework = 'fastapi';
        result.startCommand = detectFastApiStartCommand(directory);
      } else if (requirements.includes('flask')) {
        result.framework = 'flask';
        result.startCommand = detectFlaskStartCommand(directory);
      } else if (requirements.includes('django')) {
        result.startCommand = 'python manage.py runserver 0.0.0.0:8080';
      }
    } catch {
      // Continue without framework detection
    }
  }
}

function detectFastApiStartCommand(directory: string): string {
  // Look for common entry point files
  const entryPoints = ['main.py', 'app.py', 'api.py', 'server.py'];
  for (const entry of entryPoints) {
    if (fileExists(directory, entry)) {
      const moduleName = entry.replace('.py', '');
      return `uvicorn ${moduleName}:app --host 0.0.0.0 --port 8080`;
    }
  }
  return 'uvicorn main:app --host 0.0.0.0 --port 8080';
}

function detectFlaskStartCommand(directory: string): string {
  // Look for common entry point files
  const entryPoints = ['app.py', 'main.py', 'server.py', 'wsgi.py'];
  for (const entry of entryPoints) {
    if (fileExists(directory, entry)) {
      return `gunicorn --bind 0.0.0.0:8080 ${entry.replace('.py', '')}:app`;
    }
  }
  return 'gunicorn --bind 0.0.0.0:8080 app:app';
}
