import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { type TestContext } from "node:test";

import { extractDocFromNotion } from "../src/extractor";

// Model only the browser boundary used by the extractor, including Notion's nested scrollers.
const createPage = (context: TestContext, originalPosition = 350, mountDelay = 0, blockHeight = 100, padding = 0) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let scrollTop = originalPosition;
  let mountedPosition = originalPosition;
  let mountVersion = 0;
  const positions: number[] = [];
  const location = { href: "https://app.notion.com/test-0123456789abcdef0123456789abcdef" };
  const rectangle = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 600, width: 600 });

  const scroller = {
    parentElement: null,
    className: "notion-scroller",
    overflowY: "auto",
    clientHeight: 200,
    clientTop: 0,
    scrollHeight: 800 + padding * 2,
    getBoundingClientRect: () => rectangle(0, 200),
    get scrollTop() { return scrollTop; },
    set scrollTop(value: number) {
      scrollTop = Math.max(0, Math.min(value, scroller.scrollHeight - scroller.clientHeight));
      positions.push(scrollTop);
      const version = ++mountVersion;
      if (!mountDelay) mountedPosition = scrollTop;
      else setTimeout(() => {
        if (version === mountVersion) mountedPosition = scrollTop;
      }, mountDelay);
    }
  };
  const horizontalScroller = {
    parentElement: scroller,
    className: "notion-scroller",
    overflowY: "visible",
    clientHeight: 800,
    scrollHeight: 800
  };
  const root = {
    parentElement: horizontalScroller,
    nodeType: 1,
    isConnected: true,
    paddingTop: `${padding}px`,
    paddingBottom: `${padding}px`,
    closest: (selector: string) => selector === ".notion-scroller" ? horizontalScroller : null,
    querySelectorAll: () => {
      const first = Math.max(0, Math.floor((mountedPosition - padding) / blockHeight));
      return blocks.slice(first, first + Math.ceil(200 / blockHeight) + 1);
    },
    getBoundingClientRect: () => rectangle(-scrollTop, 800 + padding * 2)
  };
  const blocks = Array.from({ length: 800 / blockHeight }, (_, index) => {
    const text = `Paragraph ${index}`;
    const block = {
      nodeType: 1,
      tagName: "DIV",
      className: "notion-text-block",
      classList: { contains: () => false },
      dataset: { blockId: `block-${index}` },
      parentElement: root,
      isConnected: true,
      textContent: text,
      matches: () => false,
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => rectangle(padding + index * blockHeight - scrollTop, blockHeight),
      childNodes: [] as unknown[]
    };
    block.childNodes.push({ nodeType: 3, textContent: text, parentElement: block });
    return block;
  });
  const globals = {
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    document: { querySelector: () => root, body: root, scrollingElement: scroller },
    window: { location, innerHeight: 200 },
    getComputedStyle: (element: { overflowY?: string; paddingTop?: string; paddingBottom?: string }) => ({
      overflowY: element.overflowY ?? "visible",
      paddingTop: element.paddingTop ?? "0px",
      paddingBottom: element.paddingBottom ?? "0px",
      color: "rgb(0, 0, 0)",
      backgroundColor: "transparent",
      fontWeight: "400",
      fontStyle: "normal",
      fontFamily: "sans-serif",
      textDecorationLine: "none"
    }),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16)
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    context.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { root, scroller, positions, location };
};

const settle = async <T>(context: TestContext, promise: Promise<T>): Promise<T> => {
  let finished = false;
  promise.then(() => { finished = true; }, () => { finished = true; });
  for (let tick = 0; !finished && tick < 500; tick += 1) {
    context.mock.timers.tick(50);
    await setImmediate();
  }
  assert.ok(finished, "extraction must complete within a bounded time");
  return promise;
};

test("extracts the complete article through the vertical ancestor of a non-scrolling Notion scroller", async (context) => {
  const page = createPage(context);
  const doc = await settle(context, extractDocFromNotion());

  assert.deepEqual(doc.blocks.map((block) => block.type === "paragraph" && block.children[0].content),
    Array.from({ length: 8 }, (_, index) => `Paragraph ${index}`));
  assert.equal(page.scroller.scrollTop, 350);
});

test("waits for delayed mounting and does not put the old middle window before the beginning", async (context) => {
  const page = createPage(context, 350, 250);
  const doc = await settle(context, extractDocFromNotion());

  assert.deepEqual(doc.blocks.map((block) => block.type === "paragraph" && block.children[0].content),
    Array.from({ length: 8 }, (_, index) => `Paragraph ${index}`));
  assert.equal(page.scroller.scrollTop, 350);
});

test("does not skip short paragraphs while an overlapping old window is still mounted", async (context) => {
  const page = createPage(context, 350, 250, 20);
  const doc = await settle(context, extractDocFromNotion());

  assert.deepEqual(doc.blocks.map((block) => block.type === "paragraph" && block.children[0].content),
    Array.from({ length: 40 }, (_, index) => `Paragraph ${index}`));
  assert.equal(page.scroller.scrollTop, 350);
});

test("shares one extraction when the same page is refreshed concurrently", async (context) => {
  const page = createPage(context);
  const first = extractDocFromNotion();
  const second = extractDocFromNotion();
  const docs = await settle(context, Promise.all([first, second]));

  assert.equal(first, second);
  assert.deepEqual(docs[0], docs[1]);
  assert.equal(page.scroller.scrollTop, 350);
});

test("rejects an extraction if navigation changes the page while scanning and restores the old position", async (context) => {
  const page = createPage(context);
  const rejected = assert.rejects(extractDocFromNotion(), /页面已切换/);
  setTimeout(() => { page.location.href += "-another-page"; }, 75);

  await settle(context, rejected);
  assert.equal(page.scroller.scrollTop, 350);
});

test("rejects a replaced Notion root instead of returning the old page's content", async (context) => {
  const page = createPage(context);
  const rejected = assert.rejects(extractDocFromNotion(), /页面已切换/);
  setTimeout(() => { page.root.isConnected = false; }, 75);

  await settle(context, rejected);
  assert.equal(page.scroller.scrollTop, 350);
});

test("fails visibly when a viewport never mounts rather than returning a partial article", async (context) => {
  const page = createPage(context, 350, 10_000);
  await settle(context, assert.rejects(extractDocFromNotion(), /正文尚未加载稳定/));
  assert.equal(page.scroller.scrollTop, 350);
});

test("allows blank space above the article and bottom padding while collecting all paragraphs", async (context) => {
  const page = createPage(context, 350, 0, 100, 200);
  const doc = await settle(context, extractDocFromNotion());

  assert.deepEqual(doc.blocks.map((block) => block.type === "paragraph" && block.children[0].content),
    Array.from({ length: 8 }, (_, index) => `Paragraph ${index}`));
  assert.equal(page.scroller.scrollTop, 350);
});
