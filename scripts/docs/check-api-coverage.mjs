import { readFile } from 'node:fs/promises';
import { extractApiModel } from './api-docs.mjs';

const document = JSON.parse(await readFile('.cache/typedoc.json', 'utf8'));
const model = extractApiModel(document);
const expectedMethods = ['add', 'set', 'setPosition', 'continueFlash', 'stopFlash', 'remove'];
const availableMethods = model.classes.PointLayer?.methods ?? {};
const missingMethods = expectedMethods.filter((name) => !availableMethods[name]);

if (missingMethods.length) throw new Error(`PointLayer documentation references missing methods: ${missingMethods.join(', ')}`);
