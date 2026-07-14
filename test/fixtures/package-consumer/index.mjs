import { Earth, animationTypes, measureTypes, shapeTypes, stylePresets, throttle, useEarth } from '@vrsim/earth-engine-ol';

if (typeof Earth !== 'function') throw new TypeError('Earth 根导出不可用');
if (typeof useEarth !== 'function') throw new TypeError('useEarth 根导出不可用');
if (typeof throttle !== 'function') throw new TypeError('throttle 根导出不可用');
if (animationTypes.length === 0 || measureTypes.length === 0 || shapeTypes.length === 0) throw new TypeError('能力清单根导出不可用');
if (stylePresets['point-default'] === undefined) throw new TypeError('stylePresets 根导出不可用');

console.log('Node ESM consumer 验证通过。');
