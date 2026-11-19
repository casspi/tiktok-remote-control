const params = new URLSearchParams(location.search);
const token = params.get("token") || localStorage.getItem("token") || "";
let socket = null;

function setStatus(on, text) {
  document.getElementById("status").classList.toggle("on", on);
  document.getElementById("hint").textContent = text;
}

function send(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function connect() {
  const host = location.hostname;
  const port = location.port || "8787";
  socket = new WebSocket(`ws://${host}:${port}?role=controller&token=${token}`);
  socket.onopen = () => setStatus(true, "已连接");
  socket.onclose = () => {
    setStatus(false, "断开，重连中…");
    setTimeout(connect, 2000);
  };
  socket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.error === "agent_offline") {
      setStatus(false, "电脑端扩展未连接");
    } else if (msg.type === "status") {
      setStatus(true, `已连接 · ${msg.text}`);
    }
  };
}

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => send({ cmd: btn.dataset.cmd }));
});

let autoOn = false;
document.getElementById("auto").addEventListener("click", (e) => {
  autoOn = !autoOn;
  e.target.textContent = autoOn ? "停止自动刷" : "自动刷";
  send({ cmd: autoOn ? "autoplay" : "stop", interval: 8 });
});

if (!token) {
  setStatus(false, "缺少 token，请用 relay 输出的完整链接访问");
} else {
  localStorage.setItem("token", token);
  connect();
}
