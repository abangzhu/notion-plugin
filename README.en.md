# Notion2WeChat

A Chrome Extension that converts Notion pages into publishable content — WeChat-optimized HTML, Markdown, and AI-powered translation powered by OpenAI.

## Features

- One-click copy as WeChat Official Account format (images auto-converted to Base64, ready to paste into WeChat editor)
- One-click copy as Markdown
- AI one-click translation of Notion page content (Chinese / English bidirectional)
- Two AI translation modes: `Quick` / `Normal`
- Toggle between `Original / Translated` preview
- Toggle between `WeChat / Markdown` preview formats
- After translation, preview content can be copied as WeChat format or Markdown
- Settings panel for OpenAI API Key, ChatGPT model series, target language, audience, style presets, glossary, and more
- Model list from [`src/translation-models.json`](./src/translation-models.json), easily extensible
- Translation prompt templates in `src/prompts/`, developers can adjust prompts and constraints directly
- 5 built-in themes: `Default`, `Vibrant Orange`, `Ocean Blue`, `Tech Black`, `Magic Red`
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

## Supported Content Formats

- List (ordered / unordered)
- Heading (H1 / H2 / H3)
- Image
- Code
- Quote
- Callout
- Divider
- Table
- Paragraph / Link / Bold / Italic / Inline Code

## AI Translation

- Translation powered by the OpenAI official SDK
- Currently supports the OpenAI API
- Target language toggle: `Chinese / English`
- Target audience selection: `General / Technical / Academic / Business`
- Style presets: `Narrative / Formal / Technical / Literal / Academic / Business / Humorous / Conversational / Elegant`
- Custom glossary, preserved terms, and extra instructions
- Session-level translation cache — identical source + settings combinations are instantly restored

## Translation Settings

Before using translation for the first time, configure the following in the settings panel:

- `API Key`
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
- Select this project directory

4. Usage
- Navigate to any `https://www.notion.so/*` page
- Click the extension icon to open the side drawer
- Choose theme / font / font size
- Use as needed:
  - `Copy as WeChat format`
  - `Copy as Markdown`
  - `Translate`
  - `Settings`

5. Using Translation
- Click `Settings` in the top-right corner
- Enter your OpenAI `API Key`
- Select model and translation parameters
- Return to the drawer and click `Translate`
- Switch between `Original / Translated` and `WeChat / Markdown` views

## Development

```bash
npm run dev         # Watch mode
npm run typecheck   # TypeScript type checking
npm run build       # Production build
```

## Notes

- Currently supports Notion web only (`https://www.notion.so/*`).
- Translation is powered by the OpenAI API.
- If Notion's DOM structure changes, some block extraction rules may need updating.
