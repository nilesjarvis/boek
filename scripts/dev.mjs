import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const preferredPort = Number(process.env.VITE_DEV_PORT || 5173);
const host = process.env.VITE_DEV_HOST || '127.0.0.1';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);
const viteCommand = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);
const runtimeTempDir = process.env.TMPDIR || path.resolve('.tmp-runtime');

fs.mkdirSync(runtimeTempDir, { recursive: true });

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available dev server port found from ${startPort} to ${startPort + 49}`);
}

function waitForPort(port) {
  const deadline = Date.now() + 15_000;

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.createConnection({ host, port });

      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for Vite on ${host}:${port}`));
          return;
        }
        setTimeout(check, 150);
      });
    };

    check();
  });
}

function splitExtraArgs(value) {
  if (!value) return [];
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, '')) ?? [];
}

function spawnProcess(command, args, env) {
  return spawn(command, args, {
    env,
    stdio: 'inherit',
    shell: false,
  });
}

function stopProcess(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
}

async function main() {
  const port = await findAvailablePort(preferredPort);
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    TEMP: runtimeTempDir,
    TMP: runtimeTempDir,
    TMPDIR: runtimeTempDir,
    VITE_DEV_PORT: String(port),
  };

  console.log(`[dev] Using renderer URL http://${host}:${port}`);
  console.log(`[dev] Using temp directory ${runtimeTempDir}`);

  const renderer = spawnProcess(viteCommand, [
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort',
  ], env);

  let electron;
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopProcess(renderer);
    if (electron) stopProcess(electron);
    process.exitCode = code;
  };

  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));

  renderer.once('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });

  const mainBuild = spawnProcess(npmCommand, ['run', 'build:main'], env);
  const buildCode = await new Promise((resolve) => {
    mainBuild.once('exit', (code) => resolve(code ?? 1));
  });

  if (buildCode !== 0) {
    shutdown(buildCode);
    return;
  }

  await waitForPort(port);

  electron = spawnProcess(electronCommand, ['.', ...splitExtraArgs(process.env.ELECTRON_EXTRA_ARGS)], env);
  electron.once('exit', (code) => {
    shutdown(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev] Failed to start:', err);
  process.exit(1);
});
