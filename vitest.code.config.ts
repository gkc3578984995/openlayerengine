import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: ['test/*Docs.test.ts', 'test/Website*.test.ts', 'test/ApiDocGenerator.test.ts', 'test/LayerCommonDemoCoverage.test.ts']
    }
  })
);
