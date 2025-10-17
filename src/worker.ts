import { io } from "socket.io-client";
import * as Br from "./browser";
import { parseArgs } from "./util";

// =====================
// Đọc tham số dòng lệnh
// =====================

const args = parseArgs();

// Các cách lấy apiKey: --apiKey=xxx OR first positional OR env API_KEY
const apiKey = (args as any).apiKey || (args as any)['api-key'] || args._[0] || process.env.API_KEY;

if (!apiKey) {
  console.error('Thiếu apiKey. Cách sử dụng: worker.exe <apiKey> OR worker.exe --apiKey=XXX OR set API_KEY env var');
  process.exit(1);
}

console.log('Khởi động worker với apiKey =', apiKey);

// =====================
// ⚙️ Cấu hình kết nối
// =====================
// const apiKey = "CzWwFoj0vnnRgsg2AAAB";
const SERVER_URL = "https://auto.pada.vn"; // đổi thành địa chỉ thật của server.ts

const socket = io(SERVER_URL, {
  extraHeaders: {
    Authorization: `Bearer ${apiKey}`,
  },
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

// =====================
// 📡 Kết nối cơ bản
// =====================
socket.on("connect", () => {
  // console.log("✅ Đã kết nối WS tới server! Socket id:", socket.id);
});

socket.on("welcome", (msg) => console.log("📨", msg));

socket.on("disconnect", (reason) => console.log("❌ Ngắt:", reason));

socket.on("connect_error", (err) => console.error("⚠️ Lỗi:", err.message));

// =====================
// 🧩 Hàm tiện ích phản hồi
// =====================
async function handleRequest(event: string, payload: any, handler: (payload: any) => Promise<any>) {
  const requestId = payload._requestId;
  try {
    const result = await handler(payload);
    socket.emit(`response-${requestId}`, result);
  } catch (err: any) {
    socket.emit(`response-${requestId}`, {
      error: err.message || "Internal error",
      stack: err.stack,
    });
  }
}

// =====================
// ⚙️ Các event xử lý
// =====================

// 1️⃣ Start Browser
socket.on("start-browser", async (payload) => {
  await handleRequest("start-browser", payload, async (data) => {
    const result = await Br.startBrowser(data);
    if (data.welcomeUrl) {
      await Br.goTo("0", data.welcomeUrl);
    }
    return { success: true, message: "Browser started" };
  });
});

// 2️⃣ New Tab
socket.on("new-tab", async (payload) => {
  await handleRequest("new-tab", payload, async () => {
    if (!Br.browser) throw new Error("Browser not started");
    const tabID = await Br.newTab();
    return { tabID };
  });
});

// 3️⃣ Go To
socket.on("go-to", async (payload) => {
  await handleRequest("go-to", payload, async ({ tabID, url, userAgent, options }) => {
    if (!tabID || !url) throw new Error("Missing tabID or url");
    const result = await Br.goTo(tabID, url, userAgent, options);
    return { success: !!result };
  });
});

// 4️⃣ Click
socket.on("click", async (payload) => {
  await handleRequest("click", payload, async ({ tabID, selector, options }) => {
    if (!tabID || !selector) throw new Error("Missing tabID or selector");
    const result = await Br.click(tabID, selector, options);
    return { success: !!result };
  });
});

// 5️⃣ Type
socket.on("type", async (payload) => {
  await handleRequest("type", payload, async ({ tabID, selector, text, options }) => {
    if (!tabID || !selector || typeof text !== "string")
      throw new Error("Missing tabID, selector, or text");
    const result = await Br.type(tabID, selector, text, options);
    return { success: !!result };
  });
});

// 6️⃣ Wait For Selector
socket.on("wait-for-selector", async (payload) => {
  await handleRequest("wait-for-selector", payload, async ({ tabID, selector, options }) => {
    if (!tabID || !selector) throw new Error("Missing tabID or selector");
    const result = await Br.waitForSelector(tabID, selector, options);
    return { success: !!result };
  });
});

// 7️⃣ Wait For Function
socket.on("wait-for-function", async (payload) => {
  await handleRequest("wait-for-function", payload, async ({ tabID, fn, options }) => {
    if (!tabID || !fn) throw new Error("Missing tabID or fn");
    const result = await Br.waitForFunction(tabID, fn, options);
    return { success: !!result };
  });
});

// 8️⃣ Evaluate
socket.on("evaluate", async (payload) => {
  await handleRequest("evaluate", payload, async ({ tabID, fn }) => {
    if (!tabID || !fn) throw new Error("Missing tabID or fn");
    const result = await Br.evaluate(tabID, fn);
    return result;
  });
});

// 9️⃣ Screenshot
socket.on("screenshot", async (payload) => {
  await handleRequest("screenshot", payload, async ({ url }) => {
    if (!url) throw new Error("Missing url");
    if (!Br.browser) throw new Error("Browser not started");
    const page = await Br.browser!.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    const buffer = await page.screenshot({ fullPage: true });
    await page.close();
    return { success: true, buffer: buffer.toString() }; // trả ảnh base64
  });
});

// 🔟 HTML
socket.on("html", async (payload) => {
  await handleRequest("html", payload, async ({ url }) => {
    if (!url) throw new Error("Missing url");
    if (!Br.browser) throw new Error("Browser not started");
    const page = await Br.browser!.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();
    await page.close();
    return { success: true, html };
  });
});

// 1️⃣1️⃣ Close Tab
socket.on("close-tab", async (payload) => {
  await handleRequest("close-tab", payload, async ({ tabID }) => {
    if (!tabID) throw new Error("Missing tabID");
    const result = await Br.closeTab(tabID);
    return { success: !!result };
  });
});

// 1️⃣2️⃣ Check Browser
socket.on("check-browser", async (payload) => {
  await handleRequest("check-browser", payload, async () => {
    const isOpen = !!Br.browser && Br.browser?.connected === true;
    return { opened: isOpen };
  });
});