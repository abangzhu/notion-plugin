import assert from "node:assert/strict";
import test from "node:test";

import { collectVirtualizedItems } from "../src/virtual-scroll.ts";

interface TestItem {
  id: string;
  value: string;
}

const createItems = (count: number): TestItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `block-${index}`,
    value: `Block ${index}`
  }));

test("collects every virtualized item in document order and restores the original position", async () => {
  const items = createItems(8);
  let scrollTop = 350;
  const visitedPositions: number[] = [];

  const result = await collectVirtualizedItems({
    getScrollTop: () => scrollTop,
    getViewportSize: () => 200,
    getTotalSize: () => 800,
    scrollTo: (position) => {
      scrollTop = position;
      visitedPositions.push(position);
    },
    waitForContent: async () => {},
    readItems: () => {
      const start = Math.floor(scrollTop / 100);
      return items.slice(start, start + 3);
    }
  });

  assert.deepEqual(result, items);
  assert.equal(scrollTop, 350);
  assert.equal(visitedPositions[0], 0);
  assert.equal(visitedPositions.at(-1), 350);
});

test("keeps scanning when the virtualized document height grows", async () => {
  const items = createItems(6);
  let scrollTop = 0;

  const result = await collectVirtualizedItems({
    getScrollTop: () => scrollTop,
    getViewportSize: () => 200,
    getTotalSize: () => (scrollTop >= 160 ? 600 : 400),
    scrollTo: (position) => {
      scrollTop = position;
    },
    waitForContent: async () => {},
    readItems: () => {
      const start = Math.floor(scrollTop / 100);
      return items.slice(start, start + 3);
    }
  });

  assert.deepEqual(result, items);
});

test("waits for another content pass at the bottom before treating the document as complete", async () => {
  const items = createItems(6);
  let scrollTop = 0;
  let totalSize = 400;
  let bottomWaits = 0;

  const result = await collectVirtualizedItems({
    getScrollTop: () => scrollTop,
    getViewportSize: () => 200,
    getTotalSize: () => totalSize,
    scrollTo: (position) => { scrollTop = position; },
    waitForContent: async () => {
      if (scrollTop === 200 && ++bottomWaits === 2) totalSize = 600;
    },
    readItems: () => items.slice(Math.floor(scrollTop / 100), Math.floor(scrollTop / 100) + 2)
  });

  assert.deepEqual(result, items);
});

test("updates a mounted block when its content finishes loading without duplicating it", async () => {
  let scrollTop = 0;
  const result = await collectVirtualizedItems({
    getScrollTop: () => scrollTop,
    getViewportSize: () => 200,
    getTotalSize: () => 400,
    scrollTo: (position) => { scrollTop = position; },
    waitForContent: async () => {},
    readItems: () => [{ id: "table", value: scrollTop === 0 ? "Header" : "Header and all rows" }]
  });

  assert.deepEqual(result, [{ id: "table", value: "Header and all rows" }]);
});

test("restores the original position when reading mounted items fails", async () => {
  let scrollTop = 275;
  let reads = 0;
  let waits = 0;

  await assert.rejects(
    collectVirtualizedItems({
      getScrollTop: () => scrollTop,
      getViewportSize: () => 200,
      getTotalSize: () => 600,
      scrollTo: (position) => {
        scrollTop = position;
      },
      waitForContent: async () => {
        waits += 1;
        if (waits === 3) throw new Error("restore render failed");
      },
      readItems: () => {
        reads += 1;
        if (reads === 2) throw new Error("virtualizer failed");
        return [{ id: "block-0", value: "Block 0" }];
      }
    }),
    /virtualizer failed/
  );

  assert.equal(scrollTop, 275);
});

test("stops an unexpectedly long scan and still restores the original position", async () => {
  let scrollTop = 125;

  await assert.rejects(
    collectVirtualizedItems(
      {
        getScrollTop: () => scrollTop,
        getViewportSize: () => 100,
        getTotalSize: () => 10_000,
        scrollTo: (position) => {
          scrollTop = position;
        },
        waitForContent: async () => {},
        readItems: () => [{ id: `block-${scrollTop}`, value: `Block ${scrollTop}` }]
      },
      { maxSteps: 1 }
    ),
    /exceeded 1 steps/
  );

  assert.equal(scrollTop, 125);
});
