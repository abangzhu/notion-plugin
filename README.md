# Notion2WeChat

将 Notion 页面内容一键转换为可发布内容的 Chrome 扩展，支持公众号 HTML、Markdown，以及基于 OpenAI 的文档翻译预览。

## 功能列表

- 一键复制为公众号格式
- 一键复制为 Markdown 格式
- 一键翻译当前 Notion 页面内容
- 支持 `Quick` / `Normal` 两种翻译模式
- 支持 `原文 / 译文` 预览切换
- 支持 `公众号 / Markdown` 两种预览格式切换
- 翻译完成后，当前预览内容可继续复制为公众号格式或 Markdown
- 顶部设置面板支持配置 OpenAI API Key、模型、目标语言、目标读者、风格预设、术语表等
- 模型列表来自 [`src/translation-models.json`](./src/translation-models.json)，可自行扩展
- 支持 5 套主题：`默认主题`、`活力橙`、`海蓝色`、`科技黑`、`魔力红`
- 支持字体切换与字号缩放
- 支持链接引用自动编号（文内 `[n]` + 文末参考资料）
- 右侧抽屉实时预览
  - 点击 `公众号`：预览公众号 HTML 效果
  - 点击 `Markdown`：预览 Markdown 文本效果
  - 点击 `翻译`：生成译文并切换到译文预览

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

## 翻译能力

- 翻译服务基于 OpenAI 官方 SDK
- 目前支持 OpenAI 官方接口
- 支持目标语言切换：`中文 / English`
- 支持目标读者选择：`通用读者 / 技术读者 / 学术读者 / 商业读者`
- 支持风格预设选择：`叙事感 / 正式 / 技术 / 直译 / 学术 / 商业 / 幽默 / 口语化 / 优雅`
- 支持术语表、保留术语、额外说明
- 支持会话级译文缓存，同一原文与设置组合可直接恢复

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
- 打开 `https://www.notion.so/*` 页面
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

- 目前仅支持 Notion 网页端（`https://www.notion.so/*`）。
- 翻译能力当前基于 OpenAI 官方接口。
- Notion DOM 结构变更时，个别 block 提取规则可能需要更新。
