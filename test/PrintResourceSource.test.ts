import { describe, expect, it } from 'vitest';
import { createCorsTaintedCanvasError, sanitizePrintSourceId } from '../src/core/print/PrintResourceSource.js';

describe('sanitizePrintSourceId', () => {
  it('removes URL credentials, query parameters, and fragments', () => {
    expect(sanitizePrintSourceId('https://operator:secret@example.test/tiles/12/3/4.png?token=private#preview')).toBe('https://example.test/tiles/12/3/4.png');
  });

  it('keeps a relative public path without its sensitive suffix', () => {
    expect(sanitizePrintSourceId('/maps/base.png?signature=private#layer')).toBe('/maps/base.png');
  });

  it('redacts inline and blob payload identities', () => {
    expect(sanitizePrintSourceId('data:image/png;base64,private-payload')).toBe('data:image/png');
    expect(sanitizePrintSourceId('blob:https://example.test/15c1b8c4-39fb-4c9f?token=private')).toBe('blob:https://example.test/[redacted]');
  });

  it('does not expose credentials from a malformed source identifier', () => {
    const result = sanitizePrintSourceId('tiles://operator:secret@host/path?token=private');
    expect(result).not.toContain('operator');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('token');
  });

  it('returns a bounded identifier for logs and PrintError details', () => {
    expect(sanitizePrintSourceId(`https://example.test/${'a'.repeat(400)}?token=private`)).toHaveLength(256);
    expect(sanitizePrintSourceId('   ')).toBe('unknown');
  });

  it('builds CORS errors with public Layer context and sanitized resource candidates', () => {
    const cause = new DOMException('tainted', 'SecurityError');
    const error = createCorsTaintedCanvasError(cause, [
      {
        layerId: 'public-basemap',
        resourceType: 'tile',
        sourceId: 'https://operator:secret@example.test/tiles/{z}/{x}/{y}.png?token=private#preview'
      },
      { layerId: 'public-symbols', resourceType: 'icon', sourceId: 'data:image/png;base64,private-payload' }
    ]);

    expect(error).toMatchObject({
      code: 'cors-tainted-canvas',
      cause,
      details: {
        layerId: 'public-basemap',
        resourceType: 'tile',
        sourceId: 'https://example.test/tiles/%7Bz%7D/%7Bx%7D/%7By%7D.png',
        candidates: [
          {
            layerId: 'public-basemap',
            resourceType: 'tile',
            sourceId: 'https://example.test/tiles/%7Bz%7D/%7Bx%7D/%7By%7D.png'
          },
          { layerId: 'public-symbols', resourceType: 'icon', sourceId: 'data:image/png' }
        ]
      }
    });
    expect(JSON.stringify(error.details)).not.toMatch(/operator|secret|private|token/u);
  });
});
