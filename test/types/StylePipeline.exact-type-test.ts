import type { StylePatch } from '../../src/core/style/types.js';

// @ts-expect-error a non-discriminating symbol patch cannot delete its discriminator
const invalidSymbolTypeDeletion: StylePatch = { symbol: { type: undefined } };
// @ts-expect-error a non-discriminating fill patch cannot delete its discriminator
const invalidFillTypeDeletion: StylePatch = { fill: { type: undefined } };
// @ts-expect-error circle radius is required and cannot be deleted
const invalidCircleRadiusDeletion: StylePatch = { symbol: { radius: undefined } };
// @ts-expect-error icon src is required and cannot be deleted
const invalidIconSourceDeletion: StylePatch = { symbol: { src: undefined, scale: 2 } };
// @ts-expect-error text content is required and cannot be deleted
const invalidTextDeletion: StylePatch = { text: { text: undefined } };
// @ts-expect-error the pattern discriminator is required and cannot be deleted
const invalidPatternDeletion: StylePatch = { fill: { pattern: undefined, size: 16 } };

void [invalidSymbolTypeDeletion, invalidFillTypeDeletion, invalidCircleRadiusDeletion, invalidIconSourceDeletion, invalidTextDeletion, invalidPatternDeletion];
