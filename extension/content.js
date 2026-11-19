const DEFAULT_CONFIG = { host: "127.0.0.1", port: 8787, token: "" };

// 这些指令全部通过后台的 chrome.debugger 发送可信快捷键
const KEY_COMMANDS = new Set([
  "next",
  "prev",
  "playpause",
  "forward",
  "rewind",
  "fullscreen",
  "webFullscreen",
  "volUp",
  "volDown",
  "search",
  "comment",
  "esc",
]);

let config = { ...DEFAULT_CONFIG };
let socket = null;
let reconnectTimer = null;
let autoTimer = null;

function setBadge(text) {
  chrome.runtime.sendMessage({ type: "badge", text }).catch(() => {});
}

function relayStatus(text) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "status", text }));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function connect() {
  if (!config.token) return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  socket = new WebSocket(
    `ws://${config.host}:${config.port}?role=agent&token=${config.token}`,
  );
  socket.onopen = () => setBadge("ON");
  socket.onclose = () => {
    setBadge("OFF");
    scheduleReconnect();
  };
  socket.onerror = () => {
    try {
      socket.close();
    } catch {
      /* 忽略关闭异常 */
    }
  };
  socket.onmessage = (event) => handleCommand(event.data);
}

function restart() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      /* 忽略关闭异常 */
    }
    socket = null;
  }
  connect();
}

function clickLike() {
  const btn = document.querySelector('[data-e2e="video-player-digg"]');
  if (btn) btn.click();
}

async function pressKey(name) {
  const res = await chrome.runtime
    .sendMessage({ type: "key", name })
    .catch((err) => ({ ok: false, error: String(err) }));
  if (res && !res.ok) {
    relayStatus(`「${name}」失败：${res.error}`);
  }
}

function startAuto(intervalSeconds) {
  stopAuto();
  const ms = Math.max(3, Number(intervalSeconds) || 8) * 1000;
  autoTimer = setInterval(() => pressKey("next"), ms);
}

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

async function handleCommand(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const cmd = msg.cmd;

  if (KEY_COMMANDS.has(cmd)) {
    await pressKey(cmd);
    return;
  }

  switch (cmd) {
    case "like":
      clickLike();
      break;
    case "closeTab":
      chrome.runtime.sendMessage({ type: "closeTab" }).catch(() => {});
      break;
    case "autoplay":
      startAuto(msg.interval);
      break;
    case "stop":
      stopAuto();
      break;
  }
}

chrome.storage.local.get(["host", "port", "token"], (saved) => {
  config = { ...DEFAULT_CONFIG, ...saved };
  connect();
});

chrome.storage.onChanged.addListener((changes) => {
  for (const key of Object.keys(changes)) {
    config[key] = changes[key].newValue;
  }
  restart();
});
