import Path from 'node:path';
import { spawn } from 'node:child_process';
import type { 
  SpawnCallRequestType, 
  NodeRequestType, 
  NPMInstallRequestType, 
  NpxRequestType 
} from './types.mjs';

export function spawnCall(options: SpawnCallRequestType) {
  const { cwd, env, command, args, stdout, stderr, onExit, onError } = options;
  const child = spawn(command, args, { cwd: cwd, env: env });

  child.stdout.on('data', stdout);
  child.stderr.on('data', stderr);

  child.on('error', (err) => {
    if (onError) {
      onError(err);
    } else {
      console.error(err);
    }
  });

  child.on('exit', (code, signal) => {
    onExit(code, signal);
  });

  return child;
}

export function node(options: NodeRequestType) {
  const { cwd, env, entry, stdout, stderr, onExit } = options;

  return spawnCall({
    command: 'node',
    cwd,
    args: [entry],
    stdout,
    stderr,
    onExit,
    env: { ...process.env, ...env },
  });
}

export function tsx(options: NodeRequestType) {
  const { cwd, env, entry, stdout, stderr, onExit } = options;

  return spawnCall({
    command: Path.join(cwd, 'node_modules', '.bin', 'tsx'),
    cwd,
    args: [entry],
    stdout,
    stderr,
    onExit,
    env: { ...process.env, ...env },
  });
}

export function npmInstall(options: NPMInstallRequestType) {
  const { cwd, stdout, stderr, onExit } = options;
  const args = options.packages
    ? ['install', '--include=dev', ...(options.args || []), ...options.packages]
    : ['install', '--include=dev', ...(options.args || [])];

  return spawnCall({
    command: 'npm',
    cwd,
    args,
    stdout,
    stderr,
    onExit,
    env: process.env,
  });
}

export function vite(options: NpxRequestType) {
  return spawnCall({
    ...options,
    command: Path.join(options.cwd, 'node_modules', '.bin', 'vite'),
    env: process.env,
  });
}