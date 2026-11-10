import assert from "node:assert/strict";
import test from "node:test";

import { renderDocToHtml } from "../src/renderer";
import { MODERN_THEME_PRESETS } from "../src/theme-presets";
import { mergeRenderOptions } from "../src/theme";
import { THEME_SKINS } from "../src/theme-skins";
import type { Block, Doc } from "../src/types";

const optionsFor = (themeId: string) => {
  const preset = MODERN_THEME_PRESETS.find((theme) => theme.id === themeId)!;
  const options = mergeRenderOptions({ themeId });
  return {
    ...options,
    colors: { ...options.colors, ...preset.colors },
    typography: { ...options.typography, ...preset.typography, bodySize: "16px" }
  };
};

const text = (content: string) => ({ type: "text" as const, content });
const h2 = (content: string): Block => ({ type: "heading", level: 2, children: [text(content)] });

const sample: Doc = { title: "标题", blocks: [
  h2("为什么"),
  { type: "paragraph", children: [text("正文"), { type: "bold", content: "重点" }] },
  { type: "quote", children: [text("引用")] },
  { type: "callout", icon: "💡", children: [text("提示")] },
  { type: "emphasis", children: [text("结论")] },
  { type: "divider" },
  h2("怎么做"),
  { type: "steps", ordered: true, items: [{ children: [text("第一步")] }, { children: [text("第二步")] }] },
  { type: "table", rows: [{ isHeader: true, cells: [{ children: [{ type: "bold", content: "表头" }] }] }, { cells: [{ children: [text("单元格")] }] }] },
  { type: "code", language: "ts", code: "const a = 1;" }
] };

// 结构签名：去掉颜色值，只看样式属性与结构，用于判断主题之间不是"只换颜色"
const structureSignature = (html: string): string =>
  html
    .replace(/#[0-9a-fA-F]{3,8}/g, "#")
    .replace(/rgba?\([^)]*\)/g, "rgb")
    .replace(/font-family:[^;]+;/g, "font-family;");

test("every modern theme has a skin and a structurally distinct layout, not just different colors", () => {
  const signatures = new Map<string, string>();
  for (const preset of MODERN_THEME_PRESETS) {
    assert.ok(THEME_SKINS[preset.id], `${preset.id} has a skin`);
    const signature = structureSignature(renderDocToHtml(sample, optionsFor(preset.id)));
    for (const [otherId, other] of signatures) assert.notEqual(signature, other, `${preset.id} vs ${otherId}`);
    signatures.set(preset.id, signature);
  }
});

test("each modern theme has its own chapter heading style", () => {
  const extract = (html: string, tag: string) =>
    structureSignature(html.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))?.[0] ?? "");
  const pairs = MODERN_THEME_PRESETS.map((preset) => {
    const html = renderDocToHtml(sample, optionsFor(preset.id));
    return { id: preset.id, h2: extract(html, "h2") };
  });
  const unique = new Set(pairs.map((pair) => pair.h2));
  assert.equal(unique.size, pairs.length, "every theme has its own chapter heading style");
});

test("modern themes only use WeChat-safe inline styles", () => {
  for (const preset of MODERN_THEME_PRESETS) {
    const html = renderDocToHtml(sample, optionsFor(preset.id));
    assert.doesNotMatch(html, /<svg|display:flex|box-shadow|position:(?:absolute|fixed)|class="/, preset.id);
    assert.doesNotMatch(html, /undefined|NaN/, preset.id);
  }
});

test("numbered chapter styles add 01/02 only when the author did not number chapters", () => {
  const auto = renderDocToHtml(sample, optionsFor("magazine"));
  assert.match(auto, /<h2[^>]*>[\s\S]*?>01<\/span>[\s\S]*?为什么/);
  assert.match(auto, /<h2[^>]*>[\s\S]*?>02<\/span>[\s\S]*?怎么做/);

  const authored = renderDocToHtml(
    { blocks: [h2("一、为什么"), { type: "paragraph", children: [text("正文")] }, h2("二、怎么做")] },
    optionsFor("magazine")
  );
  assert.doesNotMatch(authored, />0[12]<\/span>/);

  const single = renderDocToHtml({ blocks: [h2("唯一章节")] }, optionsFor("bauhaus"));
  assert.doesNotMatch(single, />01<\/span>/, "a lone chapter is not numbered");
});

test("text on solid accent blocks stays readable (no accent-on-accent bold)", () => {
  const doc: Doc = { blocks: [
    { type: "heading", level: 2, children: [text("章节"), { type: "bold", content: "加粗" }] },
    { type: "heading", level: 2, children: [text("章节二")] }
  ] };
  const tech = optionsFor("tech");
  const html = renderDocToHtml(doc, tech);
  const pill = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/)![0];
  assert.match(pill, new RegExp(`background:${tech.colors.link}`));
  const strong = pill.match(/<strong style="([^"]*)"/)![1];
  assert.doesNotMatch(strong, new RegExp(`color:${tech.colors.link}`));

  const table = renderDocToHtml(sample, tech).match(/<th[\s\S]*?<\/th>/)![0];
  assert.doesNotMatch(table.match(/<strong style="([^"]*)"/)![1], new RegExp(`color:${tech.colors.link}`));
});

test("inline code and highlights on solid accent blocks do not inherit white text on a light background", () => {
  const tech = optionsFor("tech");
  const html = renderDocToHtml({ blocks: [
    { type: "heading", level: 2, children: [text("运行"), { type: "code", content: "npm" }, { type: "highlight", content: "重点", highlightColor: "#fef08a" }] },
    { type: "heading", level: 2, children: [text("第二章")] }
  ] }, tech);
  const pill = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/)![0];
  assert.doesNotMatch(pill, new RegExp(`<code style="[^"]*background:${tech.colors.inlineCodeBg}`));
  assert.match(pill, /<mark style="[^"]*color:#1f1f1f;/);
});

test("step badges never wrap and use a hanging indent for multi-line steps", () => {
  for (const preset of MODERN_THEME_PRESETS) {
    const html = renderDocToHtml(sample, optionsFor(preset.id));
    const step = html.match(/<p style="[^"]*text-indent:-34px;[^"]*">[\s\S]*?<\/p>/);
    assert.ok(step, preset.id);
    assert.match(step[0], /padding-left:34px;/, preset.id);
    assert.match(step[0], /white-space:nowrap;/, preset.id);
  }
});
