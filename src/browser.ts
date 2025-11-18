import puppeteer, { Browser, EvaluateFunc, Page, PuppeteerLifeCycleEvent } from "puppeteer-core";
// import puppeteer from "puppeteer-extra";
import { spawn } from "child_process";
import { buildUserAgentMetadata, BrowserResult } from "./util";
const chromePaths = require("chrome-paths");

let browser: Browser | null = null;
export const pagesMap: Map<string, Page> = new Map();
export { browser };

// ==============================
// Kiểm tra trạng thái browser
// ==============================
export async function checkBrowser(_: any = {}): Promise<BrowserResult> {
  return {
    success: true,
    opened: !!browser && browser.connected === true,
  };
}

// ==============================
// Khởi động Chrome và kết nối
// ==============================
export async function startBrowser(payload: {
  headless?: boolean | string;
  debuggingPort?: string;
  chromePath?: string;
  userDataDir?: string;
  profileDirectory?: string;
  anotherArgs?: string | string[];
  welcomeUrl?: string;
}): Promise<BrowserResult> {
  const options = payload;
  let chrome = options.chromePath || chromePaths.chrome;
  let exeargs: string[] = [];

  try {
    if (options.debuggingPort)
      exeargs.push(`--remote-debugging-port=${options.debuggingPort}`);

    if (options.headless) {
      const h = String(options.headless).trim().toLowerCase();
      if (h === "true" || h === "new") exeargs.push("--headless=new");
    }

    if (options.userDataDir) exeargs.push(`--user-data-dir=${options.userDataDir}`);
    if (options.profileDirectory)
      exeargs.push(`--profile-directory=${options.profileDirectory}`);

    if (options.anotherArgs) {
      if (typeof options.anotherArgs === "string")
        exeargs.push(...options.anotherArgs.trim().split(/\s+/).filter(Boolean));
      else exeargs.push(...options.anotherArgs);
    }

    console.log(`Starting Chrome with path: ${chrome}`);
    console.log(`Chrome launch arguments:`, exeargs);

    const chromeProcess = spawn(chrome, exeargs, { stdio: "ignore" });

    return new Promise((resolve) => {
      chromeProcess.once("error", (err) => {
        resolve({
          success: false,
          error: "Failed to start Chrome",
          details: err instanceof Error ? err.message : String(err),
          chromePath: chrome,
          args: exeargs,
        });
      });

      setTimeout(async () => {
        if (!chromeProcess.killed && chromeProcess.pid) {
          try {
            await connectBrowser(options.debuggingPort ?? "9222");
            try {
              if (browser) {
                const pages = await browser.pages();
                const firstPage = pages && pages.length > 0 ? pages[0] : await browser.newPage();
                const welcome = options.welcomeUrl && String(options.welcomeUrl).trim() ? options.welcomeUrl.trim() : "https://auto.pada.vn";
                firstPage!.goto(welcome, { timeout: 30000, waitUntil: "load" });
                console.log(`Opening welcome URL: ${welcome}`);
              }
            } catch (err) {
              console.warn("Failed to open welcome URL", err);
            }
            resolve({
              success: true,
              message: "Chrome started and connected",
              pid: chromeProcess.pid,
              chromePath: chrome,
              args: exeargs,
            });
          } catch (err) {
            resolve({
              success: false,
              error: "Failed to connect to Chrome",
              details: err instanceof Error ? err.message : String(err),
              chromePath: chrome,
              args: exeargs,
            });
          }
        } else {
          resolve({
            success: false,
            error: "Chrome process did not start properly",
            chromePath: chrome,
            args: exeargs,
          });
        }
      }, 500);
    });
  } catch (err: any) {
    return { success: false, error: err.message || "Lỗi khởi tạo Chrome" };
  }
}

// ==============================
// Kết nối browser qua cổng debugging
// ==============================
export async function connectBrowser(debuggingPort: string): Promise<BrowserResult> {
  const maxAttempts = 30;
  let attempt = 0;
  let webSocketDebuggerUrl: string | null = null;

  try {
    while (attempt < maxAttempts) {
      try {
        const res = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
        if (res.ok) {
          const data = await res.json();
          webSocketDebuggerUrl = data.webSocketDebuggerUrl;
          if (webSocketDebuggerUrl) break;
        }
      } catch {}
      attempt++;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!webSocketDebuggerUrl)
      return { success: false, error: "Không thể lấy WebSocketDebuggerUrl sau 30s" };

    attempt = 0;
    while (attempt < maxAttempts) {
      try {
        browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
        console.log("Browser connected");
        return { success: true };
      } catch {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { success: false, error: "Không thể kết nối browser sau 30s" };
  } catch (err: any) {
    return { success: false, error: err.message || "Lỗi khi kết nối browser" };
  }
}

// ==============================
// Tạo tab mới
// ==============================
export async function newTab(_: any = {}): Promise<BrowserResult> {
  try {
    if (!browser)
      return { success: false, error: "Browser chưa khởi tạo hoặc chưa kết nối" };

    const tabID = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    console.log("Creating new page");
    const page = await browser.newPage();
    await page.setViewport(null);
    pagesMap.set(tabID, page);

    return { success: true, tabID };
  } catch (err: any) {
    return { success: false, error: err.message || "Tạo tab mới thất bại" };
  }
}

// ==============================
// Điều hướng URL
// ==============================
export async function goTo(payload: {
  tabID: string;
  url: string;
  userAgent?: string;
  options?: { timeout?: number; waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[] };
}): Promise<BrowserResult> {
  try {
    const { tabID, url, userAgent, options } = payload;
    let page: Page | undefined;

    if (tabID === "0") {
      const pages = await browser?.pages();
      page = pages && pages.length > 0 ? pages[0] : undefined;
    } else {
      page = pagesMap.get(tabID);
    }

    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    if (userAgent) {
      const uaMeta = buildUserAgentMetadata(userAgent);
      await page.setUserAgent(uaMeta.userAgent);
    }

    await page.goto(url, {
      timeout: options?.timeout ?? 30000,
      waitUntil: options?.waitUntil ?? "load",
    });

    console.log(`Navigated to ${url} on tab ${tabID}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Điều hướng thất bại" };
  }
}

// ==============================
// Click selector
// ==============================
export async function click(payload: {
  tabID: string;
  selector: string;
  options?: { delay?: number; button?: "left" | "right" | "middle"; clickCount?: number; timeout?: number };
}): Promise<BrowserResult> {
  try {
    const { tabID, selector, options } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    await page.waitForSelector(selector, { timeout: options?.timeout ?? 30000 });
    await page.click(selector, {
      delay: options?.delay ?? 0,
      button: options?.button ?? "left",
      clickCount: options?.clickCount ?? 1,
    });

    console.log(`Clicked selector "${selector}" on tab ${tabID}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Click thất bại" };
  }
}

// ==============================
// Gõ text
// ==============================
export async function type(payload: {
  tabID: string;
  selector: string;
  text: string;
  options?: { delay?: number; timeout?: number; clear?: boolean };
}): Promise<BrowserResult> {
  try {
    const { tabID, selector, text, options } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    await page.waitForSelector(selector, { timeout: options?.timeout ?? 30000 });

    if (options?.clear) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) el.value = "";
      }, selector);
    }

    await page.type(selector, text, { delay: options?.delay ?? 0 });
    const limitedText = text.slice(0, 100);
    console.log(`Typed into ${selector} with text:\n\t"${limitedText}"`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Nhập text thất bại" };
  }
}

// ==============================
// Chờ selector
// ==============================
export async function waitForSelector(payload: {
  tabID: string;
  selector: string;
  options?: { timeout?: number; visible?: boolean; hidden?: boolean };
}): Promise<BrowserResult> {
  try {
    const { tabID, selector, options } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    await page.waitForSelector(selector, {
      timeout: options?.timeout ?? 30000,
      visible: options?.visible ?? false,
      hidden: options?.hidden ?? false,
    });

    console.log(`Selector "${selector}" appeared on tab ${tabID}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Chờ selector thất bại" };
  }
}

// ==============================
// Chờ function
// ==============================
export async function waitForFunction(payload: {
  tabID: string;
  fn: string | EvaluateFunc<[]>;
  options?: { timeout?: number; polling?: number | "raf" | "mutation" };
}): Promise<BrowserResult> {
  try {
    const { tabID, fn, options } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    await page.waitForFunction(fn, {
      timeout: options?.timeout ?? 30000,
      polling: options?.polling ?? "raf",
    });

    console.log(`Function condition met on tab ${tabID}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Chờ function thất bại" };
  }
}

// ==============================
// Evaluate script
// ==============================
export async function evaluate(payload: {
  tabID: string;
  fn: string;
}): Promise<BrowserResult> {
  try {
    const { tabID, fn } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    const result = await page.evaluate(`(${fn})()`);
    console.log(`Evaluated function on tab ${tabID}`);
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || "Evaluate thất bại" };
  }
}

// ==============================
// Đóng tab
// ==============================
export async function closeTab(payload: { tabID: string }): Promise<BrowserResult> {
  try {
    const { tabID } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };
    page.browserContext().setCookie()
    await page.close();
    pagesMap.delete(tabID);
    console.log(`Closed tab ${tabID}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Đóng tab thất bại" };
  }
}
/**
 * Lấy cookies của tab
 */
export async function cookies(payload: { tabID: string }): Promise<BrowserResult> {
  try {
    const { tabID } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };
    const cookies = await page.browserContext().cookies();
    return { success: true, cookies };
  } catch (err: any) {
    return { success: false, error: err.message || "Lấy cookies thất bại" };
  }
}

/**
 * Đặt cookies cho tab
 */
export async function setCookie(payload: { tabID: string; cookies: any[] | string }): Promise<BrowserResult> {
  try {
    const { tabID, cookies } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };

    let cookiesArr: any[];
    if (typeof cookies === "string") {
      try {
        cookiesArr = JSON.parse(cookies);
        if (!Array.isArray(cookiesArr)) throw new Error("Cookies string không phải dạng mảng");
      } catch (err) {
        return { success: false, error: "Cookies string không hợp lệ" };
      }
    } else {
      cookiesArr = cookies;
    }

    await page.browserContext().setCookie(...cookiesArr);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Đặt cookies thất bại" };
  }
}

/**
 * Reload lại tab
 */
export async function reload(payload: { tabID: string; options?: { timeout?: number; waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[] } }): Promise<BrowserResult> {
  try {
    const { tabID, options } = payload;
    const page = pagesMap.get(tabID);
    if (!page) return { success: false, error: `Không tìm thấy tab ${tabID}` };
    await page.reload({
      timeout: options?.timeout ?? 30000,
      waitUntil: options?.waitUntil ?? "load",
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Reload thất bại" };
  }
}