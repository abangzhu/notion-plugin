# Notion2WeChat

将 Notion / 飞书页面内容一键转换为可发布内容的 Chrome 扩展，支持公众号 HTML、Markdown，以及基于 OpenAI 的文档翻译预览。

## 功能列表

- 一键复制为公众号格式（图片自动转为 Base64 内嵌，粘贴到微信编辑器可直接显示）
- 一键复制为 Markdown 格式
- AI一键翻译当前 Notion 页面内容（支持中英文互译）
- AI 智能排版：段内强调、重点卡片、引用与步骤列表；支持重新排版和清空排版
- AI 智能配图：支持取消生成、移除已生成配图，并保留当前排版
- 支持 `Quick` / `Normal` 两种 AI 翻译模式
- 支持 `原文 / 译文` 预览切换
- 支持 `公众号 / Markdown` 两种预览格式切换
- 翻译完成后，当前预览内容可继续复制为公众号格式或 Markdown
- 顶部设置面板支持配置 API Key、OpenAI / LiteLLM 等兼容接口地址、语言模型、图片模型、目标语言、目标读者、风格预设、术语表等
- 模型列表来自 [`src/translation-models.json`](./src/translation-models.json)，可自行扩展
- 翻译提示词模板位于 `src/prompts/`，开发者可直接调整 prompt 文案与翻译约束
- 支持 14 套主题：`苹果白`、`包豪斯`、`瑞士网格`、`暖纸`、`雾蓝`、`默认主题`、`Notion 白`、`抹茶计划`、`学院档案`、`Bento OS`、`活力橙`、`海蓝色`、`科技黑`、`魔力红`
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

## Notion 长文章提取

Notion 长文章会按阅读位置挂载部分正文。扩展从顶部逐屏扫描，按 `data-block-id` 去重并按文章顺序累积内容，再恢复原阅读位置。打开抽屉或刷新时可能短暂看到页面滚动；提取范围不应取决于打开抽屉时停留的位置。

遇到缺段时，先确认 Chrome 加载的是当前开发目录，并在重新加载扩展后刷新 Notion 页面。具体检查步骤见[版本整合与验收记录](./docs/version-consolidation.md)。

## 飞书文档支持

支持飞书 `/docx/` 和 `/wiki/` 两种页面路径，采用分级提取策略：

1. **数据提取**（`/docx/` 页面优先）— 通过 MAIN world 脚本读取 `window.DATA.clientVars.data.block_map`，直接获取完整文档结构，绕过虚拟滚动限制
2. **滚动累积提取**（`/wiki/` 页面回退）— 飞书 wiki 页面使用虚拟滚动且不暴露全局数据对象，扩展会自动从页面顶部滚动到底部，逐步采集可见 DOM 块并通过内容哈希去重，最终拼合完整文档

两种策略对用户透明，打开抽屉后自动选择最优路径。

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
- 支持 OpenAI 官方接口及 LiteLLM 等 OpenAI 兼容网关；可单独配置语言模型与图片模型
- 支持目标语言切换：`中文 / English`
- 支持目标读者选择：`通用读者 / 技术读者 / 学术读者 / 商业读者`
- 支持风格预设选择：`叙事感 / 正式 / 技术 / 直译 / 学术 / 商业 / 幽默 / 口语化 / 优雅`
- 支持术语表、保留术语、额外说明
- 支持会话级译文缓存，同一原文与设置组合可直接恢复
- 翻译失败时显示分类错误提示（API Key 无效、配额超限、超时等），并提供重试按钮

## 翻译设置

首次使用翻译功能时，请先在设置面板配置：

- `API Key`
- `API 地址`（可选，留空使用 OpenAI 官方接口）
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
- 本机统一选择 `/Users/andrewwong/dev/ClaudeCode/Notion-Plugin`；其他机器选择自己的项目目录
- 本机只保留这一份扩展启用，`/Users/andrewwong/Documents/ClaudeCode/Notion-Plugin` 保留为旧副本，不再加载或迭代
- 每次重新构建后，先在扩展管理页点击重新加载，再刷新已打开的 Notion / 飞书页面

4. 使用

- 打开 Notion（`https://www.notion.so/*`、`https://app.notion.com/*`）或飞书（`https://*.feishu.cn/docx/*`、`https://*.feishu.cn/wiki/*`）页面
- 点击扩展图标打开右侧抽屉
- 选择主题 / 字体 / 字号
- 按需点击：
  - `复制为公众号格式`
  - `复制为 Markdown`
  - `翻译`
  - `智能排版`
  - `智能配图`
  - `设置`

5. 使用翻译

- 点击右上角 `设置`
- 填写 OpenAI `API Key`
- 选择模型和翻译参数
- 返回抽屉点击 `翻译`
- 在 `原文 / 译文` 与 `公众号 / Markdown` 之间切换预览

## 开发命令

本机后续开发统一在 `/Users/andrewwong/dev/ClaudeCode/Notion-Plugin` 进行。当前整合版本为 `1.2.1`，本地版本与远端状态分别见[整合记录](./docs/version-consolidation.md)。

```bash
npm run dev            # 监听源码变化并构建
npm test               # 全部回归测试
npm run test:layout    # 智能排版规则测试
npm run test:coverage  # 测试 bundle 覆盖率
npm run typecheck      # TypeScript 类型检查
npm run build          # 生产构建
```

测试入口为 `scripts/test.mjs`，使用已有 esbuild 将 TypeScript 测试编译到临时目录，再交给 Node 内置测试运行器执行，无需新增测试依赖。覆盖率统计对象是编译后的 bundle，不能直接视为源码或整个产品的覆盖率。

## 说明

- 支持 Notion 网页端（包括 `https://www.notion.so/*`、`https://app.notion.com/*`）和飞书文档（`https://*.feishu.cn/docx/*`、`https://*.feishu.cn/wiki/*`）。
- 翻译及配图通过配置的 OpenAI 或兼容接口执行。
- Notion / 飞书 DOM 结构变更时，个别 block 提取规则可能需要更新。
