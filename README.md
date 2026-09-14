# 🌐 Google Labs MCP Companion (Chrome Extension)

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Protocol: CDP](https://img.shields.io/badge/Protocol-Chrome_DevTools_Protocol-00C853?logo=googlechrome)](https://chromedevtools.github.io/devtools-protocol/)
[![Transport: WebSocket](https://img.shields.io/badge/Transport-ws%3A%2F%2F127.0.0.1%3A18885-FF6D00)](http://127.0.0.1:18885/health)
[![Architecture: Zero--Flag](https://img.shields.io/badge/Architecture-Zero--Flag_Daily_Driver-7C4DFF)]()
[![Status: Production](https://img.shields.io/badge/Status-Hardened-brightgreen)]()

The **Google Labs MCP Companion** is an ultra-fast, zero-flag Chrome Manifest V3 extension that bridges your **everyday, authenticated Google Chrome browser session** directly into the **[Google Labs MCP](https://github.com/ssfdre38/google-labs-mcp)** server, **Antigravity (AGY)**, and the **[Gemini Super System](https://github.com/ssfdre38/gemini-super-system)**.

It eliminates the need for `--remote-debugging-port=9222`, secondary test profiles, fragile headless scrapers, or simulated DOM clicks by providing a clean **two-tier hybrid bridge**: high-level extension lifecycle management on top, and bare-metal Chrome DevTools Protocol (CDP) execution underneath.

---

## 💡 Why We Built This

Traditional AI agent browser automation is severely broken in three major ways:

1. **The Headless Scraper Bottleneck**:  
   Standard AI scrapers (`curl`, `fetch`, basic text extractors) only receive raw HTML. Modern Single-Page Applications (SPAs) like **Google Flow, Google Labs, Kaggle, and Discord** render client-side via JavaScript. Scrapers only see blank white pages (`<div id="root"></div>`) because they don't execute V8 or wait for hydration.
2. **The Authentication & Bot Barrier**:  
   Headless Chrome instances get immediately blocked by Cloudflare, Akamai, or CAPTCHA challenges. Furthermore, you cannot access your Google account, internal tools, or private sessions without clunky cookie dumping or storing plaintext credentials.
3. **The Broken Event Synthesizer in Typical Extensions**:  
   Existing browser-agent extensions (like OpenClaw or standard webview extensions) rely on unprivileged Content Scripts. When they try to type or click, they fire synthetic DOM events (`element.dispatchEvent()`) where `event.isTrusted === false`. Modern rich-text engines (React, Slate.js, ProseMirror) completely ignore untrusted events.

### Our Solution: Two-Tier Hybrid Architecture

Instead of fighting the browser, we turn your **active, everyday Chrome session** into an agentic peripheral:

```
┌─────────────────────────────────────────────────────────────────┐
│                       GOOGLE CHROME                             │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │   TIER 1: HIGH-LEVEL FRONTEND (Chrome Extension APIs)   │   │
│   │   • chrome.tabs    - Tab querying, switching, creation  │   │
│   │   • chrome.action  - Cyberpunk HUD badge & controls     │   │
│   │   • chrome.alarms  - Bulletproof MV3 keepalive loop     │   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│   ┌────────────────────────────▼────────────────────────────┐   │
│   │   TIER 2: LOW-LEVEL ENGINE ACCESS (chrome.debugger CDP) │   │
│   │   • Page.captureScreenshot  - Direct GPU framebuffer    │   │
│   │   • Input.insertText        - Hardware-level typing     │   │
│   │   • Input.dispatchKeyEvent  - Hardware key events       │   │
│   │   • Runtime.evaluate        - Sandboxed V8 execution    │   │
│   └────────────────────────────┬────────────────────────────┘   │
└────────────────────────────────┼────────────────────────────────┘
                                 │
              Localhost Loopback (ws://127.0.0.1:18885)
              REST Gateway       (http://127.0.0.1:18885/rpc)
                                 │
                                 ▼
                 GOOGLE LABS MCP & ANTIGRAVITY AGENT
```

---

## ✨ Key Features

- 🟢 **Zero-Flag Daily Driver Automation**: Connects directly to your everyday Chrome profile without launching Chrome with `--remote-debugging-port=9222` and without wiping cookies.
- 👁️ **Pixel-Accurate Visual Ground Truth**: Captures uncompressed, high-resolution PNG snapshots directly from the GPU framebuffer via `Page.captureScreenshot` in under **200ms**.
- ⌨️ **Hardware-Level Input Injection**: Uses `Input.insertText` and `Input.dispatchKeyEvent` to type cleanly into complex rich-text editors (Discord Slate.js, Google Flow ProseMirror, Notion, Google Docs) with 100% native trust.
- 📜 **Dynamic Reactive Scroller**: Intelligently identifies nested, virtualized scroll containers (such as Discord's `managedReactiveScroller` or Kaggle leaderboards) and performs smooth scrolling, `toTop`, and `toBottom` jumps.
- 🛡️ **Permanent MV3 Keepalive**: Immune to Manifest V3 service worker idle suspensions via a dual-sided architecture:
  - Client-to-server 15s heartbeat pings
  - Server-to-client 20s heartbeat pings
  - 30s `chrome.alarms` periodic wakeups
  - Automatic reconnection on tab activation and window focus
- 🕹️ **Cyberpunk Toolbar HUD**: Real-time action badge (`ON`, `BUSY`, `OFF`) and popup interface with active Google Flow/Labs detection and one-click controls.
- 🚪 **HTTP `/rpc` Forwarding Gateway**: Any script, CLI, or MCP tool can command your browser via simple `POST http://127.0.0.1:18885/rpc`.

---

## 📡 Supported RPC Methods

All commands are dispatched via WebSocket (`ws://127.0.0.1:18885`) or HTTP POST (`http://127.0.0.1:18885/rpc`):

| Method | Parameters | Description |
|---|---|---|
| `get_status` | `{}` | Returns connection state, Flow/Labs tab presence, and total tab count. |
| `list_tabs` | `{}` | Returns full roster of open tabs (ID, title, URL, active state, audible). |
| `scroll_page` | `{ tabId?, deltaY?, deltaX?, toTop?, toBottom?, selector? }` | Smoothly scrolls the active page or target container. |
| `type_and_submit` | `{ tabId?, text, submit?, selector? }` | Types text into any rich-text editor or form and optionally presses Enter. |
| `capture_screenshot` | `{ tabId? }` | Captures a high-resolution PNG screenshot of the target tab via CDP. |
| `open_or_focus_flow` | `{ url? }` | Focuses an existing Google Flow/Labs tab or creates a new one. |
| `inject_prompt` | `{ prompt }` | Injects cinematographic prompts into Google Flow's ProseMirror editor. |
| `approve_render` | `{}` | Automatically locates and clicks "Approve" / "Always approve" render modals. |
| `click_download_batch` | `{}` | Triggers batch download of generated video assets in Google Flow. |
| `cdp_command` | `{ tabId?, method, params }` | Raw pass-through to any native Chrome DevTools Protocol method. |

---

## 🚀 Quickstart & Installation

### 1. Load Extension in Google Chrome
1. Clone this repository:
   ```bash
   git clone https://github.com/ssfdre38/google-labs-chrome-extension.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the cloned `google-labs-chrome-extension` directory.

### 2. Start the MCP Bridge Daemon
In your `google-labs-mcp` directory (or using the standalone binary):
```bash
# Option A: Run via Node
node index.js --bridge

# Option B: Run via Standalone SEA Binary
dist\google-labs.exe --bridge
```

The extension icon on your toolbar will immediately turn green **`ON`**.

---

## 🔒 Security & Sandbox Isolation

- **100% Loopback Only**: The bridge daemon binds strictly to `127.0.0.1:18885`. No external network exposure or remote access is allowed.
- **Native Chrome Security**: Operates within Chrome's native security sandbox. When `chrome.debugger` attaches, Chrome displays its standard developer infobar.
- **Zero Credential Storage**: The extension never inspects, extracts, or saves cookies, passwords, or session tokens.

---

## 🔗 Related Ecosystem

- ⚡ **[google-labs-mcp](https://github.com/ssfdre38/google-labs-mcp)**: Model Context Protocol bridge for Google Labs, Flow, Veo 2, Imagen 3, and Creative Director video stitching.
- 🛸 **[gemini-super-system](https://github.com/ssfdre38/gemini-super-system)**: Multi-agent mission control, telemetry HUD, and autonomous swarm orchestrator.

---

## 📄 License

MIT License. Crafted with precision for the sovereign agentic developer community.
