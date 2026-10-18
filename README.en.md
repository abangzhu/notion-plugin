# Notion2WeChat

A Chrome Extension that converts Notion / Feishu (Lark) pages into publishable content — WeChat-optimized HTML, Markdown, and AI-powered translation powered by OpenAI.

## Features

- One-click copy as WeChat Official Account format (images auto-converted to Base64, ready to paste into WeChat editor)
- One-click copy as Markdown
- AI one-click translation of Notion page content (Chinese / English bidirectional)
- AI formatting with inline emphasis, highlight cards, quotes, and step lists; reformat or clear formatting when needed
- AI illustration generation with cancellation and removal of generated images while keeping the current formatting
- Two AI translation modes: `Quick` / `Normal`
- Toggle between `Original / Translated` preview
- Toggle between `WeChat / Markdown` preview formats
- After translation, preview content can be copied as WeChat format or Markdown
- Settings for API keys, OpenAI / LiteLLM-compatible endpoints, separate language and image models, target language, audience, style presets, glossary, and more
- Model list from [`src/translation-models.json`](./src/translation-models.json), easily extensible
- Translation prompt templates in `src/prompts/`, developers can adjust prompts and constraints directly
- 14 built-in themes: `Apple White`, `Bauhaus`, `Swiss Grid`, `Warm Paper`, `Mist Blue`, `Default`, `Notion White`, `Matcha Planner`, `Academia Archive`, `Bento OS`, `Vibrant Orange`, `Ocean Blue`, `Tech Black`, `Magic Red`
- Font switching and font size scaling
- Automatic link reference numbering (inline `[n]` + footnote references)
- Real-time preview in a slide-out drawer
  - Click `WeChat`: preview WeChat HTML output
  - Click `Markdown`: preview Markdown text
  - Click `Translate`: generate translation and switch to translated preview

## Image Handling

When the drawer opens, the extension automatically preloads all images on the page and converts them to Base64 data URIs. When copying as WeChat format, images are already embedded as Base64 in the HTML — they display correctly when pasted into the WeChat editor with no dependency on external image URLs.

- Progress is shown in the status bar during loading (e.g., `Loading images 2/5`)
- Failed images fall back to their original URL with a failure count notification
- Images are automatically reloaded when switching pages or refreshing

## Long Notion Pages

Notion mounts only part of a long page around the current reading position. The extension scans from the top in overlapping windows, accumulates blocks in document order using `data-block-id` for deduplication, and restores the original scroll position. The page may scroll briefly when opening or refreshing the drawer; extraction should cover the same content regardless of the starting position.

If content is missing, first check the extension's loaded directory, then reload the extension and refresh the Notion page. See the [version consolidation and acceptance checklist](./docs/version-consolidation.md).

## Feishu Document Support

Supports both Feishu `/docx/` and `/wiki/` page paths with a tiered extraction strategy:

1. **Data extraction** (preferred for `/docx/` pages) — A MAIN world script reads `window.DATA.clientVars.data.block_map` to get the full document structure directly, bypassing virtual scrolling
2. **Scroll-based accumulation** (fallback for `/wiki/` pages) — Feishu wiki pages use virtual scrolling and don't expose a global data object. The extension automatically scrolls from top to bottom, collecting visible DOM blocks at each step and deduplicating via content hashing to assemble the full document

Both strategies are transparent to the user — the optimal path is chosen automatically when the drawer opens.

## Supported Content Formats

- List (ordered / unordered)
- Heading (H1 / H2 / H3)
- Image
- Code (language detection, macOS window decoration, Notion native code block support)
- Quote
- Callout
- Divider
- Table (header row detection)
- Paragraph / Link / Bold / Italic / Strikethrough / Underline / Highlight / Inline Code

## AI Translation

- Translation powered by the OpenAI official SDK
- Supports the OpenAI API and OpenAI-compatible gateways such as LiteLLM, with separate language and image model settings
- Target language toggle: `Chinese / English`
- Target audience selection: `General / Technical / Academic / Business`
- Style presets: `Narrative / Formal / Technical / Literal / Academic / Business / Humorous / Conversational / Elegant`
- Custom glossary, preserved terms, and extra instructions
- Session-level translation cache — identical source + settings combinations are instantly restored
- Categorized error messages on translation failure (invalid API key, rate limit, timeout, etc.) with a retry button

## Translation Settings

Before using translation for the first time, configure the following in the settings panel:

- `API Key`
- `API URL` (optional; leave empty for the official OpenAI endpoint)
- `Model`
- `Target Language`
- `Translation Mode`
- `Target Audience`
- `Style Preset`
- `Glossary`
- `Preserved Terms`
- `Extra Instructions`
- `Chunk Threshold`
- `Max Units per Chunk`

## Installation & Usage

1. Install dependencies

```bash
npm install
```

2. Build the extension

```bash
npm run build
```

3. Load the extension in Chrome

- Open `chrome://extensions`
- Enable `Developer mode`
- Click `Load unpacked`
- On this development machine, select `/Users/andrewwong/dev/ClaudeCode/Notion-Plugin`; on other machines, select your own project directory
- Keep only this extension copy enabled. `/Users/andrewwong/Documents/ClaudeCode/Notion-Plugin` is retained as the old copy and should no longer be loaded or used for development
- After rebuilding, reload the extension in Chrome, then refresh any open Notion / Feishu pages

4. Usage

- Navigate to any Notion (`https://www.notion.so/*`, `https://app.notion.com/*`) or Feishu (`https://*.feishu.cn/docx/*`, `https://*.feishu.cn/wiki/*`) page
- Click the extension icon to open the side drawer
- Choose theme / font / font size
- Use as needed:
  - `Copy as WeChat format`
  - `Copy as Markdown`
  - `Translate`
  - `Smart Formatting`
  - `Smart Illustrations`
  - `Settings`

5. Using Translation

- Click `Settings` in the top-right corner
- Enter your OpenAI `API Key`
- Select model and translation parameters
- Return to the drawer and click `Translate`
- Switch between `Original / Translated` and `WeChat / Markdown` views

## Development

Use `/Users/andrewwong/dev/ClaudeCode/Notion-Plugin` as the sole development directory on this machine. The consolidated local version is `1.2.1`; see the [consolidation record](./docs/version-consolidation.md) for the separate local and remote states.

```bash
npm run dev            # Watch mode
npm test               # All regression tests
npm run test:layout    # Formatting rule tests
npm run test:coverage  # Compiled test bundle coverage
npm run typecheck      # TypeScript type checking
npm run build          # Production build
```

The test entry point, `scripts/test.mjs`, uses the existing esbuild dependency to compile TypeScript tests into a temporary directory and runs them with Node's built-in test runner. No additional test dependency is required. Coverage measures compiled bundles, not source-level or whole-product coverage.

## Notes

- Supports Notion web (including `https://www.notion.so/*` and `https://app.notion.com/*`) and Feishu / Lark documents (`https://*.feishu.cn/docx/*`, `https://*.feishu.cn/wiki/*`).
- Translation and illustration generation use the configured OpenAI or compatible endpoint.
- If Notion's or Feishu's DOM structure changes, some block extraction rules may need updating.
