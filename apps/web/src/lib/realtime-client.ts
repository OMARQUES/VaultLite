import type { RealtimeServerMessage } from '@vaultlite/contracts';
import type { VaultLiteAuthClient } from './auth-client';
import type { SessionStore } from './session-store';

const ACK_BATCH_SIZE = 20;
const ACK_MAX_INTERVAL_MS = 1_000;
const INITIAL_CONNECT_JITTER_MAX_MS = 750;
const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 15_000;
const RECONNECT_RESET_STABLE_MS = 60_000;
const HEARTBEAT_IDLE_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const HIDDEN_CLOSE_AFTER_MS = 5 * 60_000;

type RealtimeDomains = Array<'vault' | 'icons_manual' | 'icons_state' | 'password_history' | 'attachments'>;

export interface WebRealtimeClient {
  start(): void;
  stop(): void;
  setVisibilityState(state: DocumentVisibilityState): void;
}

export function createWebRealtimeClient(input: {
  authClient: VaultLiteAuthClient;
  sessionStore: SessionStore;
  onVaultDelta: () => void;
  onDomainResync: (domains: RealtimeDomains) => void;
  onHealthChange: (healthy: boolean) => void;
}): WebRealtimeClient {
  let socket: WebSocket | null = null;
  let stopped = true;
  let intentionallyClosed = false;
  let reconnectAttempt = 0;
  let lastConnectedAt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  let hiddenCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastReceivedAt = 0;
  let cursor = 0;
  let pendingAckSeq = 0;
  let ackBatchCount = 0;
  let ackTimer: ReturnType<typeof setTimeout> | null = null;
  let healthy = false;

  function clearReconnectTimer() {
    if (!reconnectTimer) {
      return;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
  }

  function clearAckTimer() {
    if (!ackTimer) {
      return;
    }
    clearTimeout(ackTimer);
    ackTimer = null;
  }

  function clearHiddenCloseTimer() {
    if (!hiddenCloseTimer) {
      return;
    }
    clearTimeout(hiddenCloseTimer);
    hiddenCloseTimer = null;
  }

  function setHealthy(nextValue: boolean) {
    if (healthy === nextValue) {
      return;
    }
    healthy = nextValue;
    input.onHealthChange(nextValue);
  }

  function isReadyForRealtime(): boolean {
    return input.sessionStore.state.phase === 'ready';
  }

  function scheduleReconnect(initial = false) {
    if (stopped) {
      return;
    }
    if (!isReadyForRealtime()) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    clearReconnectTimer();
    const delay = initial
      ? Math.round(Math.random() * INITIAL_CONNECT_JITTER_MAX_MS)
      : Math.round(
          Math.random()
            * Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS),
        );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  function flushAck() {
    if (!socket || socket.readyState !== WebSocket.OPEN || pendingAckSeq <= 0) {
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: 'ack',
          seq: pendingAckSeq,
        }),
      );
      ackBatchCount = 0;
      clearAckTimer();
    } catch {
      // best effort
    }
  }

  function scheduleAck() {
    if (ackBatchCount >= ACK_BATCH_SIZE) {
      flushAck();
      return;
    }
    if (ackTimer) {
      return;
    }
    ackTimer = setTimeout(() => {
      ackTimer = null;
      flushAck();
    }, ACK_MAX_INTERVAL_MS);
  }

  async function handleCloseCode(code: number) {
    if (code === 4405) {
      try {
        await input.sessionStore.restoreSession();
      } catch {
        // keep existing phase behavior
      }
      if (isReadyForRealtime()) {
        reconnectAttempt = 0;
        scheduleReconnect(true);
      }
      return;
    }
    if (code === 4401 || code === 4402 || code === 4403 || code === 4404 || code === 4406) {
      try {
        await input.sessionStore.restoreSession();
      } catch {
        // no-op
      }
      return;
    }
    reconnectAttempt += 1;
    scheduleReconnect(false);
  }

  function startHeartbeat() {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (Date.now() - lastReceivedAt < HEARTBEAT_IDLE_MS) {
        return;
      }
      try {
        socket.send(
          JSON.stringify({
            type: 'ping',
            ts: Date.now(),
          }),
        );
      } catch {
        return;
      }
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
      }
      heartbeatTimeout = setTimeout(() => {
        heartbeatTimeout = null;
        if (socket && socket.readyState === WebSocket.OPEN) {
          intentionallyClosed = false;
          socket.close(1011, 'heartbeat_timeout');
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }, 5_000);
  }

  function handleRealtimeEvent(message: Extract<RealtimeServerMessage, { type: 'event' }>) {
    cursor = Math.max(cursor, message.event.seq);
    pendingAckSeq = Math.max(pendingAckSeq, message.event.seq);
    ackBatchCount += 1;
    scheduleAck();
    const localDeviceId = input.sessionStore.state.deviceId ?? null;
    if (
      typeof message.event.sourceDeviceId === 'string' &&
      message.event.sourceDeviceId.length > 0 &&
      typeof localDeviceId === 'string' &&
      localDeviceId.length > 0 &&
      message.event.sourceDeviceId === localDeviceId
    ) {
      return;
    }
    if (message.event.topic.startsWith('vault.item.')) {
      input.onVaultDelta();
      return;
    }
    if (
      message.event.topic.startsWith('icons.') ||
      message.event.topic.startsWith('password_history.') ||
      message.event.topic.startsWith('vault.attachment.')
    ) {
      input.onDomainResync(['icons_manual', 'icons_state', 'password_history', 'attachments']);
    }
  }

  function closeSocket(reasonCode = 1000, reason = 'client_stop', markIntentional = true) {
    if (!socket) {
      return;
    }
    intentionallyClosed = markIntentional;
    try {
      socket.close(reasonCode, reason);
    } catch {
      // no-op
    } finally {
      socket = null;
    }
  }

  async function connect() {
    if (stopped || socket || !isReadyForRealtime()) {
      return;
    }
    try {
      const token = await input.authClient.getRealtimeConnectToken({ cursor });
      const wsUrl = new URL(token.wsUrl);
      wsUrl.searchParams.set('token', token.connectToken);
      wsUrl.searchParams.set('cursor', String(cursor));
      const candidate = new WebSocket(wsUrl.toString());
      socket = candidate;
      candidate.onopen = () => {
        lastConnectedAt = Date.now();
        lastReceivedAt = Date.now();
        reconnectAttempt = 0;
        setHealthy(true);
        startHeartbeat();
        clearHiddenCloseTimer();
      };
      candidate.onmessage = (event) => {
        lastReceivedAt = Date.now();
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data ?? '{}'));
        } catch {
          return;
        }
        const message = parsed as RealtimeServerMessage;
        if (!message || typeof message !== 'object' || typeof (message as { type?: string }).type !== 'string') {
          return;
        }
        if (message.type === 'hello') {
          cursor = Math.max(cursor, message.cursor);
          return;
        }
        if (message.type === 'event') {
          handleRealtimeEvent(message);
          return;
        }
        if (message.type === 'resync_required') {
          input.onDomainResync(message.domains);
          return;
        }
        if (message.type === 'invalidated') {
          const codeMap: Record<string, number> = {
            session_revoked: 4401,
            lifecycle_not_active: 4402,
            trusted_state_invalid: 4403,
            lock_revision_advanced: 4404,
            auth_lease_expired_revalidate: 4405,
            deployment_fingerprint_mismatch: 4406,
          };
          const mappedCode = codeMap[message.code] ?? 1000;
          closeSocket(mappedCode, message.code, false);
        }
      };
      candidate.onclose = (event) => {
        const closedSocket = socket;
        socket = null;
        clearHeartbeat();
        clearAckTimer();
        setHealthy(false);
        if (closedSocket !== candidate) {
          return;
        }
        if (stopped || intentionallyClosed) {
          intentionallyClosed = false;
          return;
        }
        if (Date.now() - lastConnectedAt >= RECONNECT_RESET_STABLE_MS) {
          reconnectAttempt = 0;
        }
        void handleCloseCode(event.code);
      };
      candidate.onerror = () => {
        setHealthy(false);
      };
    } catch {
      socket = null;
      setHealthy(false);
      reconnectAttempt += 1;
      scheduleReconnect(false);
    }
  }

  function start() {
    stopped = false;
    scheduleReconnect(true);
  }

  function stop() {
    stopped = true;
    clearReconnectTimer();
    clearHiddenCloseTimer();
    clearHeartbeat();
    clearAckTimer();
    setHealthy(false);
    closeSocket(1000, 'client_stop');
  }

  function setVisibilityState(state: DocumentVisibilityState) {
    if (state === 'hidden') {
      clearHiddenCloseTimer();
      hiddenCloseTimer = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          closeSocket(1000, 'hidden_timeout');
        }
      }, HIDDEN_CLOSE_AFTER_MS);
      return;
    }
    clearHiddenCloseTimer();
    if (!socket && !stopped && isReadyForRealtime()) {
      scheduleReconnect(true);
    }
  }

  return {
    start,
    stop,
    setVisibilityState,
  };
}
