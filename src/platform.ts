import { extractDocFromNotion } from "./extractor";
import { extractDocFromFeishu } from "./feishu-extractor";
import type { Doc } from "./types";

export type Platform = "notion" | "feishu" | "unknown";

const NOTION_PAGE_ID_PATTERN = /[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i;

export const detectPlatform = (): Platform => {
  const { hostname, pathname } = window.location;

  if (hostname === "www.notion.so" || hostname.endsWith(".notion.site")) {
    return "notion";
  }

  if (
    (hostname.endsWith(".feishu.cn") || hostname.endsWith(".larksuite.com")) &&
    (pathname.includes("/docx/") || pathname.includes("/wiki/"))
  ) {
    return "feishu";
  }

  return "unknown";
};

export const extractDoc = (): Doc => {
  const platform = detectPlatform();

  switch (platform) {
    case "notion":
      return extractDocFromNotion();
    case "feishu":
      return extractDocFromFeishu();
    case "unknown":
      return { blocks: [] };
  }
};

export const getPageKey = (): string => {
  const platform = detectPlatform();
  const url = new URL(window.location.href);

  switch (platform) {
    case "notion": {
      const pageParam = url.searchParams.get("p");
      const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? url.pathname;

      for (const candidate of [pageParam, lastPathSegment]) {
        if (!candidate) continue;
        const match = candidate.match(NOTION_PAGE_ID_PATTERN);
        if (match) {
          return match[0].replace(/-/g, "").toLowerCase();
        }
      }
      return url.pathname;
    }
    case "feishu": {
      const docxMatch = url.pathname.match(/\/(?:docx|wiki)\/([A-Za-z0-9]+)/);
      return docxMatch ? docxMatch[1] : url.pathname;
    }
    case "unknown":
      return url.pathname;
  }
};
