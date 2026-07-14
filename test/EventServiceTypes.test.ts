import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

describe('EventService public types', () => {
  coversCapabilities(
    'event-global-click',
    'event-global-move',
    'event-global-key-down',
    'event-module-routing-payload',
    'event-listener-disposer',
    'event-listener-state-query',
    'event-manual-enable-disable'
  );

  it('passes strict exact-optional event inference, option exclusion, and service signatures', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
    const fixture = fileURLToPath(new URL('./fixtures/EventServiceTypes.ts', import.meta.url));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          tsc,
          '--noEmit',
          '--pretty',
          'false',
          '--strict',
          '--exactOptionalPropertyTypes',
          '--skipLibCheck',
          'false',
          '--types',
          'node',
          '--target',
          'ES2022',
          '--module',
          'ESNext',
          '--moduleResolution',
          'Bundler',
          fixture
        ],
        { cwd: root, encoding: 'utf8' }
      )
    ).not.toThrow();
  });
});
