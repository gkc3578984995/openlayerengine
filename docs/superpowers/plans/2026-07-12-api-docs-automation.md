# API Documentation Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Generate PointLayer API method facts from TypeDoc and retain the existing documentation UI.

**Architecture:** TypeDoc produces JSON and Markdown in one run. A tested Node normalizer produces a generated TypeScript module; an editorial config supplies Chinese descriptions, and a composable turns both sources into the current table row shape.

**Tech Stack:** TypeDoc 0.28, Node.js ESM, Vue 3, Vitest.

## Tasks

1. Add a failing fixture-based normalizer test, then implement the TypeDoc normalizer and generator script.
2. Add editorial/composable modules and migrate the PointLayer method table without modifying `ApiTable.vue`.
3. Wire `api:sync`, `api:check`, and the single `docs:build` command; run tests and the full document build.
