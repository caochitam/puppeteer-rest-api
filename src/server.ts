
import express, { Request, Response } from "express";
import * as Br from "./browser";
import * as Util from "./util";
import { Browser } from "puppeteer-core";
import { spawn } from "child_process";

const chromePaths = require('chrome-paths');
import path from "path";
import fs from "fs";
import MarkdownIt from "markdown-it";
const app = express();
app.use(express.json());


// Endpoint GET /
app.get("/", async (req: Request, res: Response) => {
  try {
    // Xác định đường dẫn README.md (src hoặc dist)
    const cwd = process.cwd();
    let readmePath = path.join(cwd, "README.md");
    if (!fs.existsSync(readmePath)) {
      // Nếu chạy từ dist, README có thể ở thư mục cha
      readmePath = path.join(cwd, "..", "README.md");
    }
    if (!fs.existsSync(readmePath)) {
      return res.status(404).send("README.md not found");
    }
    const markdown = fs.readFileSync(readmePath, "utf8");
    const md = new MarkdownIt();
    const html = md.render(markdown);
    res.type("html").send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

/**
 * @route GET /check-browser
 * @summary Kiểm tra trạng thái trình duyệt Chrome.
 * 
 * @description
 * Endpoint này trả về trạng thái hiện tại của trình duyệt Chrome (đã mở hay chưa). Nếu trình duyệt đã được khởi động và kết nối thành công, trường "open" sẽ là true, ngược lại là false.
 * 
 * @response
 * - Trường hợp thành công: { open: true }
 * - Trường hợp chưa mở: { open: false }
 * - Trường hợp lỗi: { open: false, error: "Internal error", details: <thông tin lỗi> }
 */
app.get("/check-browser", (req: Request, res: Response) => {
  try {
    const isOpen = !!Br.browser && Br.browser?.connected === true;
    res.json({ open: isOpen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ open: false, error: "Internal error", details: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * @route POST /start-browser
 * @summary Khởi động trình duyệt Chrome với các tham số tuỳ chọn.
 * 
 * @description
 * Endpoint này cho phép bạn khởi động một phiên bản Chrome mới với các tuỳ chọn cấu hình như chế độ headless, cổng debug, đường dẫn Chrome, thư mục dữ liệu người dùng, profile, và các tham số bổ sung khác.
 * 
 * @requestBody
 * - headless: boolean | string (true, false, hoặc 'new') - Chạy Chrome ở chế độ headless.
 * - debuggingPort: number - Cổng để debug từ xa.
 * - chromePath: string - Đường dẫn tới file thực thi Chrome (tuỳ chọn, mặc định sẽ tự động tìm).
 * - userDataDir: string - Đường dẫn tới thư mục dữ liệu người dùng (profile), Bắt buộc phải có, nếu sử dụng thư mục mặc định sẽ không bật được debuggingPort.
 * - profileDirectory: string - Tên thư mục profile (ví dụ: 'Default','Profile 1').
 * - anotherArgs: string | string[] - Các tham số dòng lệnh bổ sung cho Chrome.
 * 
 * @response
 * - Trường hợp thành công:
 *   {
 *     "success": true,
 *     "message": "Chrome started",
 *     "pid": <PID của tiến trình Chrome>,
 *     "chromePath": <Đường dẫn Chrome>,
 *     "args": <Danh sách tham số dòng lệnh>
 *   }
 * - Trường hợp lỗi:
 *   {
 *     "error": "Internal error",
 *     "details": <Thông tin chi tiết về lỗi>,
 *     "requestBody": <Nội dung request gửi lên>,
 *     "chromePath": <Đường dẫn Chrome>,
 *     "args": <Danh sách tham số dòng lệnh>
 *   }
 * 
 * @example
 * // Yêu cầu khởi động Chrome ở chế độ headless với cổng debug 9222
 * POST /start-browser
 * {
 *   "headless": true,
 *   "debuggingPort": 9222,
 *   "userDataDir": "C:/chrome-user-data",
 *   "profileDirectory": "Profile 1",
 *   "anotherArgs": "--disable-gpu --no-sandbox"
 * }
 */
app.post("/start-browser", async (req: Request, res: Response) => {
  try {
    const result = await Br.startBrowser(req.body);
    Br.goTo('0', req.body.welcomeUrl ?? `http://localhost:${PORT}`);
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: err.error || "Internal error",
      details: err.details || (err instanceof Error ? err.message : String(err)),
      requestBody: req.body,
      chromePath: err.chromePath,
      args: err.args
    });
  }
});

// Endpoint GET /new-tab
app.get("/new-tab", async (req: Request, res: Response) => {
  try {
    if (!Br.browser) {
      console.log("Không tồn tại browser");
      return res.status(400).json({ error: "Browser not started. Please start the browser first." });
    }
    const pageId = await Br.newTab();
    res.json({ pageId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});


/**
 * @route POST /go-to
 * @summary Điều hướng một tab (page) tới URL chỉ định.
 * 
 * @description
 * Endpoint này cho phép điều hướng một tab đã mở (theo pageId) tới một URL mới, với các tuỳ chọn timeout và waitUntil.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần điều hướng.
 * - url: string - Địa chỉ URL cần truy cập.
 * - options: object (tuỳ chọn)
 *    - timeout: number - Thời gian timeout (ms).
 *    - waitUntil: string hoặc string[] - Sự kiện lifecycle để chờ (ví dụ: 'load', 'networkidle2').
 * 
 * @response
 * - Trường hợp thành công: { success: true }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/go-to", async (req: Request, res: Response) => {
  try {
    const { pageId, url, userAgent, options } = req.body;
    if (!pageId || !url) {
      return res.status(400).json({ success: false, error: "Missing pageId or url" });
    }
    const result = await Br.goTo(pageId, url, userAgent, options);
    console.log("Go to result:", result);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Failed to navigate" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * @route POST /click
 * @summary Click một selector trên tab chỉ định.
 * 
 * @description
 * Endpoint này cho phép thực hiện thao tác click lên một selector trên tab (page) đã mở, với các tuỳ chọn delay, button, clickCount, timeout.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần thao tác.
 * - selector: string - CSS selector cần click.
 * - options: object (tuỳ chọn)
 *    - delay: number - Độ trễ (ms) giữa các lần click.
 *    - button: "left" | "right" | "middle" - Loại nút chuột.
 *    - clickCount: number - Số lần click.
 *    - timeout: number - Thời gian timeout (ms) chờ selector xuất hiện.
 * 
 * @response
 * - Trường hợp thành công: { success: true }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/click", async (req: Request, res: Response) => {
  try {
    const { pageId, selector, options } = req.body;
    console.log("Take Click to selector:", selector);
    if (!pageId || !selector) {
      return res.status(400).json({ success: false, error: "Missing pageId or selector" });
    }
    const result = await Br.click(pageId, selector, options);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Failed to click selector" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * @route POST /type
 * @summary Gõ text vào một selector trên tab chỉ định.
 * 
 * @description
 * Endpoint này cho phép gõ một chuỗi text vào một selector trên tab (page) đã mở, với các tuỳ chọn delay, timeout, clear.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần thao tác.
 * - selector: string - CSS selector cần gõ text.
 * - text: string - Chuỗi text cần nhập.
 * - options: object (tuỳ chọn)
 *    - delay: number - Độ trễ (ms) giữa các ký tự.
 *    - timeout: number - Thời gian timeout (ms) chờ selector xuất hiện.
 *    - clear: boolean - Xoá nội dung cũ trước khi nhập.
 * 
 * @response
 * - Trường hợp thành công: { success: true }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/type", async (req: Request, res: Response) => {
  try {
    const { pageId, selector, text, options } = req.body;
    if (!pageId || !selector || typeof text !== "string") {
      return res.status(400).json({ success: false, error: "Missing pageId, selector, or text" });
    }
    const result = await Br.type(pageId, selector, text, options);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Failed to type into selector" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * @route POST /wait-for-selector
 * @summary Chờ một selector xuất hiện trên tab chỉ định.
 * 
 * @description
 * Endpoint này cho phép chờ một selector xuất hiện (hoặc ẩn đi) trên tab (page) đã mở, với các tuỳ chọn timeout, visible, hidden.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần thao tác.
 * - selector: string - CSS selector cần chờ.
 * - options: object (tuỳ chọn)
 *    - timeout: number - Thời gian timeout (ms) chờ selector xuất hiện.
 *    - visible: boolean - Chờ selector xuất hiện và hiển thị.
 *    - hidden: boolean - Chờ selector bị ẩn đi.
 * 
 * @response
 * - Trường hợp thành công: { success: true }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/wait-for-selector", async (req: Request, res: Response) => {
  try {
    const { pageId, selector, options } = req.body;
    if (!pageId || !selector) {
      return res.status(400).json({ success: false, error: "Missing pageId or selector" });
    }
    const result = await Br.waitForSelector(pageId, selector, options);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Failed to wait for selector" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * @route POST /wait-for-function
 * @summary Chờ một điều kiện hàm JavaScript trên tab chỉ định.
 * 
 * @description
 * Endpoint này cho phép chờ một điều kiện hàm JavaScript (predicate) trên tab (page) đã mở, với các tuỳ chọn timeout và polling.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần thao tác.
 * - fn: string - Hàm JavaScript hoặc biểu thức cần kiểm tra (ví dụ: 'window.someVar === true').
 * - options: object (tuỳ chọn)
 *    - timeout: number - Thời gian timeout (ms) chờ điều kiện.
 *    - polling: number | 'raf' | 'mutation' - Cách polling kiểm tra điều kiện.
 * 
 * @response
 * - Trường hợp thành công: { success: true }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/wait-for-function", async (req: Request, res: Response) => {
  try {
    const { pageId, fn, options } = req.body;
    if (!pageId || !fn) {
      return res.status(400).json({ success: false, error: "Missing pageId or fn" });
    }
    const result = await Br.waitForFunction(pageId, fn, options);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Failed to wait for function" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * @route POST /evaluate
 * @summary Thực thi hàm JavaScript trên tab chỉ định.
 * 
 * @description
 * Endpoint này cho phép thực thi một hàm JavaScript (dưới dạng string) trên tab (page) đã mở.
 * 
 * @requestBody
 * - pageId: string - ID của tab cần thao tác.
 * - fn: string - Hàm JavaScript hoặc biểu thức cần thực thi.
 * 
 * @response
 * - Trường hợp thành công: { success: true, result: <kết quả trả về từ evaluate> }
 * - Trường hợp lỗi: { success: false, error: <thông tin lỗi> }
 */
app.post("/evaluate", async (req: Request, res: Response) => {
  try {
    const { pageId, fn } = req.body;
    if (!pageId || !fn) {
      return res.status(400).json({ success: false, error: "Missing pageId or fn" });
    }
    const result = await Br.evaluate(pageId, fn);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Screenshot endpoint
app.post("/screenshot", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });
    if (!Br.browser) {
      return res.status(400).json({ error: "Browser not started. Please start the browser first." });
    }
    const page = await Br.browser!.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    const buffer = await page.screenshot({ fullPage: true });
    await page.close();

    res.type("image/png");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

// HTML endpoint
app.post("/html", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });
    if (!Br.browser) {
      return res.status(400).json({ error: "Browser not started. Please start the browser first." });
    }
    const page = await Br.browser!.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();
    await page.close();

    res.type("text/html");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});


// Start server
const args = process.argv.slice(2);
const PORT = args[0] || process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`REST API running at http://localhost:${PORT}`);
});
