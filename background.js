// Google Labs MCP Companion - Background Service Worker
const MCP_WS_URL = "ws://127.0.0.1:18885";
let ws = null;
let reconnectTimer = null;
const attachedTabs = new Set();

function updateBadge(status) {
  if (status === "connected") {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00E676" });
  } else if (status === "busy") {
    chrome.action.setBadgeText({ text: "BUSY" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFB300" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#757575" });
  }
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(MCP_WS_URL);

    ws.onopen = () => {
      console.log("[Google Labs MCP Bridge] Connected to MCP WebSocket server at", MCP_WS_URL);
      updateBadge("connected");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Announce presence
      ws.send(JSON.stringify({
        event: "companion_registered",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { id, method, params } = msg;

        updateBadge("busy");
        const result = await handleRpcMethod(method, params || {});
        updateBadge("connected");

        ws.send(JSON.stringify({
          id,
          success: true,
          result
        }));
      } catch (err) {
        console.error("[Google Labs MCP Bridge] RPC Error:", err);
        updateBadge("connected");
        try {
          const raw = JSON.parse(event.data);
          ws.send(JSON.stringify({
            id: raw.id,
            success: false,
            error: err.message || String(err)
          }));
        } catch {}
      }
    };

    ws.onclose = () => {
      console.log("[Google Labs MCP Bridge] Disconnected. Retrying in 3s...");
      updateBadge("disconnected");
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.warn("[Google Labs MCP Bridge] Socket error:", err);
      updateBadge("disconnected");
      ws.close();
    };
  } catch (e) {
    console.warn("[Google Labs MCP Bridge] Connection error:", e);
    updateBadge("disconnected");
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWebSocket();
    }, 3000);
  }
}

// -------------------------------------------------------------
// Chrome Tab & Debugger Helpers
// -------------------------------------------------------------

async function findTargetTab(urlPattern = "flow.google.com") {
  const tabs = await chrome.tabs.query({});
  let target = tabs.find(t => t.url && t.url.includes(urlPattern));
  if (!target && urlPattern.includes("flow")) {
    // Check for labs.google fallback
    target = tabs.find(t => t.url && t.url.includes("labs.google"));
  }
  return target || null;
}

async function ensureDebuggerAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        // If already attached, ignore error
        if (chrome.runtime.lastError.message.includes("already attached")) {
          attachedTabs.add(tabId);
          return resolve();
        }
        return reject(new Error(chrome.runtime.lastError.message));
      }
      attachedTabs.add(tabId);
      resolve();
    });
  });
}

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
  }
});

async function sendCdp(tabId, method, params = {}) {
  await ensureDebuggerAttached(tabId);
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(result);
    });
  });
}

// -------------------------------------------------------------
// RPC Method Implementations
// -------------------------------------------------------------

async function handleRpcMethod(method, params) {
  console.log(`[Google Labs MCP Bridge] Handling method: ${method}`, params);

  if (method === "ping") {
    return { pong: true, timestamp: Date.now() };
  }

  if (method === "get_status") {
    const tabs = await chrome.tabs.query({});
    const flowTab = tabs.find(t => t.url && t.url.includes("flow.google.com"));
    const labsTab = tabs.find(t => t.url && t.url.includes("labs.google"));

    let details = null;
    if (flowTab) {
      try {
        const evalRes = await sendCdp(flowTab.id, "Runtime.evaluate", {
          expression: "(() => ({ isUltra: document.body.innerText.includes('ULTRA'), title: document.title, url: window.location.href }))()",
          returnByValue: true
        });
        details = evalRes?.result?.value || null;
      } catch (e) {
        details = { title: flowTab.title, url: flowTab.url, error: e.message };
      }
    }

    return {
      connected: true,
      hasFlowTab: !!flowTab,
      hasLabsTab: !!labsTab,
      flowDetails: details,
      totalTabs: tabs.length
    };
  }

  if (method === "open_or_focus_flow") {
    const targetUrl = params.url || "https://flow.google.com/";
    let tab = await findTargetTab("flow.google.com");
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      tab = await chrome.tabs.create({ url: targetUrl, active: true });
    }
    return { tabId: tab.id, url: tab.url };
  }

  if (method === "cdp_command") {
    const { tabId: reqTabId, method: cdpMethod, params: cdpParams } = params;
    let tabId = reqTabId;
    if (!tabId) {
      const tab = await findTargetTab();
      if (!tab) throw new Error("No active Google Flow tab found.");
      tabId = tab.id;
    }
    return await sendCdp(tabId, cdpMethod, cdpParams || {});
  }

  if (method === "inject_prompt") {
    const promptText = params.prompt;
    const tab = await findTargetTab();
    if (!tab) throw new Error("No active Google Flow tab found.");

    // Focus tab
    await chrome.tabs.update(tab.id, { active: true });

    // Use CDP Runtime to set prompt content cleanly into ProseMirror
    const expr = `
      (() => {
        const el = document.querySelector('div.ProseMirror, textarea, [contenteditable="true"]');
        if (!el) return { success: false, error: 'Editor not found' };
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, ${JSON.stringify(promptText)});
        return { success: true, textLength: el.innerText ? el.innerText.length : 0 };
      })()
    `;

    const res = await sendCdp(tab.id, "Runtime.evaluate", {
      expression: expr,
      returnByValue: true
    });

    return res?.result?.value || { success: true };
  }

  if (method === "approve_render") {
    const tab = await findTargetTab();
    if (!tab) throw new Error("No active Google Flow tab found.");

    const expr = `
      (() => {
        const all = Array.from(document.querySelectorAll('*'));
        const btn = all.find(el => {
          const text = (el.innerText || '').trim();
          return text === 'Always approve' || text === 'Approve';
        });
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.innerText.trim() };
        }
        return { clicked: false, message: 'No approve button found' };
      })()
    `;

    const res = await sendCdp(tab.id, "Runtime.evaluate", {
      expression: expr,
      returnByValue: true
    });

    return res?.result?.value || { clicked: false };
  }

  if (method === "capture_screenshot") {
    const tab = await findTargetTab();
    if (!tab) throw new Error("No active Google Flow tab found.");

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    return { dataUrl, sizeBytes: dataUrl.length };
  }

  if (method === "click_download_batch") {
    const tab = await findTargetTab();
    if (!tab) throw new Error("No active Google Flow tab found.");

    const expr = `
      (() => {
        const all = Array.from(document.querySelectorAll('*'));
        const btn = all.find(el => {
          const aria = el.getAttribute('aria-label') || '';
          const text = (el.innerText || '').trim();
          return aria.toLowerCase().includes('download batch') || text.toLowerCase().includes('download batch');
        });
        if (btn) {
          btn.click();
          return { clicked: true, text: 'Download batch triggered' };
        }
        return { clicked: false, message: 'Download batch button not found' };
      })()
    `;

    const res = await sendCdp(tab.id, "Runtime.evaluate", {
      expression: expr,
      returnByValue: true
    });

    return res?.result?.value || { clicked: false };
  }

  throw new Error(`Unknown RPC method: ${method}`);
}

// Start connection on launch
connectWebSocket();

// Listen for alarms or wakeups
chrome.runtime.onStartup.addListener(() => connectWebSocket());
chrome.runtime.onInstalled.addListener(() => connectWebSocket());
