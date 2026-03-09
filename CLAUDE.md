# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Notion2WeChat — a Chrome Extension (Manifest V3) that converts Notion pages into WeChat-optimized HTML/Markdown with AI-powered translation. Built with pure TypeScript (no framework), bundled with esbuild, using the OpenAI SDK for translation.

## Commands

```bash
npm run build       # Production build → dist/background.js + dist/content.js
npm run dev         # Watch mode (rebuilds on file change)
npm run typecheck   # TypeScript type checking (tsc --noEmit)
```

No test framework, linter, or formatter is configured.

## Build Details

- **Bundler:** esbuild targeting Chrome 114 (ES2020, ESM format)
- **Entry points:** `src/background.ts` and `src/content.ts` → `dist/`
- **Special loader:** `.md` files are loaded as text strings (used for prompt templates in `src/prompts/`)
- **Type declarations:** `src/md.d.ts` declares `*.md` modules as strings

## Architecture

### Extension Structure (Manifest V3)

- **Background service worker** (`background.ts`) — Manages translation jobs via OpenAI API, persists job state in `chrome.storage.session`, communicates with content script through `chrome.runtime.Port`
- **Content script** (`content.ts`) — Minimal entry point, injects the UI drawer into Notion pages and listens for extension icon click messages

### Data Pipeline

```
Notion DOM → extractor → Doc → renderer → HTML/Markdown
                          ↓
                    translation → translated Doc → renderer
```

1. **`extractor.ts`** — Parses Notion's DOM into a structured `Doc` (defined in `types.ts`). Handles headings, paragraphs, lists, tables, images, code blocks, callouts, quotes, and inline formatting
2. **`renderer.ts`** — Converts `Doc` to WeChat-optimized HTML (inline styles, link reference numbering) or Markdown. Implements 5 theme presets with custom typography
3. **`translation.ts`** — Orchestration layer: serializes Doc to XML for translation, parses translated XML back, applies translations to document structure. Also handles language detection and document hashing for cache invalidation
4. **`translation-service.ts`** — OpenAI API client with retry logic (2 attempts, 90s timeout), document chunking for large docs, and two-phase flow (analysis → translation in Normal mode)

### Supporting Files

- **`types.ts`** — `Doc`/`Block`/`Inline` discriminated union types (the core data model)
- **`theme.ts`** — Theme presets (default, 活力橙, 海蓝色, 科技黑, 魔力红) and font stacks
- **`translation-config.ts`** — Model config, target language options, audience/style presets
- **`translation-models.json`** — Available translation models (loaded at build time)
- **`clipboard.ts`** — Clipboard write utilities (HTML + plain text)
- **`src/prompts/*.md`** — Translation prompt templates (inlined as strings by esbuild)

### UI (`ui.ts`)

The largest file (~2k lines). Manages the entire drawer interface: theme/font/size controls, translation state machine (idle → translating → success/error), preview switching (original/translated, wechat/markdown), settings panel for OpenAI config, and translation caching with TTL.

### Communication Pattern

Content script ↔ Background worker communication uses `chrome.runtime.connect()` ports. The background worker broadcasts translation progress to all subscribed UI instances. Translation jobs are persisted in `chrome.storage.session` and restored on service worker restart.

### Key Conventions

- All configuration (API keys, model settings) stored via Chrome Storage API — no `.env` files
- `structuredClone` used extensively for immutable document transformations
- Chinese (zh-CN) is the primary UI language
- Host permissions include Notion domains, AWS/CloudFront (for images), and OpenAI API
