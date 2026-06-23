const recordButton = document.querySelector("#recordButton");
const stopButton = document.querySelector("#stopButton");
const clearButton = document.querySelector("#clearButton");
const printButton = document.querySelector("#printButton");
const transcriptBox = document.querySelector("#transcript");
const summaryBox = document.querySelector("#summary");
const statusPill = document.querySelector("#statusPill");
const timer = document.querySelector("#timer");
const meter = document.querySelector(".meter");
const printContent = document.querySelector("#printContent");

let mediaRecorder;
let audioChunks = [];
let timerId;
let startedAt = 0;

function setStatus(text, mode = "") {
  statusPill.textContent = text;
  statusPill.className = `status-pill ${mode}`.trim();
}

function setBusy(isBusy) {
  recordButton.disabled = isBusy;
  clearButton.disabled = isBusy;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer() {
  startedAt = Date.now();
  timer.textContent = "00:00";
  timerId = window.setInterval(() => {
    timer.textContent = formatDuration(Date.now() - startedAt);
  }, 250);
}

function stopTimer() {
  window.clearInterval(timerId);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      await handleAudioBlob(new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" }));
    });

    mediaRecorder.start();
    recordButton.disabled = true;
    stopButton.disabled = false;
    clearButton.disabled = true;
    printButton.disabled = true;
    transcriptBox.value = "";
    summaryBox.value = "";
    meter.classList.add("active");
    setStatus("録音中", "recording");
    startTimer();
  } catch (error) {
    setStatus("録音できません");
    alert(error.message || "マイクの利用を許可してください。");
  }
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    stopButton.disabled = true;
    stopTimer();
    meter.classList.remove("active");
    setStatus("処理中");
    mediaRecorder.stop();
  }
}

async function handleAudioBlob(blob) {
  setBusy(true);
  try {
    transcriptBox.value = "文字起こし中...";
    const transcript = await transcribe(blob);
    transcriptBox.value = transcript;

    setStatus("要約中");
    summaryBox.value = "医師向けメモを作成中...";
    summaryBox.value = await summarize(transcript);
    printButton.disabled = false;
    setStatus("完了");
  } catch (error) {
    transcriptBox.value = transcriptBox.value === "文字起こし中..." ? "" : transcriptBox.value;
    summaryBox.value = "";
    setStatus("エラー");
    alert(error.message || "処理に失敗しました。");
  } finally {
    setBusy(false);
    recordButton.disabled = false;
    clearButton.disabled = false;
  }
}

async function transcribe(blob) {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "content-type": blob.type || "audio/webm" },
    body: blob
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "文字起こしに失敗しました。");
  return data.text || "";
}

async function summarize(transcript) {
  const response = await fetch("/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "要約に失敗しました。");
  return data.summary || "";
}

function clearAll() {
  transcriptBox.value = "";
  summaryBox.value = "";
  printButton.disabled = true;
  timer.textContent = "00:00";
  setStatus("待機中");
}

recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);
clearButton.addEventListener("click", clearAll);

printButton.addEventListener("click", () => {
  printContent.textContent = summaryBox.value;
  window.print();
});

window.addEventListener("beforeprint", () => {
  printContent.textContent = summaryBox.value;
});
