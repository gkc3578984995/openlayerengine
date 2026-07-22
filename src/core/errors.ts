/** 参数不符合接口契约。 */
export class InvalidArgumentError extends Error {
  /**
   * 创建参数契约错误，并保留具体说明。
   *
   * @param message 具体的参数错误说明。
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

/** 当前 Earth 内已存在相同 Element ID。 */
export class DuplicateElementIdError extends Error {
  /**
   * 创建 Element ID 冲突错误。
   *
   * @param message 已冲突的 Element ID 说明。
   *
   * @example
   * ```ts
   * import { DuplicateElementIdError } from '@vrsim/earth-engine-ol';
   *
   * throw new DuplicateElementIdError('Element marker 已存在');
   * ```
   */
  constructor(message = 'Element id already exists') {
    super(message);
    this.name = 'DuplicateElementIdError';
  }
}

/** 破坏性操作缺少明确的 ElementSelector 条件。 */
export class InvalidSelectorError extends Error {
  /**
   * 创建缺少明确选择条件的错误。
   *
   * @param message 具体的选择条件错误说明。
   *
   * @example
   * ```ts
   * import { InvalidSelectorError } from '@vrsim/earth-engine-ol';
   *
   * throw new InvalidSelectorError('删除 Element 时必须指定选择条件');
   * ```
   */
  constructor(message = 'A destructive operation requires an explicit selector') {
    super(message);
    this.name = 'InvalidSelectorError';
  }
}

/** 调用了已失效对象的非清理操作。 */
export class ObjectDisposedError extends Error {
  /**
   * 创建对象已失效错误。
   *
   * @param message 已失效对象的说明。
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

/** 目标没有声明请求的能力。 */
export class CapabilityError extends Error {
  /**
   * 创建目标能力不可用错误。
   *
   * @param message 缺失能力的说明。
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

/** 互斥交互在 `reject` 策略下发生冲突。 */
export class InteractionConflictError extends Error {
  /**
   * 创建互斥交互冲突错误。
   *
   * @param message 冲突交互的说明。
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

/** Element 正由其他协作者保护，不能进入本地可变交互。 */
export class ElementProtectedError extends Error {
  /** 被保护的 Element ID。 */
  readonly elementId: string;
  /** 可选的协作者展示名。 */
  readonly operatorName: string | undefined;
  /** 可选的协作者稳定标识。 */
  readonly operatorId: string | undefined;

  /**
   * 创建 Element 协同保护错误。
   *
   * @param elementId 被保护的 Element ID。
   * @param operatorName 可选的协作者展示名。
   * @param operatorId 可选的协作者稳定标识。
   *
   * @example
   * ```ts
   * import { ElementProtectedError } from '@vrsim/earth-engine-ol';
   *
   * throw new ElementProtectedError('route-1', '张三', 'user-42');
   * ```
   */
  constructor(elementId: string, operatorName?: string, operatorId?: string) {
    super(operatorName === undefined ? `Element is protected: ${elementId}` : `${operatorName} is editing Element: ${elementId}`);
    this.name = 'ElementProtectedError';
    this.elementId = elementId;
    this.operatorName = operatorName;
    this.operatorId = operatorId;
  }
}

/** 当前场景无法执行已定义的操作。 */
export class UnsupportedOperationError extends Error {
  /**
   * 创建当前场景不支持操作的错误。
   *
   * @param message 不受支持操作的说明。
   *
   * @example
   * ```ts
   * import { UnsupportedOperationError } from '@vrsim/earth-engine-ol';
   *
   * throw new UnsupportedOperationError('当前 Element 不能缩放');
   * ```
   */
  constructor(message = 'The requested operation is unsupported') {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}
