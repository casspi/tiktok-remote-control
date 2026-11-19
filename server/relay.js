const os = require("os");
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.TOKEN || crypto.randomBytes(8).toString("hex");
const PWA_DIR = path.join(__dirname, "..", "pwa");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

let agentSocket = null;
const controllers = new Set();

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function servePwa(req, res) {
  const urlPath = req.url.split("?")[0];
  const rel =
    urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const filePath = path.join(PWA_DIR, rel);
  if (!filePath.startsWith(PWA_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(buf);
  });
}

const server = http.createServer(servePwa);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");

  if (token !== TOKEN) {
    ws.close(4001, "unauthorized");
    return;
  }

  if (role === "agent") {
    agentSocket = ws;
    console.log("[relay] agent (extension) connected");
    // 扩展上报的状态（如快捷键失败原因）广播给所有手机端
    ws.on("message", (data) => {
      for (const controller of controllers) {
        if (controller.readyState === 1) controller.send(data.toString());
      }
    });
    ws.on("close", () => {
      if (agentSocket === ws) agentSocket = null;
      console.log("[relay] agent disconnected");
    });
    return;
  }

  console.log("[relay] controller (phone) connected");
  controllers.add(ws);
  ws.on("close", () => controllers.delete(ws));
  ws.on("message", (data) => {
    if (agentSocket && agentSocket.readyState === 1) {
      console.log("[relay] cmd ->", data.toString());
      agentSocket.send(data.toString());
    } else {
      console.log("[relay] cmd dropped (agent offline):", data.toString());
      ws.send(JSON.stringify({ ok: false, error: "agent_offline" }));
    }
  });
});

server.listen(PORT, () => {
  const ip = lanAddress();
  console.log("---------------------------------------------");
  console.log(" auto-tiktok relay is running");
  console.log(` 手机访问 (PWA):  http://${ip}:${PORT}/?token=${TOKEN}`);
  console.log(` 连接地址:        ws://${ip}:${PORT}`);
  console.log(` TOKEN:          ${TOKEN}`);
  console.log("---------------------------------------------");
  console.log(" 把上面的地址和 TOKEN 填进手机页面和扩展即可");
});
