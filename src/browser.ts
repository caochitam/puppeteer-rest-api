import puppeteer, { Browser, EvaluateFunc, Page, PuppeteerLifeCycleEvent } from "puppeteer-core";
import { spawn } from "child_process";
import { buildUserAgentMetadata } from "./util"
const chromePaths = require('chrome-paths');

let browser: Browser | null = null;
// Biến lưu trữ các page với id ngẫu nhiên
export const pagesMap: Map<string, Page> = new Map();
export { browser };

export async function startBrowser(options: {
  headless?: boolean | string,
  debuggingPort?: string,
  chromePath?: string,
  userDataDir?: string,
  profileDirectory?: string,
  anotherArgs?: string | string[],
  welcomeUrl?: string
}) {
  let chrome = options.chromePath || chromePaths.chrome;
  let exeargs: string[] = [];

  if (options.debuggingPort) {
    exeargs.push(`--remote-debugging-port=${options.debuggingPort}`);
  }
  if (options.headless) {
    let headlessStr = String(options.headless).trim().toLowerCase();
    if (headlessStr === 'true' || headlessStr === 'new') {
      exeargs.push('--headless=new');
    }
  }
  if (options.userDataDir) {
    exeargs.push(`--user-data-dir=${options.userDataDir}`);
  }
  if (options.profileDirectory) {
    exeargs.push(`--profile-directory=${options.profileDirectory}`);
  }
  if (options.anotherArgs) {
    if (typeof options.anotherArgs === "string") {
      const argsArr = options.anotherArgs.trim().split(/\s+/).filter(Boolean);
      exeargs.push(...argsArr);
    } else if (Array.isArray(options.anotherArgs)) {
      exeargs.push(...options.anotherArgs);
    }
  }
  console.log(`Starting Chrome with path: ${chrome}`);
  console.log(`Chrome launch arguments:`, exeargs);
  const chromeProcess = spawn(chrome, exeargs, { stdio: 'ignore' });

  return new Promise(async (resolve, reject) => {
    chromeProcess.once('error', (err) => {
      reject({
        error: "Failed to start Chrome",
        details: err instanceof Error ? err.message : String(err),
        chromePath: chrome,
        args: exeargs
      });
    });

    setTimeout(async () => {
      if (!chromeProcess.killed && chromeProcess.pid) {
        try {
          await connectBrowser(options.debuggingPort ?? '9222');
          resolve({
            success: true,
            message: "Chrome started and connected",
            pid: chromeProcess.pid,
            chromePath: chrome,
            args: exeargs
          });
        } catch (err) {
          reject({
            error: "Failed to connect to Chrome",
            details: err instanceof Error ? err.message : String(err),
            chromePath: chrome,
            args: exeargs
          });
        }
      }
    }, 500);
  });
}

export async function connectBrowser(debuggingPort: string): Promise<Boolean> {
  const maxAttempts = 30;
  let attempt = 0;
  let webSocketDebuggerUrl: string | null = null;

  // Try to get webSocketDebuggerUrl
  while (attempt < maxAttempts) {
    try {
      const res = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
      if (res.ok) {
        const data = await res.json();
        webSocketDebuggerUrl = data.webSocketDebuggerUrl;
        if (webSocketDebuggerUrl) break;
      }
    } catch (err) {
      // Ignore error, will retry
    }
    attempt++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!webSocketDebuggerUrl) {
    throw new Error("Could not retrieve webSocketDebuggerUrl after 30 seconds.");
  }

  // Try to connect with puppeteer.connect
  attempt = 0;
  while (attempt < maxAttempts) {
    try {
      browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
      console.log("Browser connected");
      break;
    } catch (err) {
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!browser) {
    throw new Error("Could not connect to browser after 30 seconds.");
  }

  return true;
}

export async function newTab(): Promise<string | null> {
  if (!browser) {
    console.error("Browser is not started or connected.");
    return null;
  }
  const tabID = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  console.log("Creating new page");
  const page = await browser.newPage();
  await page.setViewport(null);
  pagesMap.set(tabID, page);

  // Return the ID of the new tab
  return tabID;
}

export async function goTo(tabID: string, url: string, userAgent?: string, options?: {
  timeout?: number,
  waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[]
}): Promise<boolean> {
  let page: Page | undefined;
  if (tabID === "0") {
    const pages = await browser?.pages();
    page = pages && pages.length > 0 ? pages[0] : undefined;
  } else {
    page = pagesMap.get(tabID);
  }
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }

  try {
    if (userAgent) {
      let options = buildUserAgentMetadata(userAgent);
      await page.setUserAgent(options);
    }
    await page.goto(url, {
      timeout: options?.timeout ?? 30000,
      waitUntil: options?.waitUntil ?? 'load',
    });

    console.log(`Navigated to ${url} on tab ${tabID}`);
    return true;
  } catch (err) {
    console.error(`Failed to navigate to ${url} on tab ${tabID}:`, err);
    return false;
  }
}
export async function click(tabID: string, selector: string, options?: {
  delay?: number,
  button?: "left" | "right" | "middle",
  clickCount?: number,
  timeout?: number
}): Promise<boolean> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }
  try {
    await page.waitForSelector(selector, { timeout: options?.timeout ?? 30000 });
    await page.click(selector, {
      delay: options?.delay ?? 0,
      button: options?.button ?? 'left',
      clickCount: options?.clickCount ?? 1
    });
    console.log(`Clicked selector "${selector}" on tab ${tabID}`);
    return true;
  } catch (err) {
    console.error(`Failed to click selector "${selector}" on tab ${tabID}:`, err);
    return false;
  }
}
export async function type(tabID: string, selector: string, text: string, options?: {
  delay?: number,
  timeout?: number,
  clear?: boolean
}): Promise<boolean> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }
  try {
    await page.waitForSelector(selector, { timeout: options?.timeout ?? 30000 });
    if (options?.clear) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) el.value = '';
      }, selector);
    }
    await page.type(selector, text, { delay: options?.delay ?? 0 });
    console.log(`Typed into selector "${selector}" on tab ${tabID} with text:\n\t${text.substring(0, 60)}...`);
    return true;
  } catch (err) {
    console.error(`Failed to type into selector "${selector}" on tab ${tabID}:`, err);
    return false;
  }
}
export async function waitForSelector(tabID: string, selector: string, options?: {
  timeout?: number,
  visible?: boolean,
  hidden?: boolean
}): Promise<boolean> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }
  try {
    await page.waitForSelector(selector, {
      timeout: options?.timeout ?? 30000,
      visible: options?.visible ?? false,
      hidden: options?.hidden ?? false
    });
    console.log(`Selector "${selector}" appeared on tab ${tabID}`);
    return true;
  } catch (err) {
    console.error(`Failed to find selector "${selector}" on tab ${tabID}:`, err);
    return false;
  }
}
export async function waitForFunction(tabID: string, fn: string | EvaluateFunc<[]>, options?: {
  timeout?: number,
  polling?: number | 'raf' | 'mutation'
}): Promise<boolean> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }
  try {
    await page.waitForFunction(fn, {
      timeout: options?.timeout ?? 30000,
      polling: options?.polling ?? 'raf'
    });
    console.log(`Function condition met on tab ${tabID}`);
    return true;
  } catch (err) {
    console.error(`Failed to wait for function on tab ${tabID}:`, err);
    return false;
  }
}
export async function evaluate(
  tabID: string,
  fn: string
): Promise<{ success: boolean, result?: any, error?: string }> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return { success: false, error: `Tab with ID ${tabID} does not exist.` };
  }
  try {
    let result: any;
    result = await page.evaluate(`(${fn})()`);
    console.log(`Evaluated function on tab ${tabID}`);
    return { success: true, result };
  } catch (err) {
    console.error(`Failed to evaluate function on tab ${tabID}:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
export async function closeTab(tabID: string): Promise<boolean> {
  const page = pagesMap.get(tabID);
  if (!page) {
    console.error(`Tab with ID ${tabID} does not exist.`);
    return false;
  }
  try {
    await page.close();
    pagesMap.delete(tabID);
    console.log(`Closed tab with ID ${tabID}`);
    return true;
  } catch (err) {
    console.error(`Failed to close tab with ID ${tabID}:`, err);
    return false;
  }
}