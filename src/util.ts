/**
 * Trì hoãn thực thi trong một khoảng thời gian tính bằng mili giây.
 * @param miliseconds Số mili giây cần trì hoãn.
 * @returns Một promise được resolve sau khi hết thời gian trì hoãn.
 */
export function delay(miliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}

import { UAParser } from "ua-parser-js";
// Lấy chuỗi UA và trả về userAgentMetadata "best-effort"
export function buildUserAgentMetadata(ua: string) {
  const parser = new UAParser(ua);
  const browser = parser.getBrowser(); // { name, version }
  const os = parser.getOS(); // { name, version }
  const device = parser.getDevice(); // { vendor, model, type }

  // chuẩn hóa platform name cho userAgentMetadata
  const osName = (os.name || "").toLowerCase();
  let platform = "Unknown";
  if (osName.includes("android")) platform = "Android";
  else if (osName.includes("ios") || osName.includes("iphone") || osName.includes("ipad")) platform = "iOS";
  else if (osName.includes("windows")) platform = "Windows";
  else if (osName.includes("mac")) platform = "macOS";
  else if (osName.includes("linux")) platform = "Linux";
  else if (osName.includes("cros") || osName.includes("chrome os")) platform = "Chrome OS";

  // lấy platformVersion (nếu có) — lấy segment đầu (major.minor)
  const platformVersion = os.version || "";

  // model nếu detect được từ device, else lấy từ UA heuristics
  const model = device.model || (() => {
    // một số UA chứa model trong dấu ;
    const match = ua.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      const parts = match[1].split(";");
      // tìm token có dạng SM-xxxx hoặc model thường thấy
      for (const p of parts.reverse()) {
        const t = p.trim();
        if (/SM-|GT-|Pixel|iPhone|iPad|HUAWEI|HONOR|MI[-\s]/i.test(t)) return t;
      }
    }
    return "";
  })();

  // xác định mobile boolean
  const mobile = !!(device.type === "mobile" || /mobile/i.test(ua));

  // brands: cố gắng đưa browser và Chromium/Google Chrome cặp (Client Hints giống Chrome)
  const browserName = browser.name || "";
  const browserVersion = browser.version || "";
  const majorVer = browserVersion.split(".")[0] || "";

  const brands: Array<{ brand: string; version: string }> = [];
  if (/Chrome|Chromium|CriOS/i.test(browserName)) {
    // Chrome-like: include Chromium và Google Chrome (order can be either)
    brands.push({ brand: "Chromium", version: majorVer });
    brands.push({ brand: "Google Chrome", version: majorVer });
  } else if (browserName) {
    brands.push({ brand: browserName, version: majorVer });
  } else {
    // fallback
    brands.push({ brand: "Chromium", version: majorVer || "0" });
  }

  // fullVersion: dùng browser.version nếu có
  const fullVersion = browser.version || "";

  // architecture left blank if unknown
  const architecture = "";

  return {
    userAgent: ua,
    platform,
    userAgentMetadata: {
      platform,
      platformVersion,
      architecture,
      model,
      mobile,
      brands,
      fullVersion
    }
  };
}
export function parseArgs() {
  const raw = process.argv.slice(2); // => ["--apiKey=abc", "positional1"]
  const result: { apiKey?: string; _: string[] } = { _: [] };

  for (const item of raw) {
    if (item.startsWith('--')) {
      // --key=value hoặc --key value
      const idx = item.indexOf('=');
      if (idx !== -1) {
        const key = item.slice(2, idx);
        const val = item.slice(idx + 1);
        (result as any)[key] = val;
      } else {
        const key = item.slice(2);
        (result as any)[key] = true; // boolean flag
      }
    } else if (item.startsWith('-') && item.length > 1) {
      // -k value (ngắn) -> tạm gán như key true
      const key = item.slice(1);
      (result as any)[key] = true;
    } else {
      // positional
      result._.push(item);
    }
  }
  return result;
}

// Hàm hỗ trợ đọc dòng từ stdin
import readline from 'node:readline';
export function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
export type BrowserResult = { success: boolean; [key: string]: any };