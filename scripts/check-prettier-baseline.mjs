import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRETTIER_BASELINE_ENTRIES = [
  { path: 'scripts/docs/api-docs.mjs', sha256: 'aabba92e799db47637c8fed11b737fe6b7edc390978303958b92855aaeaa698c' },
  { path: 'src/assets/style/descriptor.scss', sha256: '89e325516aac6fa988358db9d9d5102b85a5352c6381c0928bae7d6a653e89f5' },
  { path: 'src/common/Utils.ts', sha256: '53919c9ae4d1d10e3c48c759f62966e0ae89f0c82d977d070ae11c17ff6bde66' },
  { path: 'src/components/Descriptor.ts', sha256: 'ea5700fc756340d30207b6a0dd72e41e4fa2348a4f003338edd3fd2b7c9bbc50' },
  { path: 'src/components/Measure.ts', sha256: '40a798ece34fe1e2affdede22970d55d917dcc0618773d605ccf69c306a7eef5' },
  { path: 'src/enum/index.ts', sha256: 'ddee2ff6c41f1dc6ab80f59d9862d65edd44272b5220e1738e1392d971c44a7d' },
  { path: 'src/extends/flight-line/FlightLineSource.ts', sha256: '08ad4c8ae9d8a135d337fc87df8528db75e3195409f8f255d4f8e5c39318c43a' },
  { path: 'src/extends/flight-line/index.ts', sha256: 'c4e68413613af6a2f40738738b674c8d4bb7e5519399a6d700b32720567138ad' },
  { path: 'src/extends/plot/circle/Circle.ts', sha256: 'ea92d4e8d0bfcd126869a06fb05f97784fc30b39083e9b67290e2a28c8fe714f' },
  { path: 'src/extends/plot/circle/Ellipse.ts', sha256: '644b0f9e5851b6356886c01581cb4063fc10fa8e4929d04db0740d4ae723360f' },
  { path: 'src/extends/plot/geom/AssaultDirectionArrow.ts', sha256: '3761a2e04be2ad53c7e50c5069db76468e978c3e5c13880b8dc6e456fa75b7a3' },
  { path: 'src/extends/plot/geom/DoubleArrow.ts', sha256: '7407a4c7deb9fd60476cc0ef42bffdf28983257e24b46ae1d962ea4377c98e0d' },
  { path: 'src/extends/plot/geom/FineArrow.ts', sha256: '162c32e438b6ec887fdb33465320be42b672cc20effbb86863a0e4af220bbafe' },
  { path: 'src/extends/plot/geom/TailedAttackArrow.ts', sha256: '3969256c63e5020f00ba813f448b5dd051547e59fde254014219fc38b8ee0a12' },
  { path: 'src/extends/plot/geom/TailedSquadCombatArrow.ts', sha256: 'aa5aa0a899ab59ba066ee2154f4db4e9a54d9c477e19e749be1f23f5982b6634' },
  { path: 'src/extends/plot/polygon/AssemblePolygon.ts', sha256: '57e245a34ea7726b70b8a2ac04548928d40f7af5a1de893c3d701b7f65daa82e' },
  { path: 'src/extends/plot/polygon/ClosedCurvePolygon.ts', sha256: 'b0c31a8e06ef50168252a0c3015a3658f084623b12df4e1cec9eb3bb4ebec132' },
  { path: 'src/extends/plot/polygon/EquilateralTrianglePolygon.ts', sha256: '1d25a966518e6c455b29236a20f2838586714bc40f267e47a5e6afe2ca1b5a08' },
  { path: 'src/extends/plot/polygon/LunePolygon.ts', sha256: '05cdd5cb691fb24c76a4d2d307de20a138e1dd13028da8fca333f5d55953bf73' },
  { path: 'src/extends/plot/polygon/RectAnglePolygon.ts', sha256: '727aacd0e1dee57ad17f085465d30381d546f3c2b8f00cd835d5c5d59ad96519' },
  { path: 'src/extends/plot/polygon/SectorPolygon.ts', sha256: 'ffccfee83b3180fdab88aa761388f4a2f8f601a78e3259677220f9082ae4009f' },
  { path: 'src/extends/plot/polygon/TrianglePolygon.ts', sha256: 'e6642c104cfa730ed28da8ddd319f0dceacf28353c68bbaf797aef847fe28419' },
  { path: 'src/extends/plot/polyline/CurvePolyline.ts', sha256: '76112fdcd3b9dbe5854f20f337ecf6b2972e2fdd5a7397cd429dca4e4d1365b2' },
  { path: 'src/extends/plot/polyline/LunePolyline.ts', sha256: '831ec982ecfd6e9b7b70c34f79e4c17780cf4d27dbaabb8c79fc7417daebf87f' },
  { path: 'src/extends/plot/utils.ts', sha256: 'b624cb1ff9573ceffd45820f337c54a735e5a523e42c472e40efd87227f5f5a2' },
  { path: 'src/extends/transform-interaction/element.ts', sha256: 'b1f4028b21597a9974aac0aa4f31c3be69b9cfb9b1cb865c6799a1d60c4671e8' },
  { path: 'src/extends/transform-interaction/input/Base.ts', sha256: '369f34c499738257302b2d5ebcd3f7bf6f0c124914bb5e22e57b33c41a7942ee' },
  { path: 'src/extends/transform-interaction/input/Checkbox.ts', sha256: '4fbad5e61ccb2da30d679c6b392f946b5e8d9cee002bdaa93d32322ed91d88c4' },
  { path: 'src/extends/transform-interaction/input/Radio.ts', sha256: '720c4d88d540815e6e3fda8c7bb0247bc118dd4ca0f5ac335327667c556aac87' },
  { path: 'src/extends/transform-interaction/input/Switch.ts', sha256: '991292d614c7189baff659cb8fd811c5e53f8d8e4165b46ff5281a91e8bcfacb' },
  { path: 'src/extends/transform-interaction/TransformInteraction.ts', sha256: '639600ac12a075ca04ff9ec65b2be854865528b5e8d19dab274fae546db2f04d' },
  { path: 'src/interface/descriptor.ts', sha256: '776e9f39dd60a814c8bcb4c7de9a30e618e82e3bc0028ff170d1b15b85024033' },
  { path: 'test/ApiDocGenerator.test.ts', sha256: 'ee4835e7e1320a48da628b67bbbd300b3ff31a1da6b610f68ff9f5e85b8fd387' },
  { path: 'test/Base.test.ts', sha256: 'c08e709e291a74e2f0b90858402b113fb7a511763028fa95982fd46e816dceab' },
  { path: 'test/LayerCommonDemoCoverage.test.ts', sha256: '9f6bce69d22ceea8f07c285aad240038db76ad07f14264157a7ad67b73f0df2a' },
  { path: 'test/PatternFill.test.ts', sha256: '076dca7c6a24713db95c610722a29a2d8879f9a378fd487f7ed623cf94f46f27' },
  { path: 'test/Utils.test.ts', sha256: 'f8ca1cb12e97f66d43b0baa321be2a3ddfb2ee40dc2b37657ee95c25884dbf23' },
  { path: 'typedoc.json', sha256: '56e5138c6302b8d8d9af910c048e3b99db6f717eb021b4a805b9a2dc0e0aa260' }
];

export class PrettierBaselineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrettierBaselineError';
  }
}

export function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n');
}

export function normalizedSha256(content) {
  return createHash('sha256').update(normalizeLineEndings(content), 'utf8').digest('hex');
}

function validateCanonicalPath(filePath) {
  const forbiddenCharacters = ['!', '#', '*', '?', '[', ']', '\\', ':'];
  if (!filePath || filePath !== filePath.trim()) return 'must be non-empty without leading or trailing whitespace';
  if (filePath.startsWith('/') || filePath.endsWith('/')) return 'must be a repository-relative file path without leading or trailing slash';
  if (forbiddenCharacters.some((character) => filePath.includes(character)))
    return 'must be an exact POSIX path without glob, negation, escape, or drive syntax';
  if (filePath.split('/').some((segment) => !segment || segment === '.' || segment === '..'))
    return 'must not contain empty, current-directory, or parent-directory segments';
  return undefined;
}

export function parseCanonicalIgnoreFile(content) {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  const entries = [];
  const errors = [];
  const seen = new Set();

  for (const [index, filePath] of lines.entries()) {
    const pathError = validateCanonicalPath(filePath);
    if (pathError) {
      errors.push(`.prettierignore line ${index + 1}: ${pathError}`);
      continue;
    }
    if (seen.has(filePath)) {
      errors.push(`.prettierignore line ${index + 1}: duplicate path ${filePath}`);
      continue;
    }
    seen.add(filePath);
    entries.push(filePath);
  }

  if (errors.length > 0) throw new PrettierBaselineError(`Invalid canonical .prettierignore:\n- ${errors.sort().join('\n- ')}`);
  return entries;
}

export async function verifyPrettierBaseline({ rootDir = process.cwd(), ignorePath = '.prettierignore', entries = PRETTIER_BASELINE_ENTRIES } = {}) {
  const errors = [];
  const baselineByPath = new Map();

  for (const entry of entries) {
    const pathError = validateCanonicalPath(entry.path);
    if (pathError) errors.push(`baseline entry ${entry.path || '<empty>'}: ${pathError}`);
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push(`baseline entry ${entry.path}: invalid SHA-256 ${entry.sha256}`);
    if (baselineByPath.has(entry.path)) errors.push(`duplicate baseline entry: ${entry.path}`);
    baselineByPath.set(entry.path, entry.sha256);
  }

  let ignoreEntries = [];
  try {
    ignoreEntries = parseCanonicalIgnoreFile(await readFile(resolve(rootDir, ignorePath), 'utf8'));
  } catch (error) {
    if (error instanceof PrettierBaselineError) errors.push(error.message);
    else errors.push(`unable to read ${ignorePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const ignoreSet = new Set(ignoreEntries);
  const baselinePaths = [...baselineByPath.keys()];
  const missingIgnoreEntries = baselinePaths.filter((filePath) => !ignoreSet.has(filePath)).sort();
  const unexpectedIgnoreEntries = ignoreEntries.filter((filePath) => !baselineByPath.has(filePath)).sort();
  if (missingIgnoreEntries.length > 0) errors.push(`missing ignore entries: ${missingIgnoreEntries.join(', ')}`);
  if (unexpectedIgnoreEntries.length > 0) errors.push(`unexpected ignore entries: ${unexpectedIgnoreEntries.join(', ')}`);

  for (const filePath of baselinePaths.sort()) {
    const absolutePath = resolve(rootDir, filePath);
    const relativePath = relative(rootDir, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      errors.push(`${filePath}: resolves outside the repository root`);
      continue;
    }

    try {
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        errors.push(`${filePath}: baseline path must be a regular non-symlink file`);
        continue;
      }
      const actualSha256 = normalizedSha256(await readFile(absolutePath, 'utf8'));
      const expectedSha256 = baselineByPath.get(filePath);
      if (actualSha256 !== expectedSha256) {
        errors.push(
          `${filePath}: SHA-256 mismatch (expected ${expectedSha256}, received ${actualSha256}); format the file and remove it from both .prettierignore and PRETTIER_BASELINE_ENTRIES`
        );
      }
    } catch (error) {
      errors.push(`${filePath}: unable to verify baseline file (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (errors.length > 0) throw new PrettierBaselineError(`Prettier historical baseline verification failed:\n- ${errors.sort().join('\n- ')}`);
}

const invokedAsScript = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url : false;
if (invokedAsScript) {
  try {
    await verifyPrettierBaseline();
    console.log(`Prettier historical baseline verified (${PRETTIER_BASELINE_ENTRIES.length} files).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
