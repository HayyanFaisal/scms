import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const shell = isWindows;

function start(command, args, name) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell,
    env: process.env
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
}

const server = start('node', ['server/index.js'], 'server');
const client = start('npm', ['run', 'dev:client'], 'client');

function shutdown(signal) {
  server.kill(signal);
  client.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
