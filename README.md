# Notion2WeChat

A Chrome extension that converts Notion pages into WeChat-ready HTML optimized for iOS reading. It renders a live preview in a right-side drawer and copies both `text/html` and `text/plain` to the clipboard for clean pasting in the WeChat editor.

## Features

- One-click conversion from Notion DOM to WeChat-compatible HTML
- iOS-optimized typography (line-height, spacing, font stack)
- Themes: Default, 菠萝红, 简约蓝, 科技黑, 少数派
- Reference list generation for hyperlinks (inline `[n]` + reference section)
- Works directly on Notion pages without login or API access

## Setup

1. Install dependencies

```bash
npm install
```

2. Build the extension

```bash
npm run build
```

3. Load in Chrome
- Open `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select this folder

## Usage

1. Open a Notion page at `https://www.notion.so/*`
2. Click the extension icon to open the drawer
3. Choose a theme and font, adjust size if needed
4. Click `复制为公众号格式` to copy the content
5. Paste into the WeChat editor

## Development

```bash
npm run dev
```

## Notes

- Notion DOM structure can change; some blocks may require future tuning.
- Only `https://www.notion.so/*` is currently supported.
