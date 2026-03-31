import { fromBase64Url, toBase64Url } from '@vaultlite/crypto/base64';
import {
  RealtimeClientMessageSchema,
  RealtimeEventEnvelopeSchema,
  RealtimeServerMessageSchema,
  RealtimeTopicSchema,
  type RealtimeTopic,
} from '@vaultlite/contracts';
import { createHmac, timingSafeEqual } from 'node:crypto';

const REALTIME_TOKEN_AUDIENCE = 'vaultlite.realtime.ws.v1';
const REALTIME_TOKEN_ISSUER_PREFIX = 'vaultlite-api:';
const DEFAULT_REPLAY_RETENTION_HOURS = 24;
const DEFAULT_REPLAY_MAX_EVENTS = 5_000;

export const REALTIME_CLOSE_CODES = {
  session_revoked: 4401,
  lifecycle_not_active: 4402,
  trusted_state_invalid: 4403,
  lock_revision_advanced: 4404,
  auth_lease_expired_revalidate: 4405,
  deployment_fingerprint_mismatch: 4406,
} as const;

type RealtimeInvalidationCode = keyof typeof REALTIME_CLOSE_CODES;

export interface RealtimeConnectTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  did: string;
  surface: 'web' | 'extension';
  deploymentFingerprint: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
}

export interface RealtimeConnectTokenInput {
  userId: string;
  sessionId: string;
  deviceId: string;
  surface: 'web' | 'extension';
  deploymentFingerprint: string;
  jti: string;
  issuedAtUnixSeconds: number;
  expiresAtUnixSeconds: number;
}

interface RealtimeSocketAttachment {
  userId: string;
  deviceId: string;
  surface: 'web' | 'extension';
  cursor: number;
  ackSeq: number;
  authLeaseExpiresAt: string;
  heartbeatIntervalMs: number;
  connectedAt: string;
  lastSeenAt: string;
}

interface RealtimePublishedEventInput {
  eventId: string;
  occurredAt: string;
  deploymentFingerprint: string;
  topic: RealtimeTopic;
  sourceDeviceId: string | null;
  payload: unknown;
}

interface RealtimeStoredEvent extends RealtimePublishedEventInput {
  seq: number;
}

function utf8ToBase64Url(value: string): string {
  return toBase64Url(new TextEncoder().encode(value));
}

function base64UrlToUtf8(value: string): string {
  return new TextDecoder().decode(fromBase64Url(value));
}

function signCompactJwt(headerB64: string, payloadB64: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest());
}

export function createRealtimeConnectToken(input: {
  claims: RealtimeConnectTokenInput;
  deploymentFingerprint: string;
  secret: string;
  kid?: string;
}): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: input.kid ?? 'v1',
  };
  const payload: RealtimeConnectTokenClaims = {
    iss: `${REALTIME_TOKEN_ISSUER_PREFIX}${input.deploymentFingerprint}`,
    aud: REALTIME_TOKEN_AUDIENCE,
    sub: input.claims.userId,
    sid: input.claims.sessionId,
    did: input.claims.deviceId,
    surface: input.claims.surface,
    deploymentFingerprint: input.claims.deploymentFingerprint,
    jti: input.claims.jti,
    iat: input.claims.issuedAtUnixSeconds,
    nbf: input.claims.issuedAtUnixSeconds,
    exp: input.claims.expiresAtUnixSeconds,
  };
  const headerB64 = utf8ToBase64Url(JSON.stringify(header));
  const payloadB64 = utf8ToBase64Url(JSON.stringify(payload));
  const signatureB64 = signCompactJwt(headerB64, payloadB64, input.secret);
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

export function verifyRealtimeConnectToken(input: {
  token: string;
  deploymentFingerprint: string;
  secret: string;
  nowUnixSeconds: number;
}): { ok: true; claims: RealtimeConnectTokenClaims } | { ok: false; reason: string } {
  const parts = input.token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' };
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const expectedSignature = signCompactJwt(headerB64, payloadB64, input.secret);
  try {
    if (!timingSafeEqual(fromBase64Url(signatureB64), fromBase64Url(expectedSignature))) {
      return { ok: false, reason: 'signature_invalid' };
    }
  } catch {
    return { ok: false, reason: 'signature_invalid' };
  }

  let claims: unknown;
  try {
    claims = JSON.parse(base64UrlToUtf8(payloadB64));
  } catch {
    return { ok: false, reason: 'payload_invalid' };
  }

  const parsed = claims as Partial<RealtimeConnectTokenClaims>;
  if (
    parsed.iss !== `${REALTIME_TOKEN_ISSUER_PREFIX}${input.deploymentFingerprint}` ||
    parsed.aud !== REALTIME_TOKEN_AUDIENCE ||
    parsed.deploymentFingerprint !== input.deploymentFingerprint ||
    typeof parsed.sub !== 'string' ||
    typeof parsed.sid !== 'string' ||
    typeof parsed.did !== 'string' ||
    (parsed.surface !== 'web' && parsed.surface !== 'extension') ||
    typeof parsed.jti !== 'string' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.nbf !== 'number' ||
    typeof parsed.exp !== 'number'
  ) {
    return { ok: false, reason: 'claims_invalid' };
  }
  if (input.nowUnixSeconds < parsed.nbf || input.nowUnixSeconds >= parsed.exp) {
    return { ok: false, reason: 'expired_or_not_yet_valid' };
  }
  return { ok: true, claims: parsed as RealtimeConnectTokenClaims };
}

export function redactRealtimeTokenInUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', '<redacted>');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseSocketAttachment(socket: WebSocket): RealtimeSocketAttachment | null {
  const candidate = (socket as unknown as { deserializeAttachment?: () => unknown }).deserializeAttachment?.();
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const parsed = candidate as Partial<RealtimeSocketAttachment>;
  if (
    typeof parsed.userId !== 'string' ||
    typeof parsed.deviceId !== 'string' ||
    (parsed.surface !== 'web' && parsed.surface !== 'extension') ||
    typeof parsed.cursor !== 'number' ||
    typeof parsed.ackSeq !== 'number' ||
    typeof parsed.authLeaseExpiresAt !== 'string' ||
    typeof parsed.heartbeatIntervalMs !== 'number' ||
    typeof parsed.connectedAt !== 'string' ||
    typeof parsed.lastSeenAt !== 'string'
  ) {
    return null;
  }
  return {
    userId: parsed.userId,
    deviceId: parsed.deviceId,
    surface: parsed.surface,
    cursor: Math.max(0, Math.trunc(parsed.cursor)),
    ackSeq: Math.max(0, Math.trunc(parsed.ackSeq)),
    authLeaseExpiresAt: parsed.authLeaseExpiresAt,
    heartbeatIntervalMs: Math.max(1_000, Math.trunc(parsed.heartbeatIntervalMs)),
    connectedAt: parsed.connectedAt,
    lastSeenAt: parsed.lastSeenAt,
  };
}

function persistSocketAttachment(socket: WebSocket, attachment: RealtimeSocketAttachment): void {
  (
    socket as unknown as {
      serializeAttachment?: (value: unknown) => void;
    }
  ).serializeAttachment?.(attachment);
}

export class VaultLiteRealtimeHub {
  private readonly state: any;
  private readonly maxEventsPerUser: number;
  private readonly maxAgeHours: number;
  private sqlStorage: { exec: (query: string, ...params: unknown[]) => unknown } | null;

  constructor(state: any, env: Record<string, unknown>) {
    this.state = state;
    const configuredMaxEvents = Number(env.VAULTLITE_REALTIME_REPLAY_MAX_EVENTS_PER_USER ?? DEFAULT_REPLAY_MAX_EVENTS);
    const configuredMaxAgeHours = Number(env.VAULTLITE_REALTIME_REPLAY_MAX_AGE_HOURS ?? DEFAULT_REPLAY_RETENTION_HOURS);
    this.maxEventsPerUser = Number.isFinite(configuredMaxEvents) ? Math.max(100, Math.trunc(configuredMaxEvents)) : DEFAULT_REPLAY_MAX_EVENTS;
    this.maxAgeHours = Number.isFinite(configuredMaxAgeHours) ? Math.max(1, Math.trunc(configuredMaxAgeHours)) : DEFAULT_REPLAY_RETENTION_HOURS;
    const maybeSql = this.state.storage?.sql;
    this.sqlStorage =
      maybeSql && typeof maybeSql.exec === 'function'
        ? (maybeSql as { exec: (query: string, ...params: unknown[]) => unknown })
        : null;
    if (this.sqlStorage) {
      try {
        this.ensureSqlSchema();
      } catch {
        this.sqlStorage = null;
      }
    }
    const setAutoResponse = this.state.setWebSocketAutoResponse;
    if (typeof setAutoResponse === 'function') {
      const pingRequest = JSON.stringify({ type: 'ping' });
      const pongResponse = JSON.stringify({ type: 'pong' });
      try {
        const PairConstructor = (globalThis as unknown as {
          WebSocketRequestResponsePair?: new (request: string, response: string) => unknown;
        }).WebSocketRequestResponsePair;
        if (typeof PairConstructor === 'function') {
          setAutoResponse.call(this.state, new PairConstructor(pingRequest, pongResponse));
        } else {
          // Backward compatibility for older runtimes that still expect (request, response).
          setAutoResponse.call(this.state, pingRequest, pongResponse);
        }
      } catch {
        // Keep Durable Object initialization resilient; heartbeat falls back to explicit ping.
      }
    }
  }

  private executeSql(query: string, ...params: unknown[]): Array<Record<string, unknown>> {
    if (!this.sqlStorage) {
      return [];
    }
    const result = this.sqlStorage.exec(query, ...params);
    if (!result) {
      return [];
    }
    if (Array.isArray(result)) {
      return result as Array<Record<string, unknown>>;
    }
    if (typeof result === 'object' && Symbol.iterator in result) {
      return Array.from(result as Iterable<Record<string, unknown>>);
    }
    return [];
  }

  private ensureSqlSchema(): void {
    this.executeSql(
      `CREATE TABLE IF NOT EXISTS realtime_meta (
         meta_key TEXT PRIMARY KEY,
         meta_value TEXT NOT NULL
       )`,
    );
    this.executeSql(
      `CREATE TABLE IF NOT EXISTS realtime_events (
         seq INTEGER PRIMARY KEY,
         event_id TEXT NOT NULL UNIQUE,
         occurred_at TEXT NOT NULL,
         deployment_fingerprint TEXT NOT NULL,
         topic TEXT NOT NULL,
         source_device_id TEXT,
         payload_json TEXT NOT NULL
       )`,
    );
    this.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_realtime_events_occurred_at
       ON realtime_events (occurred_at)`,
    );
    this.executeSql(
      `INSERT OR IGNORE INTO realtime_meta (meta_key, meta_value)
       VALUES ('seq', '0')`,
    );
  }

  private async loadSeq(): Promise<number> {
    if (this.sqlStorage) {
      const row = this.executeSql(
        `SELECT meta_value AS value
         FROM realtime_meta
         WHERE meta_key = 'seq'
         LIMIT 1`,
      )[0];
      const value = Number(row?.value);
      return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }
    const value = Number(await this.state.storage.get('realtime.seq'));
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }

  private async saveSeq(value: number): Promise<void> {
    if (this.sqlStorage) {
      this.executeSql(
        `INSERT INTO realtime_meta (meta_key, meta_value)
         VALUES ('seq', ?)
         ON CONFLICT(meta_key)
         DO UPDATE SET meta_value = excluded.meta_value`,
        String(Math.max(0, Math.trunc(value))),
      );
      return;
    }
    await this.state.storage.put('realtime.seq', Math.max(0, Math.trunc(value)));
  }

  private parseSqlEventRow(row: Record<string, unknown>): RealtimeStoredEvent | null {
    const payloadJson = typeof row.payload_json === 'string' ? row.payload_json : '';
    let payload: unknown;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return null;
    }
    const parsed = RealtimeEventEnvelopeSchema.safeParse({
      seq: Number(row.seq),
      eventId: row.event_id,
      occurredAt: row.occurred_at,
      deploymentFingerprint: row.deployment_fingerprint,
      topic: row.topic,
      sourceDeviceId: row.source_device_id ?? null,
      payload,
    });
    if (!parsed.success) {
      return null;
    }
    return parsed.data as RealtimeStoredEvent;
  }

  private async loadAllEvents(): Promise<RealtimeStoredEvent[]> {
    if (this.sqlStorage) {
      const rows = this.executeSql(
        `SELECT seq, event_id, occurred_at, deployment_fingerprint, topic, source_device_id, payload_json
         FROM realtime_events
         ORDER BY seq ASC`,
      );
      return rows
        .map((row) => this.parseSqlEventRow(row))
        .filter((event): event is RealtimeStoredEvent => event !== null);
    }
    const value = await this.state.storage.get('realtime.events');
    if (!Array.isArray(value)) {
      return [];
    }
    const events: RealtimeStoredEvent[] = [];
    for (const candidate of value) {
      const parsed = RealtimeEventEnvelopeSchema.safeParse(candidate);
      if (parsed.success) {
        events.push(parsed.data as RealtimeStoredEvent);
      }
    }
    return events.sort((left, right) => left.seq - right.seq);
  }

  private async saveEvents(events: RealtimeStoredEvent[]): Promise<void> {
    await this.state.storage.put('realtime.events', events);
  }

  private async pruneEvents(nowIso: string): Promise<void> {
    const minAcceptedIso = new Date(
      Date.parse(nowIso) - this.maxAgeHours * 60 * 60 * 1000,
    ).toISOString();
    if (this.sqlStorage) {
      this.executeSql(
        `DELETE FROM realtime_events
         WHERE occurred_at < ?`,
        minAcceptedIso,
      );
      const tail = this.executeSql(
        `SELECT seq
         FROM realtime_events
         ORDER BY seq DESC
         LIMIT ?`,
        this.maxEventsPerUser,
      );
      if (tail.length === this.maxEventsPerUser) {
        const minRetainedSeq = Number(tail[tail.length - 1]?.seq);
        if (Number.isFinite(minRetainedSeq)) {
          this.executeSql(
            `DELETE FROM realtime_events
             WHERE seq < ?`,
            Math.max(0, Math.trunc(minRetainedSeq)),
          );
        }
      }
      return;
    }
    const events = await this.loadAllEvents();
    const byAge = events.filter((event) => {
      const candidateMillis = Date.parse(event.occurredAt);
      if (!Number.isFinite(candidateMillis)) {
        return false;
      }
      return candidateMillis >= Date.parse(minAcceptedIso);
    });
    const pruned =
      byAge.length <= this.maxEventsPerUser
        ? byAge
        : byAge.slice(byAge.length - this.maxEventsPerUser);
    await this.saveEvents(pruned);
  }

  private async getOldestSeq(): Promise<number | null> {
    if (this.sqlStorage) {
      const row = this.executeSql(
        `SELECT seq
         FROM realtime_events
         ORDER BY seq ASC
         LIMIT 1`,
      )[0];
      const seq = Number(row?.seq);
      if (!Number.isFinite(seq)) {
        return null;
      }
      return Math.max(0, Math.trunc(seq));
    }
    const events = await this.loadAllEvents();
    if (events.length === 0) {
      return null;
    }
    return events[0]?.seq ?? null;
  }

  private async findEventById(eventId: string): Promise<RealtimeStoredEvent | null> {
    if (this.sqlStorage) {
      const row = this.executeSql(
        `SELECT seq, event_id, occurred_at, deployment_fingerprint, topic, source_device_id, payload_json
         FROM realtime_events
         WHERE event_id = ?
         LIMIT 1`,
        eventId,
      )[0];
      if (!row) {
        return null;
      }
      return this.parseSqlEventRow(row);
    }
    const events = await this.loadAllEvents();
    return events.find((event) => event.eventId === eventId) ?? null;
  }

  private async appendEvent(event: RealtimeStoredEvent): Promise<void> {
    if (this.sqlStorage) {
      this.executeSql(
        `INSERT INTO realtime_events (
           seq, event_id, occurred_at, deployment_fingerprint, topic, source_device_id, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        event.seq,
        event.eventId,
        event.occurredAt,
        event.deploymentFingerprint,
        event.topic,
        event.sourceDeviceId,
        JSON.stringify(event.payload),
      );
      return;
    }
    const events = await this.loadAllEvents();
    events.push(event);
    await this.saveEvents(events.sort((left, right) => left.seq - right.seq));
  }

  private async loadEventsAfterCursor(cursor: number): Promise<RealtimeStoredEvent[]> {
    if (this.sqlStorage) {
      const rows = this.executeSql(
        `SELECT seq, event_id, occurred_at, deployment_fingerprint, topic, source_device_id, payload_json
         FROM realtime_events
         WHERE seq > ?
         ORDER BY seq ASC`,
        cursor,
      );
      return rows
        .map((row) => this.parseSqlEventRow(row))
        .filter((event): event is RealtimeStoredEvent => event !== null);
    }
    const events = await this.loadAllEvents();
    return events.filter((event) => event.seq > cursor);
  }

  private send(socket: WebSocket, payload: unknown): void {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // best effort
    }
  }

  private async replayFromCursor(socket: WebSocket, cursor: number): Promise<void> {
    const oldestSeq = await this.getOldestSeq();
    if (typeof oldestSeq === 'number' && cursor < oldestSeq - 1) {
      this.send(
        socket,
        RealtimeServerMessageSchema.parse({
          type: 'resync_required',
          domains: [
            'vault',
            'vault_history',
            'icons_manual',
            'icons_state',
            'password_history',
            'attachments',
            'folders',
          ],
          reason: 'cursor_out_of_retention',
        }),
      );
      return;
    }
    const events = await this.loadEventsAfterCursor(cursor);
    for (const event of events) {
      this.send(
        socket,
        RealtimeServerMessageSchema.parse({
          type: 'event',
          event,
        }),
      );
    }
  }

  private async sendHello(socket: WebSocket): Promise<void> {
    const seq = await this.loadSeq();
    const attachment = parseSocketAttachment(socket);
    if (!attachment) {
      return;
    }
    this.send(
      socket,
      RealtimeServerMessageSchema.parse({
        type: 'hello',
        cursor: seq,
        authLeaseExpiresAt: attachment.authLeaseExpiresAt,
        heartbeatIntervalMs: attachment.heartbeatIntervalMs,
      }),
    );
  }

  private listSockets(): WebSocket[] {
    const sockets = this.state.getWebSockets?.();
    return Array.isArray(sockets) ? sockets : [];
  }

  private async closeAllWithInvalidation(code: RealtimeInvalidationCode, message: string): Promise<void> {
    for (const socket of this.listSockets()) {
      this.send(
        socket,
        RealtimeServerMessageSchema.parse({
          type: 'invalidated',
          code,
          message,
        }),
      );
      try {
        socket.close(REALTIME_CLOSE_CODES[code], message);
      } catch {
        // no-op
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/publish' && request.method === 'POST') {
      const input = (await request.json()) as RealtimePublishedEventInput;
      if (!RealtimeTopicSchema.safeParse(input.topic).success) {
        return new Response(JSON.stringify({ ok: false, code: 'invalid_topic' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      const existing = await this.findEventById(input.eventId);
      if (existing) {
        return new Response(JSON.stringify({ ok: true, seq: existing.seq, duplicate: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const currentSeq = await this.loadSeq();
      const nextSeq = currentSeq + 1;
      const event = RealtimeEventEnvelopeSchema.parse({
        seq: nextSeq,
        eventId: input.eventId,
        occurredAt: input.occurredAt,
        deploymentFingerprint: input.deploymentFingerprint,
        topic: input.topic,
        sourceDeviceId: input.sourceDeviceId,
        payload: input.payload,
      }) as RealtimeStoredEvent;
      const nowIso = new Date().toISOString();
      await this.appendEvent(event);
      await this.saveSeq(nextSeq);
      await this.pruneEvents(nowIso);
      for (const socket of this.listSockets()) {
        this.send(
          socket,
          RealtimeServerMessageSchema.parse({
            type: 'event',
            event,
          }),
        );
      }
      return new Response(JSON.stringify({ ok: true, seq: nextSeq }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/invalidate' && request.method === 'POST') {
      const input = (await request.json()) as {
        code?: RealtimeInvalidationCode;
        message?: string;
      };
      if (!input.code || !(input.code in REALTIME_CLOSE_CODES)) {
        return new Response(JSON.stringify({ ok: false, code: 'invalid_invalidation_code' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      await this.closeAllWithInvalidation(input.code, input.message ?? input.code);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    const nowIso = new Date().toISOString();
    const cursor = Math.max(0, Math.trunc(Number(request.headers.get('x-vl-cursor') ?? '0')));
    const heartbeatIntervalMs = Math.max(
      1_000,
      Math.trunc(Number(request.headers.get('x-vl-heartbeat-interval-ms') ?? '25000')),
    );
    const authLeaseExpiresAt = request.headers.get('x-vl-auth-lease-expires-at') ?? nowIso;
    const deviceId = request.headers.get('x-vl-device-id') ?? '';
    const userId = request.headers.get('x-vl-user-id') ?? '';
    const surface = request.headers.get('x-vl-surface') === 'extension' ? 'extension' : 'web';
    if (!userId || !deviceId) {
      return new Response('Missing realtime identity', { status: 400 });
    }

    const pair = new (globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    persistSocketAttachment(server, {
      userId,
      deviceId,
      surface,
      cursor,
      ackSeq: cursor,
      authLeaseExpiresAt,
      heartbeatIntervalMs,
      connectedAt: nowIso,
      lastSeenAt: nowIso,
    });
    await this.sendHello(server);
    await this.replayFromCursor(server, cursor);

    return new Response(null, {
      status: 101,
      // @ts-expect-error Cloudflare upgrade response extension
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.send(
        ws,
        RealtimeServerMessageSchema.parse({
          type: 'error',
          code: 'invalid_json',
          message: 'Invalid realtime payload.',
        }),
      );
      return;
    }
    const parsedMessage = RealtimeClientMessageSchema.safeParse(parsed);
    if (!parsedMessage.success) {
      this.send(
        ws,
        RealtimeServerMessageSchema.parse({
          type: 'error',
          code: 'invalid_client_message',
          message: 'Unsupported realtime client message.',
        }),
      );
      return;
    }
    const current = parseSocketAttachment(ws);
    if (!current) {
      return;
    }
    current.lastSeenAt = new Date().toISOString();
    if (parsedMessage.data.type === 'ack') {
      current.ackSeq = Math.max(current.ackSeq, parsedMessage.data.seq);
      persistSocketAttachment(ws, current);
      return;
    }
    if (parsedMessage.data.type === 'resume') {
      current.cursor = Math.max(current.cursor, parsedMessage.data.cursor);
      persistSocketAttachment(ws, current);
      await this.replayFromCursor(ws, current.cursor);
      return;
    }
    if (parsedMessage.data.type === 'ping') {
      this.send(ws, { type: 'pong' });
      persistSocketAttachment(ws, current);
      return;
    }
    if (parsedMessage.data.type === 'hello') {
      persistSocketAttachment(ws, current);
      await this.sendHello(ws);
      await this.replayFromCursor(ws, parsedMessage.data.cursor ?? current.cursor);
    }
  }

  webSocketClose(_ws: WebSocket): void {
    // no-op (hibernation keeps socket references in Durable Object state)
  }
}
