const puppeteer = require("puppeteer-core");
const fs = require("fs");

const TARGET_URL_PART = "translate-pa.googleapis.com/v1/translateHtml";
const OUT_FILE = "translate-captures.jsonl";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null,
  });

  const pages = await browser.pages();

  // Lấy tab đầu tiên đang mở github, nếu không có thì lấy tab đầu tiên.
  const page =
    pages.find((p) => p.url().includes("github.com")) ||
    pages[0];

  const client = await page.target().createCDPSession();

  await client.send("Network.enable", {
    maxTotalBufferSize: 100 * 1024 * 1024,
    maxResourceBufferSize: 20 * 1024 * 1024,
    maxPostDataSize: 20 * 1024 * 1024,
  });

  await client.send("Network.setCacheDisabled", {
    cacheDisabled: true,
  });

  const requests = new Map();

  client.on("Network.requestWillBeSent", async (event) => {
    const url = event.request?.url || "";

    if (!url.includes(TARGET_URL_PART)) return;

    const record = {
      requestId: event.requestId,
      url,
      method: event.request.method,
      requestHeaders: event.request.headers,
      requestPostData: event.request.postData || null,
      timestamp: new Date().toISOString(),
    };

    // Nếu postData quá lớn, event.request.postData có thể null.
    // Khi đó gọi CDP lấy body request.
    if (!record.requestPostData) {
      try {
        const post = await client.send("Network.getRequestPostData", {
          requestId: event.requestId,
        });
        record.requestPostData = post.postData;
      } catch {}
    }

    requests.set(event.requestId, record);

    console.log("\n=== Translate request detected ===");
    console.log(record.method, record.url);
  });

  client.on("Network.responseReceived", (event) => {
    const record = requests.get(event.requestId);
    if (!record) return;

    record.status = event.response.status;
    record.statusText = event.response.statusText;
    record.responseHeaders = event.response.headers;
    record.mimeType = event.response.mimeType;
  });

  client.on("Network.loadingFinished", async (event) => {
    const record = requests.get(event.requestId);
    if (!record) return;

    try {
      const bodyResult = await client.send("Network.getResponseBody", {
        requestId: event.requestId,
      });

      record.responseBody = bodyResult.base64Encoded
        ? Buffer.from(bodyResult.body, "base64").toString("utf8")
        : bodyResult.body;

      record.responseJson = safeJsonParse(record.responseBody);

      fs.appendFileSync(
        OUT_FILE,
        JSON.stringify(record, null, 0) + "\n",
        "utf8"
      );

      console.log("Saved response:", OUT_FILE);
      console.log("Status:", record.status);
      console.log("Response preview:");
      console.log(record.responseBody.slice(0, 500));
    } catch (err) {
      console.error("Cannot get response body:", err.message);
    } finally {
      requests.delete(event.requestId);
    }
  });

  console.log("Listening for Chrome Translate API...");
  console.log("Now trigger Translate in Chrome.");
}

main().catch(console.error);