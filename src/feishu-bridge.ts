// MAIN world script — has direct access to window.DATA
// Communicates with isolated world content script via hidden DOM element
(() => {
  const BRIDGE_ID = "__feishu_block_map__";

  const writeData = (): boolean => {
    const data = (window as any).DATA?.clientVars?.data;
    if (!data?.block_map) return false;

    let el = document.getElementById(BRIDGE_ID);
    if (!el) {
      const scriptEl = document.createElement("script");
      scriptEl.id = BRIDGE_ID;
      scriptEl.type = "application/json";
      scriptEl.style.display = "none";
      document.documentElement.appendChild(scriptEl);
      el = scriptEl;
    }
    el.textContent = JSON.stringify(data.block_map);
    return true;
  };

  // Try immediately
  if (writeData()) return;

  // Retry: window.DATA may be populated async
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (writeData() || attempts >= 50) {
      clearInterval(timer);
    }
  }, 100);
})();
