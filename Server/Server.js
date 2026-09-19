const express = require("express");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 8080;
const MAX_UPLOAD = 50 * 1024 * 1024;

app.disable("x-powered-by");

app.get("/api/ping", (_req, res) => {
  res.set({
    "Cache-Control":"no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma":"no-cache",
    "Expires":"0",
    "Content-Type":"text/plain; charset=utf-8"
  });
  res.send("pong");
});

app.get("/api/download", (req, res) => {
  let bytes = Number(req.query.bytes || 5 * 1024 * 1024);
  if (!Number.isFinite(bytes)) bytes = 5 * 1024 * 1024;
  bytes = Math.max(256 * 1024, Math.min(bytes, 50 * 1024 * 1024));

  res.set({
    "Content-Type":"application/octet-stream",
    "Content-Length":String(bytes),
    "Cache-Control":"no-store, no-cache, must-revalidate, proxy-revalidate",
    "Content-Encoding":"identity",
    "X-Content-Type-Options":"nosniff"
  });

  const chunk = Buffer.allocUnsafe(64 * 1024);
  let sent = 0;
  const write = () => {
    while (sent < bytes) {
      const n = Math.min(chunk.length, bytes - sent);
      if (!res.write(chunk.subarray(0, n))) {
        res.once("drain", write);
        return;
      }
      sent += n;
    }
    res.end();
  };
  write();
});

app.post("/api/upload", (req, res) => {
  let bytes = 0;
  let rejected = false;
  req.on("data", chunk => {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD && !rejected) {
      rejected = true;
      res.status(413).json({error:"Upload trop volumineux"});
      req.destroy();
    }
  });
  req.on("end", () => {
    if (!rejected) res.json({ok:true, bytes});
  });
});

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.listen(PORT, () => console.log(`BeninSpeed listening on :${PORT}`));
        
