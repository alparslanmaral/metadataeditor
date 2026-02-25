const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const previewWrap = document.getElementById("previewWrap");
const videoPreview = document.getElementById("videoPreview");

const metaForm = document.getElementById("metaForm");
const writeBtn = document.getElementById("writeBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

let selectedFile = null;
let objectUrl = null;

let worker = null;
let ffmpegReady = false;
let busy = false;

function setStatus(msg) { statusEl.textContent = msg || ""; }
function setProgress(p01) {
  const pct = Math.round((p01 || 0) * 100);
  progressText.textContent = `${pct}%`;
  progressBar.style.width = `${pct}%`;
}

function humanBytes(bytes) {
  const units = ["B","KB","MB","GB","TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ensureWorker() {
  if (worker) return;

  worker = new Worker(new URL("./ffmpeg-worker.js", window.location.href));
  worker.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "READY") {
      ffmpegReady = true;
      setStatus("FFmpeg hazır. Metadata yazabilirsiniz.");
      return;
    }

    if (msg.type === "PROGRESS") {
      progressWrap.classList.remove("hidden");
      setProgress(msg.progress);
      return;
    }

    if (msg.type === "DONE") {
      busy = false;
      writeBtn.disabled = false;
      resetBtn.disabled = false;

      progressWrap.classList.add("hidden");
      setProgress(0);

      const bytes = new Uint8Array(msg.outData);
      const outBlob = new Blob([bytes], { type: selectedFile?.type || "application/octet-stream" });

      downloadBlob(outBlob, msg.outName);
      setStatus("Bitti. Dosya indirildi.");
      return;
    }

    if (msg.type === "ERROR") {
      busy = false;
      writeBtn.disabled = false;
      resetBtn.disabled = false;

      progressWrap.classList.add("hidden");
      setProgress(0);

      setStatus(`Hata: ${msg.message}`);
      return;
    }
  };

  setStatus("FFmpeg yükleniyor (ilk sefer biraz sürebilir)...");
  worker.postMessage({ type: "INIT" });
}

function showFile(file) {
  selectedFile = file;

  fileInfo.classList.remove("hidden");
  fileInfo.textContent = `Seçilen dosya: ${file.name} • ${file.type || "type bilinmiyor"} • ${humanBytes(file.size)}`;

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  videoPreview.src = objectUrl;
  previewWrap.classList.remove("hidden");

  writeBtn.disabled = false;
  resetBtn.disabled = false;

  ensureWorker();
}

function handleFiles(files) {
  if (!files || !files.length) return;
  showFile(files[0]);
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

resetBtn.addEventListener("click", () => {
  if (busy) return;

  selectedFile = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;

  metaForm.reset();
  fileInfo.classList.add("hidden");
  previewWrap.classList.add("hidden");
  videoPreview.removeAttribute("src");

  writeBtn.disabled = true;
  resetBtn.disabled = true;
  progressWrap.classList.add("hidden");
  setProgress(0);
  setStatus("");
});

metaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedFile) return;

  ensureWorker();

  if (!ffmpegReady) {
    setStatus("FFmpeg henüz hazır değil, lütfen bekleyin...");
    return;
  }

  if (busy) return;
  busy = true;

  writeBtn.disabled = true;
  resetBtn.disabled = true;

  setStatus("İşleniyor... (metadata yazılıyor)");
  progressWrap.classList.remove("hidden");
  setProgress(0);

  const meta = Object.fromEntries(new FormData(metaForm).entries());

  // Worker'a File nesnesini gönderebiliriz (structured clone destekler)
  worker.postMessage({ type: "PROCESS", file: selectedFile, meta });
});