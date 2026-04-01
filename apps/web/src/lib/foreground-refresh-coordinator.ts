export type ForegroundRefreshDomain =
  | 'session'
  | 'icons_manual'
  | 'icons_state'
  | 'attachments_state'
  | `vault_history:${string}`;

interface ForegroundRefreshOptions {
  force?: boolean;
  cooldownMs?: number;
}

interface ForegroundRefreshDomainState {
  inFlight: Promise<void> | null;
  pendingTask: (() => Promise<void>) | null;
  pendingBypassCooldown: boolean;
}

export class ForegroundRefreshCoordinator {
  private readonly stateByDomain = new Map<ForegroundRefreshDomain, ForegroundRefreshDomainState>();

  private readonly lastRunAtByDomain = new Map<ForegroundRefreshDomain, number>();

  private stateFor(domain: ForegroundRefreshDomain): ForegroundRefreshDomainState {
    const existing = this.stateByDomain.get(domain);
    if (existing) {
      return existing;
    }
    const created: ForegroundRefreshDomainState = {
      inFlight: null,
      pendingTask: null,
      pendingBypassCooldown: false,
    };
    this.stateByDomain.set(domain, created);
    return created;
  }

  run(
    domain: ForegroundRefreshDomain,
    task: () => Promise<void>,
    options: ForegroundRefreshOptions = {},
  ): Promise<void> {
    const state = this.stateFor(domain);

    const cooldownMs = Number.isFinite(options.cooldownMs)
      ? Math.max(0, Math.trunc(options.cooldownMs as number))
      : 0;

    if (state.inFlight) {
      state.pendingTask = task;
      state.pendingBypassCooldown = true;
      return state.inFlight;
    }

    const runPromise = (async () => {
      let nextTask: (() => Promise<void>) | null = task;
      let bypassCooldown = options.force === true;

      while (nextTask) {
        const now = Date.now();
        const lastRunAt = this.lastRunAtByDomain.get(domain) ?? 0;
        if (!bypassCooldown && cooldownMs > 0 && now - lastRunAt < cooldownMs) {
          return;
        }

        await nextTask();
        this.lastRunAtByDomain.set(domain, Date.now());

        if (!state.pendingTask) {
          return;
        }

        nextTask = state.pendingTask;
        bypassCooldown = state.pendingBypassCooldown;
        state.pendingTask = null;
        state.pendingBypassCooldown = false;
      }
    })()
      .finally(() => {
        state.inFlight = null;
        state.pendingTask = null;
        state.pendingBypassCooldown = false;
      });

    state.inFlight = runPromise;
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
