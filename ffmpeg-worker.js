// ffmpeg-worker.js
// CDN UMD build: @ffmpeg/ffmpeg + @ffmpeg/util
importScripts("https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js");
importScripts("https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js");

const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

let ffmpeg;
let loaded = false;

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
      if (!ffmpeg) ffmpeg = new FFmpeg();

      if (!loaded) {
        ffmpeg.on("progress", ({ progress }) => {
          // progress 0..1
          self.postMessage({ type: "PROGRESS", progress: Math.max(0, Math.min(1, progress || 0)) });
        });

        ffmpeg.on("log", ({ message }) => {
          // İsterseniz UI'da log gösterebilirsiniz
          // self.postMessage({ type: "LOG", message });
        });

        await ffmpeg.load();
        loaded = true;
      }

      self.postMessage({ type: "READY" });
      return;
    }

    if (msg.type === "PROCESS") {
      if (!loaded) throw new Error("FFmpeg henüz yüklenmedi.");

      const { file, meta } = msg;
      const inName = file.name || "input.bin";

      // Çıkış: aynı uzantıyı korumaya çalışalım
      const dot = inName.lastIndexOf(".");
      const ext = dot >= 0 ? inName.slice(dot) : ".mp4";
      const base = dot >= 0 ? inName.slice(0, dot) : "output";
      const outName = `${base}.metadata${ext}`;

      // Yaz
      await ffmpeg.writeFile(inName, await fetchFile(file));

      // Remux + metadata (yeniden kodlama yok)
      // -map 0: tüm streamleri al
      // -c copy: kopyala
      // Bazı konteynerlerde metadata yazımı sınırlı olabilir.
      const args = [
        "-i", inName,
        ...metaArgs(meta),
        "-map", "0",
        "-c", "copy",
        // Bazı MP4 türevlerinde moov atomu için faydalı olabilir (özellikle web için)
        "-movflags", "+faststart",
        outName,
      ];

      await ffmpeg.exec(args);

      const outData = await ffmpeg.readFile(outName);

      // Temizlik
      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});

      self.postMessage(
        { type: "DONE", outName, outData },
        // Transferable
        [outData.buffer]
      );
      return;
    }
  } catch (err) {
    self.postMessage({ type: "ERROR", message: err?.message || String(err) });
  }
};