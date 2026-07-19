import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const generatedApiFile = resolve('website/src/generated/api.ts');
const generatedApiExists = existsSync(generatedApiFile);

const loadAudit = () => import('../scripts/docs/check-component-api-ownership.mjs');
const loadGeneratedApi = () => import('../website/src/generated/api');

describe.skipIf(!generatedApiExists)('组件文档公开 API 唯一归属', () => {
  it('自动覆盖当前包根生成的全部公开导出', async () => {
    const [{ auditComponentApiOwnership }, { apiCatalog, apiRuntimeExports }] = await Promise.all([loadAudit(), loadGeneratedApi()]);
    const report = await auditComponentApiOwnership();

    expect(report.exportedSymbolCount).toBe(apiCatalog.length + apiRuntimeExports.length);
    expect(report.typeCount).toBe(apiCatalog.length);
    expect(report.runtimeCount).toBe(apiRuntimeExports.length);
  });

  it('每个公开导出和直接成员都只有一个规范归属', async () => {
    const { auditComponentApiOwnership, formatComponentApiOwnershipReport } = await loadAudit();
    const report = await auditComponentApiOwnership();

    expect(report.errors, `\n${formatComponentApiOwnershipReport(report)}`).toEqual([]);
  });
});
