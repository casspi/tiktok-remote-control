// 后台负责：更新图标角标 + 通过 chrome.debugger 发送「可信按键」（CDP Input 事件）
// 只有可信按键才会触发抖音网页版的快捷键，content script 里的 dispatchEvent 会被忽略。

// 快捷键映射：与抖音网页版快捷键一一对应
const KEY_MAP = {
  playpause: { key: " ", code: "Space", vk: 32, text: " " },
  next: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  prev: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  forward: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  rewind: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  fullscreen: { key: "h", code: "KeyH", vk: 72, text: "h" },
  webFullscreen: { key: "y", code: "KeyY", vk: 89, text: "y" },
  volUp: { key: "+", code: "Equal", vk: 187, text: "+", modifiers: 8 },
  volDown: { key: "_", code: "Minus", vk: 189, text: "_", modifiers: 8 },
  search: { key: "F", code: "KeyF", vk: 70, text: "F", modifiers: 8 },
  comment: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  esc: { key: "Escape", code: "Escape", vk: 27 },
};

const attachedTabs = new Set();

chrome.debugger.onDetach.addListener((source) => {
  if (source && source.tabId != null) attachedTabs.delete(source.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    const message = String((err && err.message) || err);
    if (message.includes("Another debugger")) {
      throw new Error("请关闭该抖音标签页的开发者工具后再试");
    }
    throw err;
  }
  attachedTabs.add(tabId);
}

async function dispatchKey(tabId, name) {
  if (tabId == null) return { ok: false, error: "找不到抖音标签页" };
  const def = KEY_MAP[name];
  if (!def) return { ok: false, error: `未知按键 ${name}` };

  await ensureAttached(tabId);

  const target = { tabId };
  const base = {
    modifiers: def.modifiers || 0,
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.vk,
    nativeVirtualKeyCode: def.vk,
  };

  const down = { type: def.text ? "keyDown" : "rawKeyDown", ...base };
  if (def.text) {
    down.text = def.text;
    down.unmodifiedText = def.text;
  }

  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", down);
  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
    type: "keyUp",
    ...base,
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "badge") {
    chrome.action.setBadgeText({ text: msg.text || "" });
    return;
  }

  if (msg.type === "closeTab") {
    if (sender.tab && sender.tab.id != null) {
      chrome.tabs.remove(sender.tab.id);
    }
    return;
  }

  if (msg.type === "key") {
    const tabId = sender.tab && sender.tab.id;
    dispatchKey(tabId, msg.name)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: String((err && err.message) || err) }),
      );
    return true;
  }
});
