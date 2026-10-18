export interface VirtualScrollItem {
  id: string;
}

export interface VirtualScrollAdapter<T extends VirtualScrollItem> {
  getScrollTop: () => number;
  getViewportSize: () => number;
  getTotalSize: () => number;
  scrollTo: (position: number) => void;
  waitForContent: () => Promise<void>;
  readItems: () => T[];
}

export interface VirtualScrollOptions {
  stepRatio?: number;
  maxSteps?: number;
}

const DEFAULT_STEP_RATIO = 0.8;
const DEFAULT_MAX_STEPS = 500;

export const collectVirtualizedItems = async <T extends VirtualScrollItem>(
  adapter: VirtualScrollAdapter<T>,
  options: VirtualScrollOptions = {}
): Promise<T[]> => {
  const originalPosition = adapter.getScrollTop();
  const collected = new Map<string, T>();
  const stepRatio = Math.max(0.1, Math.min(1, options.stepRatio ?? DEFAULT_STEP_RATIO));
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);
  let previousBottomSize: number | undefined;

  try {
    adapter.scrollTo(0);
    await adapter.waitForContent();

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      for (const item of adapter.readItems()) {
        collected.set(item.id, item);
      }

      const viewportSize = Math.max(1, adapter.getViewportSize());
      const totalSize = adapter.getTotalSize();
      const maxPosition = Math.max(0, totalSize - viewportSize);
      const currentPosition = Math.max(0, Math.min(adapter.getScrollTop(), maxPosition));

      if (currentPosition >= maxPosition - 1) {
        if (previousBottomSize === totalSize) return Array.from(collected.values());
        // Recheck after rendering: reaching the current bottom can load another section.
        previousBottomSize = totalSize;
        await adapter.waitForContent();
        continue;
      }
      previousBottomSize = undefined;

      const nextPosition = Math.min(
        maxPosition,
        currentPosition + Math.max(1, Math.floor(viewportSize * stepRatio))
      );
      adapter.scrollTo(nextPosition);
      await adapter.waitForContent();
    }

    throw new Error(`Virtualized document scan exceeded ${maxSteps} steps`);
  } finally {
    adapter.scrollTo(originalPosition);
    try {
      await adapter.waitForContent();
    } catch {
      // Restoring the scroll position is best-effort and must not hide the original error.
    }
  }
};
