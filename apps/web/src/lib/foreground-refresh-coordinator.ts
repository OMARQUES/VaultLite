export type ForegroundRefreshDomain =
  | 'session'
  | 'icons_manual'
  | 'icons_state'
  | 'attachments_state';

interface ForegroundRefreshOptions {
  force?: boolean;
  cooldownMs?: number;
}

class ForegroundRefreshCoordinator {
  private readonly inFlightByDomain = new Map<ForegroundRefreshDomain, Promise<void>>();

  private readonly lastRunAtByDomain = new Map<ForegroundRefreshDomain, number>();

  run(
    domain: ForegroundRefreshDomain,
    task: () => Promise<void>,
    options: ForegroundRefreshOptions = {},
  ): Promise<void> {
    const inFlight = this.inFlightByDomain.get(domain);
    if (inFlight) {
      return inFlight;
    }

    const cooldownMs = Number.isFinite(options.cooldownMs)
      ? Math.max(0, Math.trunc(options.cooldownMs as number))
      : 0;
    const now = Date.now();
    const lastRunAt = this.lastRunAtByDomain.get(domain) ?? 0;
    if (!options.force && cooldownMs > 0 && now - lastRunAt < cooldownMs) {
      return Promise.resolve();
    }

    const runPromise = task()
      .then(() => {
        this.lastRunAtByDomain.set(domain, Date.now());
      })
      .finally(() => {
        this.inFlightByDomain.delete(domain);
      });
    this.inFlightByDomain.set(domain, runPromise);
    return runPromise;
  }
}

export const foregroundRefreshCoordinator = new ForegroundRefreshCoordinator();

export function withIntervalJitter(baseMs: number, ratio = 0.2): number {
  const normalizedBaseMs = Math.max(1_000, Math.trunc(baseMs));
  const normalizedRatio = Math.max(0, Math.min(0.5, ratio));
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * normalizedRatio;
  return Math.max(1_000, Math.round(normalizedBaseMs * jitterMultiplier));
}
