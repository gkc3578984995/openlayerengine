/** 已挂载交互光标的所有权句柄。 */
export interface CursorViewHandle {
  /** 应用当前交互状态对应的 CSS cursor。 */
  set(cursor: string): void;
  /** 恢复打开句柄前或会话期间由外部更新的光标。 */
  reset(): void;
  /** 释放光标所有权并恢复进入交互前的状态。 */
  destroy(): void;
}

/** 会话层用于声明交互光标的内部端口。 */
export interface CursorPort {
  /** 打开一个隔离的光标所有权句柄。 */
  open(): CursorViewHandle;
}
