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
