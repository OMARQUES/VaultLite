import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs() {
  const [, , inputPath] = process.argv;
  if (!inputPath || inputPath.trim().length === 0) {
    process.stderr.write('Usage: node infrastructure/scripts/analyze-dev-local-log.mjs <log-file-path>\n');
    process.exit(1);
  }
  return {
    logPath: resolve(process.cwd(), inputPath),
  };
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function toMinuteBucket(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}Z`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function main() {
  const { logPath } = parseArgs();
  const content = readFileSync(logPath, 'utf8');
  const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);

  const requestRegex =
    /^(?:\[(?<timestamp>[^\]]+)\]\s+)?\[api\]\s+\[wrangler:info\]\s+(?<method>GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(?<path>\S+)\s+(?<status>\d{3})\s+[^(]+(?:\((?<latency>\d+)ms\))?/u;
  const queueRegex =
    /^(?:\[(?<timestamp>[^\]]+)\]\s+)?\[api\]\s+\[wrangler:info\]\s+QUEUE\s+(?<queue>\S+)\s+\d+\/\d+\s+\((?<latency>\d+)ms\)/u;

  const requestStats = new Map();
  const queueStats = new Map();
  const perMinuteCalls = new Map();

  let parsedRequests = 0;
  let parsedQueueBatches = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;

  for (const line of lines) {
    const queueMatch = line.match(queueRegex);
    if (queueMatch?.groups) {
      const timestamp = queueMatch.groups.timestamp ? new Date(queueMatch.groups.timestamp) : null;
      if (timestamp && !Number.isNaN(timestamp.valueOf())) {
        if (!firstTimestamp || timestamp < firstTimestamp) {
          firstTimestamp = timestamp;
        }
        if (!lastTimestamp || timestamp > lastTimestamp) {
          lastTimestamp = timestamp;
        }
      }
      const queueName = queueMatch.groups.queue;
      const latencyMs = Number.parseInt(queueMatch.groups.latency, 10);
      const current = queueStats.get(queueName) ?? { count: 0, latencies: [] };
      current.count += 1;
      if (Number.isFinite(latencyMs)) {
        current.latencies.push(latencyMs);
      }
      queueStats.set(queueName, current);
      parsedQueueBatches += 1;
      continue;
    }

    const match = line.match(requestRegex);
    if (!match?.groups) {
      continue;
    }

    const timestamp = match.groups.timestamp ? new Date(match.groups.timestamp) : null;
    if (timestamp && !Number.isNaN(timestamp.valueOf())) {
      if (!firstTimestamp || timestamp < firstTimestamp) {
        firstTimestamp = timestamp;
      }
      if (!lastTimestamp || timestamp > lastTimestamp) {
        lastTimestamp = timestamp;
      }
      const bucket = toMinuteBucket(timestamp);
      perMinuteCalls.set(bucket, (perMinuteCalls.get(bucket) ?? 0) + 1);
    }

    const method = match.groups.method;
    const path = match.groups.path;
    const status = Number.parseInt(match.groups.status, 10);
    const latencyMs = Number.parseInt(match.groups.latency ?? '', 10);
    const key = `${method} ${path}`;
    const current = requestStats.get(key) ?? {
      method,
      path,
      count: 0,
      errors: 0,
      statuses: new Map(),
      latencies: [],
    };
    current.count += 1;
    if (status >= 400) {
      current.errors += 1;
    }
    current.statuses.set(status, (current.statuses.get(status) ?? 0) + 1);
    if (Number.isFinite(latencyMs)) {
      current.latencies.push(latencyMs);
    }
    requestStats.set(key, current);
    parsedRequests += 1;
  }

  const durationMinutes =
    firstTimestamp && lastTimestamp
      ? Math.max(1 / 60, (lastTimestamp.valueOf() - firstTimestamp.valueOf()) / 60_000)
      : null;
  const totalCalls = Array.from(requestStats.values()).reduce((acc, entry) => acc + entry.count, 0);
  const callsPerMinute = durationMinutes ? totalCalls / durationMinutes : null;

  process.stdout.write(`Log file: ${logPath}\n`);
  process.stdout.write(`Parsed request lines: ${parsedRequests}\n`);
  process.stdout.write(`Parsed queue lines: ${parsedQueueBatches}\n`);
  if (firstTimestamp && lastTimestamp) {
    process.stdout.write(
      `Time window (UTC): ${firstTimestamp.toISOString()} -> ${lastTimestamp.toISOString()} (${formatNumber(
        durationMinutes ?? 0,
      )} min)\n`,
    );
  }
  if (callsPerMinute !== null) {
    process.stdout.write(`Average request rate: ${formatNumber(callsPerMinute)} req/min\n`);
  }

  process.stdout.write('\nTop endpoints by volume:\n');
  const sortedEndpoints = Array.from(requestStats.values()).sort((left, right) => right.count - left.count);
  for (const entry of sortedEndpoints.slice(0, 25)) {
    const p95 = percentile(entry.latencies, 95);
    process.stdout.write(
      `- ${entry.method} ${entry.path}: count=${entry.count}, errors=${entry.errors}, p95=${p95 ?? 'n/a'}ms\n`,
    );
  }

  if (queueStats.size > 0) {
    process.stdout.write('\nQueue batches:\n');
    const sortedQueues = Array.from(queueStats.entries()).sort(
      (left, right) => right[1].count - left[1].count,
    );
    for (const [queueName, entry] of sortedQueues) {
      const p95 = percentile(entry.latencies, 95);
      process.stdout.write(
        `- ${queueName}: batches=${entry.count}, p95=${p95 ?? 'n/a'}ms\n`,
      );
    }
  }

  if (perMinuteCalls.size > 0) {
    process.stdout.write('\nBusiest minutes (UTC):\n');
    const topMinutes = Array.from(perMinuteCalls.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10);
    for (const [minute, count] of topMinutes) {
      process.stdout.write(`- ${minute}: ${count} calls\n`);
    }
  }
}

main();
