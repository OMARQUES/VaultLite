import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const backgroundPath = resolve(process.cwd(), 'background.js');
const contentScriptPath = resolve(process.cwd(), 'content-script.js');

describe('form metadata runtime integration', () => {
  test('content script arms submit promotion and same-origin iframe inspection', () => {
    const source = readFileSync(contentScriptPath, 'utf8');
    expect(source).toContain("const CONTENT_RUNTIME_KEY = '__vaultliteContentRuntimeV2';");
    expect(source).toContain("frameScope: accumulator.length === 0 ? 'top' : 'same_origin_iframe'");
    expect(source).toContain("type: 'vaultlite.form_metadata_submit_signal'");
    expect(source).toContain("message.type === 'vaultlite.runtime_probe'");
    expect(source).toContain('function buildObservationEntries(contexts = []) {');
    expect(source).toContain('observationEntries: buildObservationEntries(filledContexts),');
    expect(source).toContain("mode: 'identifier_step'");
    expect(source).toContain("mode: 'password_step'");
    expect(source).toContain('requestSubmit(');
    expect(source).toContain("result: 'step_transition_try_again'");
  });

  test('background consumes fill telemetry and content-script submit signals', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("type: 'vaultlite.fill'");
    expect(source).toContain("type: 'vaultlite.runtime_probe'");
    expect(source).toContain('async function ensureContentScriptReadyInTab(');
    expect(source).toContain('formMetadataRecords: fillMetadataRecords');
    expect(source).toContain('applyFormMetadataTelemetryInternal({');
    expect(source).toContain("case 'vaultlite.form_metadata_submit_signal':");
    expect(source).toContain("return handleFormMetadataSubmitSignalInternal(command, sender);");
    expect(source).toContain('if (!shouldUpsertFormMetadataRecord(formMetadataCache, candidate)) {');
    expect(source).toContain('for (const rawObservation of fillObservations) {');
    expect(source).toContain('await upsertFormMetadataInternal(normalized);');
    expect(source).toContain('fillObservations: Array.isArray(input?.observations) ? input.observations : [],');
  });
});
