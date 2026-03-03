import { initDrawer } from "./ui";

const drawer = initDrawer();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "toggleDrawer") {
    drawer.toggleDrawer();
  }
});
