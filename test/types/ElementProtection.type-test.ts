import type { ElementProtectionState, ElementProtectionUpdate, ElementService } from '../../src/index.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Expect<Value extends true> = Value;

type ExpectedUpdate =
  | {
      readonly protected: true;
      readonly operatorId?: string;
      readonly operatorName?: string;
      readonly revision?: number;
      readonly expiresAt?: number;
    }
  | {
      readonly protected: false;
      readonly revision?: number;
    };

type ExpectedState = {
  readonly elementId: string;
  readonly protected: true;
  readonly operatorId?: string;
  readonly operatorName?: string;
  readonly revision?: number;
  readonly expiresAt?: number;
};

type UpdateIsExact = Expect<Equal<ElementProtectionUpdate, ExpectedUpdate>>;
type StateIsExact = Expect<Equal<ElementProtectionState, ExpectedState>>;

declare const elements: ElementService;

const acquire: ElementProtectionUpdate = {
  protected: true,
  operatorId: 'user-42',
  operatorName: '张三',
  revision: 18,
  expiresAt: Date.now() + 30_000
};
const release: ElementProtectionUpdate = { protected: false, revision: 19 };
const changed: boolean = elements.setProtection('route-1', acquire);
const state: ElementProtectionState | undefined = elements.getProtection('route-1');
elements.setProtection('route-1', release);

// @ts-expect-error 解锁分支不接受展示信息。
const releaseWithName: ElementProtectionUpdate = { protected: false, operatorName: '张三' };
// @ts-expect-error 必须显式提供 protected 判别字段。
const missingProtected: ElementProtectionUpdate = { operatorName: '张三' };
// @ts-expect-error revision 必须是 number。
const invalidRevision: ElementProtectionUpdate = { protected: true, revision: '18' };

void [acquire, release, changed, state, releaseWithName, missingProtected, invalidRevision, null as unknown as UpdateIsExact, null as unknown as StateIsExact];
