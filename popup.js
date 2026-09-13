document.addEventListener("DOMContentLoaded", async () => {
  const mcpStatus = document.getElementById("mcpStatus");
  const mcpStatusText = document.getElementById("mcpStatusText");
  const flowTabState = document.getElementById("flowTabState");
  const subState = document.getElementById("subState");

  const btnFocus = document.getElementById("btnFocus");
  const btnApprove = document.getElementById("btnApprove");
  const btnScreenshot = document.getElementById("btnScreenshot");
  const btnReconnect = document.getElementById("btnReconnect");

  // Query background service worker
  async function refreshStatus() {
    try {
      const tabs = await chrome.tabs.query({});
      const flowTab = tabs.find(t => t.url && t.url.includes("flow.google.com"));

      if (flowTab) {
        flowTabState.textContent = "Active";
        flowTabState.style.color = "#4ade80";

        // Try to check ultra state via scripting
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: flowTab.id },
            func: () => document.body.innerText.includes("ULTRA")
          });
          const isUltra = results && results[0] && results[0].result;
          if (isUltra) {
            subState.textContent = "Google ULTRA";
            subState.style.color = "#38bdf8";
          } else {
            subState.textContent = "Standard";
            subState.style.color = "#e2e8f0";
          }
        } catch (e) {
          subState.textContent = "Detected";
        }
      } else {
        flowTabState.textContent = "Not Found";
        flowTabState.style.color = "#f87171";
        subState.textContent = "Inactive";
      }

      // Check background bridge status
      const bg = await chrome.runtime.getBackgroundPage ? await chrome.runtime.getBackgroundPage() : null;
      // Also probe ws port directly
      try {
        const testWs = new WebSocket("ws://127.0.0.1:18885");
        testWs.onopen = () => {
          mcpStatus.className = "status-badge status-connected";
          mcpStatusText.textContent = "ONLINE";
          testWs.close();
        };
        testWs.onerror = () => {
          mcpStatus.className = "status-badge status-disconnected";
          mcpStatusText.textContent = "OFFLINE";
        };
      } catch {
        mcpStatus.className = "status-badge status-disconnected";
        mcpStatusText.textContent = "OFFLINE";
      }
    } catch (err) {
      console.error(err);
    }
  }

  btnFocus.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({});
    const flowTab = tabs.find(t => t.url && t.url.includes("flow.google.com"));
    if (flowTab) {
      await chrome.tabs.update(flowTab.id, { active: true });
      if (flowTab.windowId) {
        await chrome.windows.update(flowTab.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: "https://flow.google.com/", active: true });
    }
  });

  btnApprove.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({});
    const flowTab = tabs.find(t => t.url && t.url.includes("flow.google.com"));
    if (flowTab) {
      await chrome.scripting.executeScript({
        target: { tabId: flowTab.id },
        func: () => {
          const all = Array.from(document.querySelectorAll('*'));
          const btn = all.find(el => {
            const text = (el.innerText || '').trim();
            return text === 'Always approve' || text === 'Approve';
          });
          if (btn) btn.click();
        }
      });
    }
  });

  btnScreenshot.addEventListener("click", async () => {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    const win = window.open();
    if (win) {
      win.document.write(`<img src="${dataUrl}" style="max-width: 100%; height: auto;" />`);
    }
  });

  btnReconnect.addEventListener("click", () => {
    refreshStatus();
  });

  refreshStatus();
});
