import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';

function printHelp() {
  process.stdout.write(`Usage: npm run dev:local\n\nStarts the local API and web dev servers in a single terminal.\n`);
}

function createRunner(command, args, name) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

function createNpmRunner(args, name) {
  if (process.platform === 'win32') {
    return createRunner('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], name);
  }

  return createRunner('npm', args, name);
}

async function stopRunner(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', `${child.pid}`, '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(killer, 'exit');
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3_000)).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }),
  ]);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const api = createNpmRunner(['run', 'dev:api'], 'api');
  const web = createNpmRunner(['run', 'dev:web'], 'web');
  const runners = [api, web];
  let shuttingDown = false;

  async function shutdown(exitCode = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await Promise.allSettled(runners.map((runner) => stopRunner(runner)));
    process.exit(exitCode);
  }

  process.on('SIGINT', () => {
    void shutdown(130);
  });

  process.on('SIGTERM', () => {
    void shutdown(143);
  });

  const exits = runners.map(async (runner, index) => {
    const [code, signal] = await once(runner, 'exit');
    return {
      name: index === 0 ? 'api' : 'web',
      code: typeof code === 'number' ? code : 1,
      signal,
    };
  });

  const firstExit = await Promise.race(exits);
  if (!shuttingDown) {
    const signalText = firstExit.signal ? ` (signal: ${String(firstExit.signal)})` : '';
    process.stderr.write(
      `[dev-local] ${firstExit.name} exited with code ${firstExit.code}${signalText}. Stopping remaining processes.\n`,
    );
    await shutdown(firstExit.code);
  }
}

await main();
