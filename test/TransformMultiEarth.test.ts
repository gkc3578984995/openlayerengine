/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import Transform from '../src/components/Transform';
import { Toolbar } from '../src/extends/toolbar/Toolbar';
import TransformInteraction from '../src/extends/transform-interaction/TransformInteraction';

function analyzeToolbarBindings(source: string): { constructionCount: number; adjacentBindingCount: number; hasGlobalToolbarQuery: boolean } {
  const sourceFile = ts.createSourceFile('Transform.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let constructionCount = 0;
  let adjacentBindingCount = 0;
  let hasGlobalToolbarQuery = false;

  const isThisProperty = (node: ts.Node, name: string): node is ts.PropertyAccessExpression =>
    ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === name;

  const isToolbarConstruction = (statement: ts.Statement): boolean => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false;
    const expression = statement.expression;
    return (
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isThisProperty(expression.left, 'toolbar') &&
      ts.isNewExpression(expression.right) &&
      ts.isIdentifier(expression.right.expression) &&
      expression.right.expression.text === 'Toolbar'
    );
  };

  const isToolbarBinding = (statement: ts.Statement | undefined): boolean => {
    if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
    const expression = statement.expression;
    return (
      isThisProperty(expression.expression, 'bindToolbarEvents') && expression.arguments.length === 1 && isThisProperty(expression.arguments[0], 'toolbar')
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      node.statements.forEach((statement, index) => {
        if (!isToolbarConstruction(statement)) return;
        constructionCount += 1;
        if (isToolbarBinding(node.statements[index + 1])) adjacentBindingCount += 1;
      });
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'document' &&
      node.expression.name.text === 'querySelector' &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === '.ol-toolbar'
    ) {
      hasGlobalToolbarQuery = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    constructionCount,
    adjacentBindingCount,
    hasGlobalToolbarQuery
  };
}

class DetailEvent<T> extends Event {
  constructor(
    type: string,
    readonly detail: T
  ) {
    super(type);
  }
}

describe('TransformInteraction 多 Earth 隔离', () => {
  it('只检查当前地图的动态绘制交互', () => {
    const interaction = Object.create(TransformInteraction.prototype) as any;
    interaction.getFeatureAtPixel_ = () => ({});
    const currentMap = { getInteractions: () => ({ forEach: () => undefined }) };

    expect(interaction.checkDynmicDraw_({ map: currentMap, pixel: [0, 0] })).toBe(false);
  });

  it('通过稳定方法暴露控制框并刷新手柄', () => {
    const interaction = Object.create(TransformInteraction.prototype) as any;
    const bbox = {};
    interaction.bbox_ = bbox;
    interaction.drawSketch_ = vi.fn();

    interaction.refreshSketch(true);

    expect(interaction.getBoundingBoxFeature()).toBe(bbox);
    expect(interaction.drawSketch_).toHaveBeenCalledWith(true);
  });

  it('暴露每个 Toolbar 实例自己的根元素', () => {
    const firstRoot = new EventTarget();
    const secondRoot = new EventTarget();
    const firstToolbar = Object.create(Toolbar.prototype) as any;
    const secondToolbar = Object.create(Toolbar.prototype) as any;
    firstToolbar.rootEl = firstRoot;
    secondToolbar.rootEl = secondRoot;

    expect(firstToolbar.getRootElement()).toBe(firstRoot);
    expect(secondToolbar.getRootElement()).toBe(secondRoot);
  });

  it('只响应当前 Transform 所属 Toolbar 根元素的事件', () => {
    const firstRoot = new EventTarget();
    const secondRoot = new EventTarget();
    const firstToolbar = { getRootElement: () => firstRoot } as any;
    const secondToolbar = { getRootElement: () => secondRoot } as any;
    const firstTransform = Object.create(Transform.prototype) as any;
    const secondTransform = Object.create(Transform.prototype) as any;
    firstTransform.baseTransformTipFlag = 'first';
    secondTransform.baseTransformTipFlag = 'second';
    firstTransform.updateHelpTooltip = vi.fn();
    secondTransform.updateHelpTooltip = vi.fn();
    firstTransform.handleToolbarClick = vi.fn();
    secondTransform.handleToolbarClick = vi.fn();

    firstTransform.bindToolbarEvents(firstToolbar);
    secondTransform.bindToolbarEvents(secondToolbar);

    const enterDetail = { key: 'remove', item: { title: '删除' } };
    const detail = { key: 'remove', item: enterDetail.item, pixel: [12, 34] };
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itementer', enterDetail));
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itemleave', enterDetail));
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itemclick', detail));

    expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('删除');
    expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('first');
    expect(firstTransform.handleToolbarClick).toHaveBeenCalledWith(detail, detail.pixel);
    expect(secondTransform.updateHelpTooltip).not.toHaveBeenCalled();
    expect(secondTransform.handleToolbarClick).not.toHaveBeenCalled();
  });

  it('通过当前 Toolbar 实例绑定事件且不再查询全局根元素', async () => {
    const source = await readFile('src/components/Transform.ts', 'utf8');
    const analysis = analyzeToolbarBindings(source);

    expect(analysis.hasGlobalToolbarQuery).toBe(false);
    expect(analysis.constructionCount).toBe(2);
    expect(analysis.adjacentBindingCount).toBe(analysis.constructionCount);
  });

  it('工具栏架构检查不依赖换行格式或字符串引号', () => {
    const analysis = analyzeToolbarBindings(`
      this.toolbar = new Toolbar(
        opts,
        this.earth
      );
      this.bindToolbarEvents(this.toolbar);
      document.querySelector(".ol-toolbar");
    `);

    expect(analysis.constructionCount).toBe(1);
    expect(analysis.adjacentBindingCount).toBe(1);
    expect(analysis.hasGlobalToolbarQuery).toBe(true);
  });
});
