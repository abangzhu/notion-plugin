import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

import type { CodeHighlightColors } from "./theme";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

// Aliases
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("py", python);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("rs", rust);

const SCOPE_TO_COLOR_KEY: Record<string, keyof CodeHighlightColors> = {
  keyword: "keyword",
  built_in: "builtIn",
  type: "type",
  literal: "literal",
  number: "number",
  string: "string",
  "meta string": "string",
  regexp: "regexp",
  symbol: "symbol",
  variable: "variable",
  "variable.language": "variable",
  "variable.constant": "variable",
  template_variable: "variable",
  title: "function",
  "title.function": "function",
  "title.class": "type",
  "title.class.inherited": "type",
  params: "params",
  comment: "comment",
  doctag: "doctag",
  meta: "meta",
  "meta keyword": "meta",
  attr: "attr",
  attribute: "attr",
  name: "tag",
  tag: "tag",
  selector_tag: "tag",
  selector_class: "attr",
  selector_id: "attr",
  property: "property",
  addition: "addition",
  deletion: "deletion",
  operator: "operator",
  punctuation: "punctuation",
  subst: "variable",
  section: "function",
  bullet: "symbol",
  link: "string",
  emphasis: "comment",
  strong: "keyword",
  formula: "number"
};

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeCssColor = (value: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(trimmed)) return trimmed;
  return "inherit";
};

type EmitterNode = {
  scope?: string;
  children: Array<string | EmitterNode>;
};

const renderNode = (node: string | EmitterNode, colors: CodeHighlightColors): string => {
  if (typeof node === "string") {
    return escapeHtml(node);
  }

  const inner = node.children.map((child) => renderNode(child, colors)).join("");

  if (!node.scope) {
    return inner;
  }

  const colorKey = SCOPE_TO_COLOR_KEY[node.scope];
  const color = colorKey ? colors[colorKey] : undefined;

  if (!color) {
    return inner;
  }

  return `<span style="color:${sanitizeCssColor(color)};">${inner}</span>`;
};

const LANGUAGE_ALIASES: Record<string, string> = {
  "c++": "cpp",
  "c#": "java",
  csharp: "java",
  jsx: "javascript",
  tsx: "typescript",
  zsh: "bash",
  fish: "bash",
  plaintext: "",
  plain: "",
  text: "",
  txt: ""
};

const normalizeLanguage = (language: string): string => {
  const lower = language.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] ?? lower;
};

export const highlightCode = (
  code: string,
  language: string | undefined,
  colors: CodeHighlightColors
): string => {
  try {
    const lang = normalizeLanguage(language ?? "");

    let result;
    if (lang && hljs.getLanguage(lang)) {
      result = hljs.highlight(code, { language: lang });
    } else {
      result = hljs.highlightAuto(code);
      if (!result.language || (result.relevance ?? 0) < 2) {
        return escapeHtml(code);
      }
    }

    const rootNode = (result as unknown as { _emitter: { rootNode: EmitterNode } })._emitter
      .rootNode;

    return renderNode(rootNode, colors);
  } catch {
    return escapeHtml(code);
  }
};
