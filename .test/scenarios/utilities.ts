import {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError,
  add2,
  closeRing,
  createId,
  degToRad,
  lerp2,
  quadraticBezier2,
  radToDeg,
  scale2,
  throttle,
  trimClosingCoordinate,
  type Coordinate,
  type Pixel,
  type ThrottleOptions,
  type ThrottledFunction
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

interface ErrorResult {
  readonly api: string;
  readonly error: Error;
  readonly matchesType: boolean;
}

interface FallbackIdResult {
  readonly id?: string;
  readonly error?: string;
}

type DemoThrottle = ThrottledFunction<void, [label: string], string>;

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const utilitiesScenario: ScenarioDefinition = {
  id: 'utilities',
  group: '工具函数',
  title: '数学、标识、节流与错误类型',
  summary: '直接展示全部公共工具函数的结果、createId 的两条随机路径、throttle 的控制方法，以及七种公共错误类型。',
  steps: [
    '检查数学结果，重点确认角度归一化、二维插值、贝塞尔曲线和三维坐标闭环的返回值。',
    '比较 closeRing 与 trimClosingCoordinate 在空数组、开放坐标和已闭合坐标上的分支结果。',
    '确认 createId 在 Web Crypto 路径和临时禁用 crypto 的 fallback 路径中都生成 UUID v4。',
    '查看 leading-only 与 trailing-only 的自动结果，再修改选项、重建节流函数并测试 call、flush 和 cancel。',
    '逐项检查七个 Error 子类的 name、message 和 instanceof 结果。'
  ],
  mount(context) {
    const mathControls = context.section('数学与坐标工具', '所有返回值均直接显示，输入坐标不会被修改。');
    context.note(mathControls, 'Coordinate 与 Pixel 都通过包根类型导入；下面同时展示二维和三维 Coordinate。', '提示');

    const start: Coordinate = [2, 4];
    const control: Coordinate = [8, 14];
    const end: Coordinate = [18, 6];
    const pixel: Pixel = [320, 180];
    const openRing: readonly Coordinate[] = [
      [0, 0, 5],
      [4, 0, 5],
      [4, 3, 5]
    ];
    const closedRing: readonly Coordinate[] = [...openRing, [0, 0, 5]];

    const mathResults = {
      'degToRad(180)': degToRad(180),
      'radToDeg(-π/2)': radToDeg(-Math.PI / 2),
      'scale2([2,4], 2.5)': scale2(start, 2.5),
      'add2([2,4], [18,6])': add2(start, end),
      'lerp2(..., 0.25)': lerp2(start, end, 0.25),
      'quadraticBezier2(..., 0.5)': quadraticBezier2(start, control, end, 0.5)
    };
    for (const [label, value] of Object.entries(mathResults)) context.status(label, value);
    context.status('Coordinate 二维值', start);
    context.status('Coordinate 三维值', openRing[0]);
    context.status('Pixel 值', pixel);
    context.status('closeRing([])', closeRing([]));
    context.status('closeRing(开放三维环)', closeRing(openRing));
    context.status('closeRing(已闭合三维环)', closeRing(closedRing));
    context.status('trimClosingCoordinate(开放环)', trimClosingCoordinate(openRing));
    context.status('trimClosingCoordinate(已闭合环)', trimClosingCoordinate(closedRing));
    context.check('radToDeg 将负角归一化到 0～360', radToDeg(-Math.PI / 2) === 270);
    context.check('closeRing 不修改原数组', openRing.length === 3);

    const idControls = context.section('标识生成 createId', '先使用当前 Web Crypto，再同步临时移除 crypto 以验收 fallback。');
    const cryptoId = createId();
    const fallback = createFallbackId();
    context.status('Web Crypto 路径结果', cryptoId);
    context.status('Web Crypto randomUUID 可用', typeof globalThis.crypto?.randomUUID === 'function');
    context.status('fallback 路径结果', fallback.id ?? fallback.error ?? '未知结果');
    context.check('Web Crypto 路径返回 UUID v4', uuidV4Pattern.test(cryptoId), cryptoId);
    context.check('fallback 路径返回 UUID v4', fallback.id !== undefined && uuidV4Pattern.test(fallback.id), fallback.error ?? fallback.id);
    const idActions = context.actions(idControls);
    context.button(idActions, '再次生成两个 id', () => {
      const nextCryptoId = createId();
      const nextFallback = createFallbackId();
      context.status('最近 Web Crypto id', nextCryptoId);
      context.status('最近 fallback id', nextFallback.id ?? nextFallback.error);
      context.check('两次 id 不重复', nextCryptoId !== cryptoId && nextFallback.id !== fallback.id);
    });

    const throttleControls = context.section('函数节流 throttle', '修改选项后点击“重建”；待执行的 trailing 调用会在日志和状态中显示。');
    const waitInput = context.number(throttleControls, '等待毫秒数', 500, { min: 0, max: 5_000, step: 50 });
    const leadingInput = context.checkbox(throttleControls, 'leading：立即执行首次调用', true);
    const trailingInput = context.checkbox(throttleControls, 'trailing：末尾执行最后调用', true);

    let leadingOnlyCount = 0;
    const leadingOnlyOptions: ThrottleOptions = { leading: true, trailing: false };
    const leadingOnly: DemoThrottle = throttle<void, [string], string>((label) => `第 ${++leadingOnlyCount} 次执行：${label}`, 1_000, leadingOnlyOptions);
    const leadingOnlyCalls = [leadingOnly('首次'), leadingOnly('被节流')];
    leadingOnly.cancel();
    context.status('leading-only options', leadingOnlyOptions);
    context.status('leading-only call 结果', leadingOnlyCalls);
    context.status('leading-only 执行次数', leadingOnlyCount);

    let trailingOnlyCount = 0;
    const trailingOnlyOptions: ThrottleOptions = { leading: false, trailing: true };
    const trailingOnly: DemoThrottle = throttle<void, [string], string>((label) => `第 ${++trailingOnlyCount} 次执行：${label}`, 1_000, trailingOnlyOptions);
    const trailingCallResult = trailingOnly('等待 flush');
    const trailingFlushResult = trailingOnly.flush();
    trailingOnly.cancel();
    context.status('trailing-only options', trailingOnlyOptions);
    context.status('trailing-only call 结果', trailingCallResult);
    context.status('trailing-only flush 结果', trailingFlushResult);
    context.status('trailing-only 执行次数', trailingOnlyCount);

    let invocationCount = 0;
    let activeThrottle: DemoThrottle;
    const createActiveThrottle = (): DemoThrottle => {
      const options: ThrottleOptions = {
        leading: leadingInput.checked,
        trailing: trailingInput.checked
      };
      const throttled: DemoThrottle = throttle<void, [string], string>(
        (label) => {
          const result = `第 ${++invocationCount} 次执行：${label}`;
          context.status('交互式 throttle 最近执行', result);
          context.log('throttle 目标函数执行', '信息', result);
          return result;
        },
        waitInput.valueAsNumber,
        options
      );
      context.status('交互式 throttle options', options);
      return throttled;
    };
    activeThrottle = createActiveThrottle();
    context.track(() => activeThrottle.cancel());

    const throttleActions = context.actions(throttleControls);
    context.button(
      throttleActions,
      '连续 call 三次',
      () => {
        const results = [activeThrottle('call 1'), activeThrottle('call 2'), activeThrottle('call 3')];
        context.status('call 返回结果', results);
        context.status('目标函数执行次数', invocationCount);
      },
      '主要'
    );
    context.button(throttleActions, 'flush 待执行调用', () => {
      context.status('flush 返回结果', activeThrottle.flush());
      context.status('目标函数执行次数', invocationCount);
    });
    context.button(throttleActions, 'cancel 待执行调用', () => {
      activeThrottle.cancel();
      context.status('cancel 结果', '计时器与待执行参数已清理');
    });
    context.button(throttleActions, '按当前选项重建', () => {
      activeThrottle.cancel();
      invocationCount = 0;
      activeThrottle = createActiveThrottle();
      context.status('目标函数执行次数', invocationCount);
    });

    const errorControls = context.section('公共 Error 类型', '每个错误均使用中文消息实例化，并显示 name、message 与 instanceof。');
    const errorResults: readonly ErrorResult[] = [
      errorResult('CapabilityError', new CapabilityError('当前能力不可用'), CapabilityError),
      errorResult('DuplicateElementIdError', new DuplicateElementIdError('元素 id 已存在'), DuplicateElementIdError),
      errorResult('InteractionConflictError', new InteractionConflictError('交互与当前会话冲突'), InteractionConflictError),
      errorResult('InvalidArgumentError', new InvalidArgumentError('参数不符合要求'), InvalidArgumentError),
      errorResult('InvalidSelectorError', new InvalidSelectorError('破坏性操作缺少选择器'), InvalidSelectorError),
      errorResult('ObjectDisposedError', new ObjectDisposedError('对象已经销毁'), ObjectDisposedError),
      errorResult('UnsupportedOperationError', new UnsupportedOperationError('当前操作不受支持'), UnsupportedOperationError)
    ];
    for (const result of errorResults) {
      context.status(result.api, {
        name: result.error.name,
        message: result.error.message,
        instanceof: result.matchesType
      });
    }
    context.check(
      '七种公共错误类型全部通过 instanceof',
      errorResults.every((result) => result.matchesType),
      errorResults.map((result) => result.api)
    );
    context.note(errorControls, '这些错误均继承 Error，可通过 name 或 instanceof 在调用方进行分类处理。', '提示');

    context.setCode(`
import {
  CapabilityError,
  closeRing,
  createId,
  lerp2,
  throttle
} from '@vrsim/earth-engine-ol';

const closed = closeRing([[0, 0], [2, 0], [2, 2]]);
const midpoint = lerp2([0, 0], [10, 20], 0.5);
const id = createId();
const save = throttle(value => console.log(value), 300, {
  leading: true,
  trailing: true
});

save('第一次');
save.flush();
save.cancel();
const error = new CapabilityError('能力不可用');
    `);
  }
};

function createFallbackId(): FallbackIdResult {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    return { id: createId() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'crypto');
    else Object.defineProperty(globalThis, 'crypto', descriptor);
  }
}

function errorResult<T extends Error>(api: string, error: T, constructor: abstract new (...arguments_: never[]) => T): ErrorResult {
  return { api, error, matchesType: error instanceof constructor };
}
