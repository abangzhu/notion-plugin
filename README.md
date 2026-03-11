# Notion2WeChat

将 Notion / 飞书页面内容一键转换为可发布内容的 Chrome 扩展，支持公众号 HTML、Markdown，以及基于 OpenAI 的文档翻译预览。

## 功能列表

- 一键复制为公众号格式（图片自动转为 Base64 内嵌，粘贴到微信编辑器可直接显示）
- 一键复制为 Markdown 格式
- AI一键翻译当前 Notion 页面内容（支持中英文互译）
- 支持 `Quick` / `Normal` 两种 AI 翻译模式
- 支持 `原文 / 译文` 预览切换
- 支持 `公众号 / Markdown` 两种预览格式切换
- 翻译完成后，当前预览内容可继续复制为公众号格式或 Markdown
- 顶部设置面板支持配置 OpenAI API Key、ChatGPT 系列模型、目标语言、目标读者、风格预设、术语表等
- 模型列表来自 [`src/translation-models.json`](./src/translation-models.json)，可自行扩展
- 翻译提示词模板位于 `src/prompts/`，开发者可直接调整 prompt 文案与翻译约束
- 支持 5 套主题：`默认主题`、`活力橙`、`海蓝色`、`科技黑`、`魔力红`
- 支持字体切换与字号缩放
- 支持链接引用自动编号（文内 `[n]` + 文末参考资料）
- 右侧抽屉实时预览
  - 点击 `公众号`：预览公众号 HTML 效果
  - 点击 `Markdown`：预览 Markdown 文本效果
  - 点击 `翻译`：生成译文并切换到译文预览

## 图片处理

打开抽屉时，扩展会自动预加载页面中的所有图片并转为 Base64 data URI。复制为公众号格式时，HTML 中的图片已内嵌 Base64，粘贴到微信编辑器可直接显示，无需依赖外部图片链接。

- 加载过程中状态栏会显示进度（如 `图片加载中 2/5`）
- 加载失败的图片会保留原始 URL 并提示失败数量
- 切换页面或刷新时自动重新加载

## 已支持内容格式

- List（有序/无序）
- Heading（H1/H2/H3）
- Image
- Code（支持语言检测、macOS 窗口装饰、Notion 原生代码块识别）
- Quote
- Callout
- Divider
- Table（支持表头检测）
- Paragraph / Link / Bold / Italic / Strikethrough / Underline / Highlight / Inline Code

## 翻译能力

- 翻译服务基于 OpenAI 官方 SDK
- 目前支持 OpenAI 官方接口
- 支持目标语言切换：`中文 / English`
- 支持目标读者选择：`通用读者 / 技术读者 / 学术读者 / 商业读者`
- 支持风格预设选择：`叙事感 / 正式 / 技术 / 直译 / 学术 / 商业 / 幽默 / 口语化 / 优雅`
- 支持术语表、保留术语、额外说明
- 支持会话级译文缓存，同一原文与设置组合可直接恢复
- 翻译失败时显示分类错误提示（API Key 无效、配额超限、超时等），并提供重试按钮

## 翻译设置

首次使用翻译功能时，请先在设置面板配置：

- `API Key`
- `模型`
- `目标语言`
- `翻译模式`
- `目标读者`
- `风格预设`
- `术语表`
- `保留术语`
- `额外说明`
- `分块阈值`
- `每块最大单元数`

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
- 打开 Notion（`https://www.notion.so/*`）或飞书（`https://*.feishu.cn/docx/*`、`https://*.feishu.cn/wiki/*`）页面
- 点击扩展图标打开右侧抽屉
- 选择主题 / 字体 / 字号
- 按需点击：
  - `复制为公众号格式`
  - `复制为 Markdown`
  - `翻译`
  - `设置`

5. 使用翻译
- 点击右上角 `设置`
- 填写 OpenAI `API Key`
- 选择模型和翻译参数
- 返回抽屉点击 `翻译`
- 在 `原文 / 译文` 与 `公众号 / Markdown` 之间切换预览

## 开发命令

```bash
npm run dev
npm run typecheck
npm run build
```

## 说明

- 支持 Notion 网页端（`https://www.notion.so/*`）和飞书文档（`https://*.feishu.cn/docx/*`、`https://*.feishu.cn/wiki/*`）。
- 翻译能力当前基于 OpenAI 官方接口。
- Notion / 飞书 DOM 结构变更时，个别 block 提取规则可能需要更新。
