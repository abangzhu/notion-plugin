# Notion2WeChat

将 Notion 页面内容一键转换为可发布内容的 Chrome 扩展，支持公众号 HTML 与 Markdown 两种复制格式。

## 功能列表

- 一键复制为公众号格式
- 一键复制为 Markdown 格式
- 支持 5 套主题：`默认主题`、`活力橙`、`海蓝色`、`科技黑`、`魔力红`
- 支持字体切换与字号缩放
- 支持链接引用自动编号（文内 `[n]` + 文末参考资料）
- 右侧抽屉实时预览
  - 点击 `复制为公众号格式`：预览公众号 HTML 效果
  - 点击 `复制为 Markdown`：预览 Markdown 文本效果

## 已支持内容格式

- List（有序/无序）
- Heading（H1/H2/H3）
- Image
- Code
- Quote
- Callout
- Divider
- Table
- Paragraph / Link / Bold / Italic / Inline Code

## 安装与使用

1. 安装依赖

```bash
npm install
```

2. 构建扩展

```bash
npm run build
```

3. 在 Chrome 加载扩展
- 打开 `chrome://extensions`
- 打开 `Developer mode`
- 点击 `Load unpacked`
- 选择本项目目录

4. 使用
- 打开 `https://www.notion.so/*` 页面
- 点击扩展图标打开右侧抽屉
- 选择主题 / 字体 / 字号
- 按需点击：
  - `复制为公众号格式`
  - `复制为 Markdown`

## 开发命令

```bash
npm run dev
npm run typecheck
npm run build
```

## 说明

- 目前仅支持 Notion 网页端（`https://www.notion.so/*`）。
- Notion DOM 结构变更时，个别 block 提取规则可能需要更新。
