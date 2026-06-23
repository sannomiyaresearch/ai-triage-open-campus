import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = join(process.cwd(), "public");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req, maxBytes = 30 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("音声データが大きすぎます。30MB以内で試してください。");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requireApiKey(res) {
  if (OPENAI_API_KEY) return true;
  sendJson(res, 500, {
    error: "OPENAI_API_KEY が設定されていません。サーバを起動する前に環境変数へ設定してください。"
  });
  return false;
}

async function transcribeAudio(req, res) {
  if (!requireApiKey(res)) return;

  try {
    const audioBuffer = await readBody(req);
    if (!audioBuffer.length) {
      sendJson(res, 400, { error: "音声データが空です。" });
      return;
    }

    const contentType = req.headers["content-type"] || "audio/webm";
    const extension = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "webm";
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: contentType }), `phone-call.${extension}`);
    form.append("model", TRANSCRIBE_MODEL);
    form.append("language", "ja");
    form.append(
      "prompt",
      "来院前相談の電話音声です。患者様・ご家族・受付担当者の発話を、医療用語を保って日本語で正確に文字起こししてください。"
    );

    const apiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      sendJson(res, apiRes.status, { error: data.error?.message || "文字起こしに失敗しました。" });
      return;
    }

    sendJson(res, 200, { text: data.text || "" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "文字起こし中にエラーが発生しました。" });
  }
}

async function summarizeTranscript(req, res) {
  if (!requireApiKey(res)) return;

  try {
    const body = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
    const transcript = String(body.transcript || "").trim();
    if (!transcript) {
      sendJson(res, 400, { error: "要約する文字起こしがありません。" });
      return;
    }

    const apiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        input: [
          {
            role: "system",
            content:
              "あなたは来院前の電話内容を、医師や管理者に渡すためのメモへ整理する補助者です。不確かな情報は不明と書き、会話にない内容を補わないでください。"
          },
          {
            role: "user",
            content: `次の来院前電話の文字起こしから、医師・管理者に渡すメモを日本語で作成してください。

必ずこの形式にしてください。

# 医師向けメモ

## 主観的情報（S）
- 相談者・患者様の訴え:
- 症状の経過:
- 生活状況・困りごと:
- 本人/家族の希望:
- その他:

## 客観的情報（O）
- 電話内で確認できた事実:
- バイタル・測定値:
- 既往・服薬・処置:
- 来院方法の検討に関係する情報:
- 不足している確認事項:

## 管理者確認欄
- 来院方法:
- 追加確認:

文字起こし:
${transcript}`
          }
        ],
        temperature: 0.2
      })
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      sendJson(res, apiRes.status, { error: data.error?.message || "要約に失敗しました。" });
      return;
    }

    const summary =
      data.output_text ||
      data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n").trim() ||
      "";

    sendJson(res, 200, { summary });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "要約中にエラーが発生しました。" });
  }
}

async function serveStatic(req, res) {
  const requestedPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const filePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const safePath = normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(PUBLIC_DIR, safePath);

  try {
    const file = await readFile(absolutePath);
    res.writeHead(200, { "content-type": MIME_TYPES[extname(absolutePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/transcribe") {
    await transcribeAudio(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/summarize") {
    await summarizeTranscript(req, res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, HOST, () => {
  console.log(`AIトリアージ【オープンキャンパス用】 is running at http://${HOST}:${PORT}`);
});
