// ffmpeg-worker.js

// jsDelivr (daha stabil olabiliyor)
importScripts("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js");
importScripts("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js");

const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

let ffmpeg;
let loaded = false;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function metaArgs(meta) {
  const args = [];
  const map = {
    title: "title",
    artist: "artist",
    album: "album",
    genre: "genre",
    date: "date",
    language: "language",
    publisher: "publisher",
    copyright: "copyright",
    encoded_by: "encoded_by",
    comment: "comment",
  };
  for (const [k, ffk] of Object.entries(map)) {
    const v = (meta?.[k] ?? "").toString().trim();
    if (v) args.push("-metadata", `${ffk}=${v}`);
  }
  return args;
}

self.onmessage = async (e) => {
  const msg = e.data;

  try {
    if (msg.type === "INIT") {
      post("LOG", { message: "Worker: INIT" });

      if (!ffmpeg) ffmpeg = new FFmpeg();

      if (!loaded) {
        ffmpeg.on("progress", ({ progress }) => {
          post("PROGRESS", { progress: Math.max(0, Math.min(1, progress || 0)) });
        });
        ffmpeg.on("log", ({ message }) => post("LOG", { message }));

        post("LOG", { message: "Worker: ffmpeg.load() başlıyor..." });
        await ffmpeg.load();
        loaded = true;
        post("LOG", { message: "Worker: ffmpeg.load() tamam" });
      }

      post("READY");
      return;
    }

    if (msg.type === "PROCESS") {
      if (!loaded) throw new Error("FFmpeg henüz yüklenmedi.");

      const { file, meta } = msg;
      const inName = file.name || "input.bin";

      const dot = inName.lastIndexOf(".");
      const ext = dot >= 0 ? inName.slice(dot) : ".mp4";
      const base = dot >= 0 ? inName.slice(0, dot) : "output";
      const outName = `${base}.metadata${ext}`;

      await ffmpeg.writeFile(inName, await fetchFile(file));

      const args = [
        "-i", inName,
        ...metaArgs(meta),
        "-map", "0",
        "-c", "copy",
        "-movflags", "+faststart",
        outName,
      ];

      await ffmpeg.exec(args);

      const outData = await ffmpeg.readFile(outName);

      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});

      post("DONE", { outName, outData });
      return;
    }
  } catch (err) {
    post("ERROR", { message: err?.message || String(err) });
  }
};