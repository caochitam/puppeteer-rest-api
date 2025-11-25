import { io } from "socket.io-client";
import * as Br from "./browser";
import { askQuestion, parseArgs } from "./util";
import express from "express";
import cors from "cors";
console.log("🚀 Auto Browser Controller V1.4.1");
(async () => {

  // ==========================
  // 📦 Map các handler
  // ==========================
  const handlerMap: Record<string, Function> = {
    "start-browser": Br.startBrowser,
    "new-tab": Br.newTab,
    "go-to": Br.goTo,
    "click": Br.click,
    "type": Br.type,
    "wait-for-selector": Br.waitForSelector,
    "wait-for-function": Br.waitForFunction,
    "evaluate": Br.evaluate,
    "close-tab": Br.closeTab,
    "check-browser": Br.checkBrowser,
    "cookies": Br.cookies,
    "set-cookie": Br.setCookie,
    "reload": Br.reload,
    "cookie-header": Br.cookieHeaderString,
    "scroll-down": Br.scrollDown,
  };

  // =====================
  // Đọc tham số dòng lệnh
  // =====================

  const args = parseArgs();

  // Các cách lấy channel: --channel=xxx OR first positional OR env CHANNEL
  let apiKey =
    (args as any).channel ||
    (args as any)["channel"] ||
    args._[0] ||
    process.env.channel;

  if (!apiKey) {
    console.error(
      `Thiếu ID KÊNH!
      Cách sử dụng: auto.exe <ID_KÊNH> OR auto.exe --channel=ID_KÊNH OR set ID_KÊNH env var
      Nếu chưa có channel, bạn có thể dăng ký tại https://auto.pada.vn`
    );
    apiKey = await askQuestion("Bạn cũng có thể nhập ID KÊNH hoặc cổng localhost tại đây: ");
  }

  // Nếu không có apiKey HOẶC apiKey là dạng số => chạy chế độ LOCAL EXPRESS SERVER
  if (!apiKey || !isNaN(Number(apiKey))) {
    const PORT = Number(apiKey) || process.env.PORT || 3000;
    console.warn("⚠️ Không có ID KÊNH => Chạy ở chế độ LOCAL API (Express) với cổng ", PORT);



    const app = express();

    app.use(cors());
    app.use(express.json({ limit: 'Infinity' }));
    app.use(express.urlencoded({ extended: true, limit: 'Infinity' }));

    // Endpoint chính: /r/:ep
    app.post("/r/:ep", async (req: any, res: any) => {
      const ep = req.params.ep;
      const fn = handlerMap[ep]; // Dùng lại handlerMap toàn cục

      if (!fn) {
        return res.status(404).json({
          success: false,
          error: `Unknown endpoint: ${ep}`,
        });
      }

      try {
        const payload = req.body || {};
        const result = await fn(payload);
        res.json(result);
      } catch (err: any) {
        console.error(`❌ Lỗi khi xử lý endpoint '${ep}':`, err);
        res.status(500).json({
          success: false,
          error: err.message || "Internal error",
          stack: err.stack,
        });
      }
    });

    // Root để test nhanh
    app.get("/", (req: any, res: any) => {
      res.send({
        message: "Local worker API is running....\nTruy cập https://auto.pada.vn để biết thêm chi tiết.",
        availableEndpoints: Object.keys(handlerMap),
      });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Local API server chạy tại http://localhost:${PORT}`);
      console.log(`Điều khiển thông qua API bằng cách POST tới http://localhost:${PORT}/r/:endpoint với body JSON tương ứng.`);
      console.log("🧩 Các endpoint khả dụng:", Object.keys(handlerMap).join(", "));
      console.log("📚 Xem tài liệu tại https://auto.pada.vn");
    });

    // Ngừng socket mode, chỉ chạy local API
    return;
  }
  // Kết nối tới server với channel đã có
  else {
    console.log("Khởi động controller với channel =", apiKey);

    // =====================
    // ⚙️ Cấu hình kết nối
    // =====================
    const SERVER_URL = String.fromCharCode(
      ...[104, 116, 116, 112, 115, 58, 47, 47, 97, 117, 116, 111, 46, 112, 97, 100, 97, 46, 118, 110]
    ); // https://auto.pada.vn

    const socket = io(SERVER_URL, {
      extraHeaders: {
        Authorization: `Bearer ${apiKey}`,
      },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000,
    });

    // =====================
    // 📡 Kết nối cơ bản
    // =====================
    socket.on("connect", () => {
      console.log("✅ Đã kết nối WS tới server!");
    });

    socket.on("welcome", (msg) => console.log("📨", msg));
    socket.on("disconnect", (reason) => console.log("❌ Ngắt:", reason));
    socket.on("connect_error", (err) => console.error("⚠️ Lỗi:", err.message));
    // Gửi ping định kỳ mỗi 30s
    setInterval(() => {
      if (socket.connected) {
        socket.emit("keepalive", Date.now());
      }
    }, 30000);

    socket.on("keepalive_ack", (data) => {
      // console.log("✅ Pong từ server:", data);
    });

    // =====================
    // 🧩 Hàm tiện ích phản hồi
    // =====================
    async function handleRequest(event: string, payload: any) {
      const requestId = payload._requestId;
      const fn = handlerMap[event];
      if (!fn) {
        socket.emit(`response-${requestId}`, { error: `Unknown event: ${event}` });
        return;
      }

      try {
        const result = await fn(payload);
        socket.emit(`response-${requestId}`, result);
      } catch (err: any) {
        socket.emit(`response-${requestId}`, {
          success: false,
          error: err.message || "Internal error",
          stack: err.stack,
        });
      }
    }

    // =====================
    // 🧠 Đăng ký tất cả event
    // =====================
    for (const event of Object.keys(handlerMap)) {
      socket.on(event, async (payload) => handleRequest(event, payload));
    }
  }


})();
