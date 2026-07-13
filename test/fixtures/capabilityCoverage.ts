import { v1CapabilityManifest, type LegacyCapabilityId } from './v1CapabilityManifest.js';

const frozenCapabilityIds = new Set<string>(v1CapabilityManifest.map((item) => item.id));

export function coversCapabilities<const T extends readonly LegacyCapabilityId[]>(...ids: T): T {
  for (const id of ids) {
    if (!frozenCapabilityIds.has(id)) throw new Error(`Unknown frozen capability: ${id}`);
  }
  return ids;
}
