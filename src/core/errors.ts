/** 参数错误。传入的参数不符合接口要求时抛出。 */
export class InvalidArgumentError extends Error {
  /**
   * 创建一个参数错误。
   *
   * @param message 错误信息。说明哪个参数不正确。
   * @returns 新的参数错误实例。
   *
   * @example
   * ```ts
   * import { InvalidArgumentError } from '@vrsim/earth-engine-ol';
   *
   * throw new InvalidArgumentError('坐标不能为空');
   * ```
   */
  constructor(message = 'Invalid argument') {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}

/** 元素 ID 重复错误。添加同名元素时抛出。 */
export class DuplicateElementIdError extends Error {
  /**
   * 创建一个元素 ID 重复错误。
   *
   * @param message 错误信息。说明哪个元素 ID 已经存在。
   * @returns 新的元素 ID 重复错误实例。
   *
   * @example
   * ```ts
   * import { DuplicateElementIdError } from '@vrsim/earth-engine-ol';
   *
   * throw new DuplicateElementIdError('元素 marker 已经存在');
   * ```
   */
  constructor(message = 'Element id already exists') {
    super(message);
    this.name = 'DuplicateElementIdError';
  }
}

/** 选择器错误。危险操作没有给出明确选择条件时抛出。 */
export class InvalidSelectorError extends Error {
  /**
   * 创建一个选择器错误。
   *
   * @param message 错误信息。说明选择条件哪里不正确。
   * @returns 新的选择器错误实例。
   *
   * @example
   * ```ts
   * import { InvalidSelectorError } from '@vrsim/earth-engine-ol';
   *
   * throw new InvalidSelectorError('删除元素时必须指定选择条件');
   * ```
   */
  constructor(message = 'A destructive operation requires an explicit selector') {
    super(message);
    this.name = 'InvalidSelectorError';
  }
}

/** 对象已销毁错误。继续使用已经失效的对象时抛出。 */
export class ObjectDisposedError extends Error {
  /**
   * 创建一个对象已销毁错误。
   *
   * @param message 错误信息。说明哪个对象已经失效。
   * @returns 新的对象已销毁错误实例。
   *
   * @example
   * ```ts
   * import { ObjectDisposedError } from '@vrsim/earth-engine-ol';
   *
   * throw new ObjectDisposedError('地图实例已经销毁');
   * ```
   */
  constructor(message = 'The requested object has been disposed') {
    super(message);
    this.name = 'ObjectDisposedError';
  }
}

/** 能力不可用错误。目标不支持请求的能力时抛出。 */
export class CapabilityError extends Error {
  /**
   * 创建一个能力不可用错误。
   *
   * @param message 错误信息。说明当前缺少哪项能力。
   * @returns 新的能力不可用错误实例。
   *
   * @example
   * ```ts
   * import { CapabilityError } from '@vrsim/earth-engine-ol';
   *
   * throw new CapabilityError('当前图形不支持动态编辑');
   * ```
   */
  constructor(message = 'The requested capability is unavailable') {
    super(message);
    this.name = 'CapabilityError';
  }
}

/** 交互冲突错误。互斥交互无法同时运行时抛出。 */
export class InteractionConflictError extends Error {
  /**
   * 创建一个交互冲突错误。
   *
   * @param message 错误信息。说明哪些交互发生了冲突。
   * @returns 新的交互冲突错误实例。
   *
   * @example
   * ```ts
   * import { InteractionConflictError } from '@vrsim/earth-engine-ol';
   *
   * throw new InteractionConflictError('绘制和变换不能同时进行');
   * ```
   */
  constructor(message = 'The requested interaction conflicts with an active interaction') {
    super(message);
    this.name = 'InteractionConflictError';
  }
}

/** 操作不支持错误。接口存在但当前场景不能执行时抛出。 */
export class UnsupportedOperationError extends Error {
  /**
   * 创建一个操作不支持错误。
   *
   * @param message 错误信息。说明当前不能执行什么操作。
   * @returns 新的操作不支持错误实例。
   *
   * @example
   * ```ts
   * import { UnsupportedOperationError } from '@vrsim/earth-engine-ol';
   *
   * throw new UnsupportedOperationError('当前元素不能缩放');
   * ```
   */
  constructor(message = 'The requested operation is unsupported') {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}
