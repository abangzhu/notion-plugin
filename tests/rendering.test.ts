import assert from "node:assert/strict";
import test from "node:test";

import { renderDocToHtml, renderDocToMarkdown } from "../src/renderer";
import { THEME_PRESETS } from "../src/theme-presets";
import { mergeRenderOptions } from "../src/theme";
import type { Doc, Inline } from "../src/types";

const optionsFor = (themeId: string, bodySize = "16px") => {
  const preset = THEME_PRESETS.find((theme) => theme.id === themeId)!;
  const options = mergeRenderOptions({ themeId });
  return {
    ...options,
    colors: { ...options.colors, ...preset.colors },
    typography: { ...options.typography, ...preset.typography, bodySize }
  };
};

test("code remains readable after changing font size in every theme, with one WeChat text leaf", () => {
  const doc: Doc = { blocks: [{ type: "code", code: 'const value = "<test>";\n  return value;', language: "typescript" }] };
  for (const theme of THEME_PRESETS) {
    for (const [bodySize, codeSize] of [["14px", "13px"], ["18px", "16px"]]) {
      const html = renderDocToHtml(doc, optionsFor(theme.id, bodySize));
      const code = html.match(/<code\b([^>]*)>([\s\S]*?)<\/code>/);
      assert.ok(code, theme.id);
      assert.match(html, new RegExp(`^<section[^>]*font-size:${codeSize};`), theme.id);
      assert.match(code[1], /font-size:inherit;/, theme.id);
      assert.match(code[1], /line-height:inherit;/, theme.id);
      assert.match(code[1], /white-space:pre-wrap;/, theme.id);
      assert.equal(code[2], '<span leaf="">const value = &quot;&lt;test&gt;&quot;;\n  return value;</span>', theme.id);
      assert.doesNotMatch(html, /font-size:90%|class="hljs/, theme.id);
    }
  }
});

test("article titles stay above chapter headings without changing Markdown heading semantics", () => {
  const doc: Doc = { title: "文章标题", blocks: [
    { type: "heading", level: 2, children: [{ type: "text", content: "章节标题" }] },
    { type: "heading", level: 3, children: [{ type: "text", content: "子章节标题" }] }
  ] };
  for (const themeId of ["apple", "bauhaus", "swiss", "paper", "mist"]) {
    const html = renderDocToHtml(doc, optionsFor(themeId));
    const headings = [...html.matchAll(/<h([123]) style="([^"]*)">([\s\S]*?)<\/h\1>/g)];
    assert.equal(headings.length, 3, themeId);
    assert.deepEqual(headings.map((heading) => heading[1]), ["1", "2", "3"], themeId);
    const sizes = headings.map((heading) => Number(heading[2].match(/font-size:(\d+)px/)?.[1]));
    assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], `${themeId}: ${sizes}`);
    assert.ok(sizes[1] >= 22 && sizes[1] <= 24, `${themeId}: chapter size ${sizes[1]}`);
    if (themeId === "apple") assert.match(headings[0][2], /color:#1d1d1f;/);
  }
  assert.equal(renderDocToMarkdown(doc), "## 章节标题\n\n### 子章节标题");
});

test("an existing title is rendered once while an H3-only article still gets clear chapter styling", () => {
  const doc: Doc = { title: "文章标题", blocks: [
    { type: "heading", level: 3, children: [{ type: "bold", content: "文章标题" }] },
    { type: "heading", level: 3, children: [{ type: "text", content: "章节标题" }] }
  ] };
  const html = renderDocToHtml(doc, optionsFor("apple"));
  assert.equal(html.match(/文章标题/g)?.length, 1);
  assert.match(html, /<h1[^>]*><span leaf=""><strong[^>]*>文章标题<\/strong><\/span><\/h1>/);
  assert.match(html, /<h2[^>]*font-size:22px;[^>]*>.*章节标题/);
  const withoutTitle = renderDocToHtml({ blocks: doc.blocks.slice(1) }, optionsFor("apple"));
  assert.match(withoutTitle, /<h2[^>]*font-size:22px;[^>]*>.*章节标题/);
});

test("Notion body-only H2 chapters are not promoted to oversized article titles", () => {
  const doc: Doc = { blocks: [
    { type: "heading", level: 2, children: [{ type: "text", content: "章节一" }] },
    { type: "heading", level: 3, children: [{ type: "text", content: "小节" }] },
    { type: "heading", level: 2, children: [{ type: "text", content: "章节二" }] }
  ] };
  for (const themeId of ["apple", "bauhaus", "swiss", "paper", "mist"]) {
    const html = renderDocToHtml(doc, optionsFor(themeId));
    assert.doesNotMatch(html, /<h1/);
    assert.equal([...html.matchAll(/<h2[^>]*font-size:22px;/g)].length, 2);
    assert.equal(renderDocToMarkdown(doc), "## 章节一\n\n### 小节\n\n## 章节二");
  }
  const explicitTitle = renderDocToHtml({ blocks: [
    { type: "heading", level: 1, children: [{ type: "text", content: "显式主标题" }] },
    ...doc.blocks
  ] }, optionsFor("apple"));
  assert.match(explicitTitle, /<h1[^>]*font-size:30px;[^>]*>.*显式主标题/);
});

test("all themes keep mixed inline text in WeChat leaf nodes across every text block", () => {
  const children: Inline[] = [{ type: "text", content: "正文" }, { type: "bold", content: "重点" }];
  const doc: Doc = { title: "文章标题", blocks: [
    { type: "heading", level: 2, children },
    { type: "paragraph", children },
    { type: "quote", children },
    { type: "quote", variant: "card", children },
    { type: "callout", icon: "💡", children },
    { type: "emphasis", children },
    { type: "steps", ordered: true, items: [{ children }] },
    { type: "list", ordered: false, items: [{ children }] },
    { type: "table", rows: [{ cells: [{ children }] }] }
  ] };
  for (const theme of THEME_PRESETS) {
    const html = renderDocToHtml(doc, optionsFor(theme.id));
    const containers = [...html.matchAll(/<(p|h[123]|blockquote|t[dh])\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .filter((match) => match[2].includes("正文"));
    assert.equal(containers.length, 9, theme.id);
    for (const container of containers) {
      assert.ok(container[2].startsWith('<span leaf="">'), `${theme.id}: ${container[0]}`);
      assert.ok(container[2].endsWith("</span>"), `${theme.id}: ${container[0]}`);
    }
    if (["apple", "bauhaus", "swiss", "paper", "mist"].includes(theme.id)) {
      const card = renderDocToHtml({ blocks: [doc.blocks[3]] }, optionsFor(theme.id));
      assert.match(card, /^<blockquote/);
      assert.doesNotMatch(html, /<svg|box-shadow|display:flex/);
    }
  }
});

test("long technical text and links can wrap in headings, cards, lists and references", () => {
  const longText = "LongUnbrokenIdentifier".repeat(12);
  const children: Inline[] = [{ type: "text", content: longText }];
  const doc: Doc = { blocks: [
    { type: "heading", level: 2, children },
    { type: "paragraph", children },
    { type: "quote", children },
    { type: "quote", variant: "card", children },
    { type: "callout", children },
    { type: "emphasis", children },
    { type: "steps", ordered: true, items: [{ children }] },
    { type: "list", ordered: false, items: [{ children }] },
    { type: "paragraph", children: [
      { type: "link", content: longText, href: `https://example.com/${longText}` },
      { type: "code", content: longText }
    ] }
  ] };
  for (const theme of THEME_PRESETS) {
    const html = renderDocToHtml(doc, optionsFor(theme.id));
    const containers = [...html.matchAll(/<(p|h[123]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .filter((match) => match[2].includes(longText));
    assert.ok(containers.length >= 9, theme.id);
    for (const container of containers) assert.match(container[0], /^<[^>]*overflow-wrap:(?:break-word|anywhere);/, theme.id);
    for (const link of html.matchAll(/<a\b[^>]*>/g)) assert.match(link[0], /overflow-wrap:anywhere;/, theme.id);
    for (const code of html.matchAll(/<code\b[^>]*>/g)) assert.match(code[0], /overflow-wrap:anywhere;/, theme.id);
    if (html.includes("display:flex")) assert.match(html, /min-width:0;/, theme.id);
  }
});

test("content-sized heading decorations stay inside the article without clipping long titles", () => {
  const longTitle = "TechnicalIdentifier".repeat(12);
  const doc: Doc = { blocks: [1, 2, 3].map((level) => ({
    type: "heading", level: level as 1 | 2 | 3, children: [{ type: "text", content: longTitle }]
  })) };
  let checked = 0;
  for (const theme of THEME_PRESETS) {
    const html = renderDocToHtml(doc, optionsFor(theme.id));
    for (const heading of html.matchAll(/<h[123]\b[^>]*>[\s\S]*?<\/h[123]>/g)) {
      if (!heading[0].includes("width:fit-content;")) continue;
      checked += 1;
      assert.match(heading[0], /max-width:100%;/, theme.id);
      assert.match(heading[0], /box-sizing:border-box;/, theme.id);
      assert.match(heading[0], /overflow-wrap:anywhere;/, theme.id);
      assert.ok(heading[0].includes(longTitle), theme.id);
      assert.doesNotMatch(heading[0], /overflow:hidden|text-overflow:ellipsis/, theme.id);
    }
  }
  assert.ok(checked >= 6);
});
