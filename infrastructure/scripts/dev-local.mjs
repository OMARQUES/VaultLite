import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function printHelp() {
  process.stdout.write(
    `Usage: npm run dev:local\n\nStarts the local API and web dev servers in a single terminal.\nWrites combined output to logs/dev-local-*.log by default.\n`,
  );
}

function formatLogTimestamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function formatLogLinePrefix(date = new Date()) {
  return `[${date.toISOString()}]`;
}

function writeTimestampedLogLine(logStream, line) {
  logStream.write(`${formatLogLinePrefix()} ${line}\n`);
}

function createTimestampedChunkLogger(logStream) {
  const pendingBySource = new Map();
  return {
    write(source, chunk) {
      const previous = pendingBySource.get(source) ?? '';
      const merged = `${previous}${String(chunk)}`;
      const segments = merged.split('\n');
      const pendingTail = segments.pop() ?? '';
      pendingBySource.set(source, pendingTail);
      for (const segment of segments) {
        const normalized = segment.endsWith('\r') ? segment.slice(0, -1) : segment;
        writeTimestampedLogLine(logStream, normalized);
      }
    },
    flushAll() {
      for (const [source, pending] of pendingBySource.entries()) {
        if (pending.length > 0) {
          const normalized = pending.endsWith('\r') ? pending.slice(0, -1) : pending;
          writeTimestampedLogLine(logStream, normalized);
        }
        pendingBySource.set(source, '');
      }
    },
  };
}

function resolveLogFilePath() {
  const explicit = process.env.VAULTLITE_DEV_LOCAL_LOG_FILE;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const timestamp = formatLogTimestamp();
  return join(process.cwd(), 'logs', `dev-local-${timestamp}.log`);
}

function createRunner(command, args, name, logStream, chunkLogger) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => {
    const output = `[${name}] ${chunk}`;
    process.stdout.write(output);
    if (logStream && chunkLogger) {
      chunkLogger.write(`${name}:stdout`, output);
    }
  });

  child.stderr.on('data', (chunk) => {
    const output = `[${name}] ${chunk}`;
    process.stderr.write(output);
    if (logStream && chunkLogger) {
      chunkLogger.write(`${name}:stderr`, output);
    }
  });

  return child;
}

function createNpmRunner(args, name, logStream, chunkLogger) {
  if (process.platform === 'win32') {
    return createRunner('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], name, logStream, chunkLogger);
  }

  return createRunner('npm', args, name, logStream, chunkLogger);
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

  const logFilePath = resolveLogFilePath();
  mkdirSync(join(process.cwd(), 'logs'), { recursive: true });
  const logStream = createWriteStream(logFilePath, { flags: 'a' });
  const chunkLogger = createTimestampedChunkLogger(logStream);
  process.stdout.write(`[dev-local] Writing logs to ${logFilePath}\n`);
  writeTimestampedLogLine(logStream, `[dev-local] started_at=${new Date().toISOString()}`);

  const api = createNpmRunner(['run', 'dev:api'], 'api', logStream, chunkLogger);
  const web = createNpmRunner(['run', 'dev:web'], 'web', logStream, chunkLogger);
  const runners = [api, web];
  let shuttingDown = false;

  async function shutdown(exitCode = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await Promise.allSettled(runners.map((runner) => stopRunner(runner)));
    chunkLogger.flushAll();
    writeTimestampedLogLine(logStream, `[dev-local] stopped_at=${new Date().toISOString()} exit_code=${exitCode}`);
    await new Promise((resolve) => logStream.end(resolve));
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
    const output = `[dev-local] ${firstExit.name} exited with code ${firstExit.code}${signalText}. Stopping remaining processes.\n`;
    process.stderr.write(output);
    chunkLogger.write('dev-local:stderr', output);
    await shutdown(firstExit.code);
  }
}

await main();
