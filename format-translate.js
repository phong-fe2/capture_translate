const fs = require("fs");
const cheerio = require("cheerio");
const he = require("he");

function stripChromeTranslateTags(input) {
  if (typeof input !== "string") return input;

  // Bọc vào root để parse như HTML fragment
  const $ = cheerio.load(`<root>${input}</root>`, {
    decodeEntities: true,
    xmlMode: false,
  });

  const text = $("root")
    .contents()
    .map((_, node) => {
      if (node.type === "text") {
        return node.data;
      }

      if (node.type === "tag") {
        return $(node).text();
      }

      return "";
    })
    .get()
    .join(" ");

  return he
    .decode(text)
    .replace(/\s+/g, " ")
    .trim();
}

function formatTranslateRecord(raw) {
  const requestPayload =
    typeof raw.requestPostData === "string"
      ? JSON.parse(raw.requestPostData)
      : raw.requestPostData;

  const sourceTexts = requestPayload?.[0]?.[0] || [];
  const sourceLang = requestPayload?.[0]?.[1] || null;
  const targetLang = requestPayload?.[0]?.[2] || null;
  const engine = requestPayload?.[1] || null;

  const responsePayload =
    raw.responseJson ||
    (raw.responseBody ? JSON.parse(raw.responseBody) : []);

  const translatedTexts = responsePayload?.[0] || [];

  return {
    requestId: raw.requestId,
    url: raw.url,
    method: raw.method,
    timestamp: raw.timestamp,
    sourceLang,
    targetLang,
    engine,
    status: raw.status,

    translations: sourceTexts.map((source, index) => {
      const translated = translatedTexts[index] || null;

      return {
        index,

        sourceRaw: source,
        translatedRaw: translated,

        sourceText: stripChromeTranslateTags(source),
        translatedText: stripChromeTranslateTags(translated),

        hasHtmlTag:
          /<\/?[a-z][\s\S]*>/i.test(source) ||
          /<\/?[a-z][\s\S]*>/i.test(translated || ""),
      };
    }),
  };
}

const input = fs.readFileSync("translate-captures.jsonl", "utf8");

const records = input
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .map(formatTranslateRecord);

fs.writeFileSync(
  "translate-formatted.json",
  JSON.stringify(records, null, 2),
  "utf8"
);

console.log(`Formatted ${records.length} records.`);