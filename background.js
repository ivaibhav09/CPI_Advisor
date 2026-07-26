const DEFAULT_CONTEXT = {
  screen: "Integration Flow",
  component: "Integration Flow",
  activity: "Waiting for CPI screen",
  iflow: "Not detected",
  configuration: {},
  url: ""
};
let activeFrameId = 0;

chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CPI_CONTEXT") {
    const frameId = sender.frameId || 0;
    if (frameId > 0) activeFrameId = frameId;
    if (frameId === 0 && activeFrameId > 0) {
      sendResponse({ ok: true });
      return;
    }
    const context = { ...DEFAULT_CONTEXT, ...message.payload, url: sender.tab?.url || "" };
    chrome.storage.session.set({ cpiContext: context });
    chrome.runtime.sendMessage({ type: "CPI_CONTEXT_UPDATED", payload: context }).catch(() => {});
    sendResponse({ ok: true });
  }
  if (message.type === "GET_CPI_CONTEXT") {
    chrome.storage.session.get("cpiContext").then(({ cpiContext }) => sendResponse(cpiContext || DEFAULT_CONTEXT));
    return true;
  }
});
