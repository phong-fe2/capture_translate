const fs = require("fs");

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
    translations: sourceTexts.map((source, index) => ({
      index,
      source,
      translated: translatedTexts[index] || null,
    })),
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