export const writeClipboard = async (html: string, text: string): Promise<void> => {
  const htmlBlob = new Blob([html], { type: "text/html" });
  const textBlob = new Blob([text], { type: "text/plain" });
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": htmlBlob,
      "text/plain": textBlob
    })
  ]);
};

// 纯文本复制：优先异步剪贴板 API；在宿主页拦截/未聚焦等情况下回退到 execCommand。
// 返回是否成功，调用方据此给出可见反馈（而非静默失败）。
export const copyPlainText = async (text: string): Promise<boolean> => {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithExecCommand(text);
  }
};

const copyWithExecCommand = (text: string): boolean => {
  const active = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  // 宿主页（Notion）可能监听 copy 事件改写剪贴板；捕获阶段拦截，确保写入的是我们的文本
  const onCopy = (event: ClipboardEvent) => {
    event.stopImmediatePropagation();
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
  };
  window.addEventListener("copy", onCopy, true);
  try {
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    window.removeEventListener("copy", onCopy, true);
    textarea.remove();
    active?.focus?.();
  }
};

export const getSelectionHtmlWithin = (container: HTMLElement): { html: string; text: string } | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const fragment = range.cloneContents();
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);

  const html = wrapper.innerHTML;
  const text = wrapper.innerText;

  if (!html.trim()) return null;
  return { html, text };
};
