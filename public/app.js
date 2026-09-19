(() => {
  "use strict";

  const CONFIG = {
    pingSamples: 7,
    serverBase: "",
    downloadSizes: [1, 5, 10, 20],
    uploadSizes: [1, 5, 10],
    minTransferSeconds: 0.9,
    maxTransferSeconds: 6,
    historyMax: 12,
  };

  // Liste de serveurs (prête pour multi-serveurs plus tard)
  // Pour l'instant un seul : le serveur local / déployé
  const SERVERS = [
    { id: "local", name: "Cotonou • Principal", location: "Bénin", base: "" },
    // Exemples futurs :
    // { id: "abj", name: "Abidjan", location: "Côte d'Ivoire", base: "https://speed-abj.example.com" },
    // { id: "lome", name: "Lomé", location: "Togo", base: "https://speed-lome.example.com" },
  ];

  let currentServer = SERVERS[0];
  let lastResult = null;
  let running = false;

  const $ = (id) => document.getElementById(id);
  const el = {
    button: $("testButton"), buttonText: $("buttonText"),
    status: $("statusLine"), statusDot: $("statusDot"),
    gaugeProgress: $("gaugeProgress"), gaugeValue: $("gaugeValue"),
    gaugeUnit: $("gaugeUnit"), gaugePhase: $("gaugePhase"),
    ping: $("pingValue"), download: $("downloadValue"),
    upload: $("uploadValue"), jitter: $("jitterValue"),
    connection: $("connectionType"),
    serverBadge: $("serverBadge"),
    serverName: $("serverName"),
    serverLatency: $("serverLatency"),
    serverSelector: $("serverSelector"),
    serverModal: $("serverModal"),
    serverList: $("serverList"),
    closeModal: $("closeModal"),
    resultsPanel: $("resultsPanel"),
    resDownload: $("resDownload"), resUpload: $("resUpload"),
    resPing: $("resPing"), resJitter: $("resJitter"),
    resultsMeta: $("resultsMeta"),
    shareBtn: $("shareBtn"), copyBtn: $("copyBtn"),
    ispName: $("ispName"),
    historyList: $("historyList"),
    clearHistory: $("clearHistory"),
    metrics: {
      ping: $("metric-ping"), download: $("metric-download"),
      upload: $("metric-upload"), jitter: $("metric-jitter")
    }
  };

  const C = 2 * Math.PI * 88;

  // ─── Helpers UI ───────────────────────────────────────────────
  function setProgress(f) {
    const x = Math.max(0, Math.min(1, f));
    el.gaugeProgress.style.strokeDashoffset = String(C * (1 - x));
  }

  function setGauge(value, unit, phase) {
    el.gaugeValue.textContent = value;
    el.gaugeUnit.textContent = unit;
    el.gaugePhase.textContent = phase;
  }

  function status(text, active = false, error = false) {
    el.status.textContent = text;
    el.statusDot.classList.toggle("active", active);
    el.statusDot.classList.toggle("error", error);
  }

  function metric(name, state) {
    const node = el.metrics[name];
    node.classList.remove("pending", "active", "done", "unavailable");
    node.classList.add(state);
  }

  function connectionType() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return "Non détectable sur ce navigateur";
    if (c.type === "wifi") return "Wi‑Fi";
    if (c.type === "cellular") return c.effectiveType ? `Réseau mobile • ${c.effectiveType.toUpperCase()}` : "Réseau mobile";
    return c.effectiveType ? `Réseau estimé • ${c.effectiveType.toUpperCase()}` : "Connexion détectée";
  }

  // ─── Serveur ──────────────────────────────────────────────────
  function updateServerUI() {
    el.serverName.textContent = currentServer.name;
    el.serverBadge.textContent = currentServer.location.toUpperCase();
    CONFIG.serverBase = currentServer.base;
  }

  function openServerModal() {
    el.serverList.innerHTML = "";
    SERVERS.forEach(s => {
      const div = document.createElement("div");
      div.className = "modal-server" + (s.id === currentServer.id ? " selected" : "");
      div.innerHTML = `
        <div>
          <div class="ms-name">${s.name}</div>
          <div class="ms-loc">${s.location}</div>
        </div>
        <div class="ms-ping">${s.id === currentServer.id ? "Actuel" : ""}</div>
      `;
      div.addEventListener("click", () => {
        currentServer = s;
        updateServerUI();
        el.serverModal.classList.remove("open");
        // Petit ping pour afficher la latence
        quickPing();
      });
      el.serverList.appendChild(div);
    });
    el.serverModal.classList.add("open");
  }

  async function quickPing() {
    try {
      const t = performance.now();
      await fetch(`${CONFIG.serverBase}/api/ping?x=${Date.now()}`, { cache: "no-store" });
      const ms = Math.round(performance.now() - t);
      el.serverLatency.textContent = ms + " ms";
    } catch {
      el.serverLatency.textContent = "— ms";
    }
  }

  // ─── ISP Detection ────────────────────────────────────────────
  async function detectISP() {
    try {
      // ipapi.co gratuit (sans clé) – limite raisonnable
      const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const isp = d.org || d.asn || "Inconnu";
      const city = d.city ? ` • ${d.city}` : "";
      el.ispName.textContent = isp + city;
    } catch {
      // Fallback très simple
      try {
        const r2 = await fetch("https://api.ipify.org?format=json");
        const d2 = await r2.json();
        el.ispName.textContent = "IP : " + (d2.ip || "Non détecté");
      } catch {
        el.ispName.textContent = "Non détectable";
      }
    }
  }

  // ─── Historique (localStorage) ────────────────────────────────
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem("beninspeed_history") || "[]");
    } catch { return []; }
  }

  function saveHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    if (list.length > CONFIG.historyMax) list.length = CONFIG.historyMax;
    localStorage.setItem("beninspeed_history", JSON.stringify(list));
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    if (!list.length) {
      el.historyList.innerHTML = `<div class="history-empty">Aucun test enregistré pour le moment</div>`;
      return;
    }
    el.historyList.innerHTML = list.map(h => `
      <div class="history-item">
        <div class="hi-date">${h.date}</div>
        <div class="hi-speeds">
          <span>↓ ${h.download}</span>
          <span>↑ ${h.upload}</span>
        </div>
        <div class="hi-ping">${h.ping} ms</div>
      </div>
    `).join("");
  }

  function clearHistory() {
    localStorage.removeItem("beninspeed_history");
    renderHistory();
  }

  // ─── Résultats & Partage ──────────────────────────────────────
  function showResults(data) {
    lastResult = data;
    el.resDownload.textContent = data.download;
    el.resUpload.textContent = data.upload;
    el.resPing.textContent = data.ping;
    el.resJitter.textContent = data.jitter;
    el.resultsMeta.textContent = `${data.connection} • ${data.isp} • ${data.server} • ${data.date}`;
    el.resultsPanel.classList.add("visible");
  }

  function buildShareText() {
    if (!lastResult) return "";
    const r = lastResult;
    return `🚀 BeninSpeed – Résultat de mon test\n\n↓ Download : ${r.download} Mbps\n↑ Upload : ${r.upload} Mbps\n⌁ Ping : ${r.ping} ms\n≈ Jitter : ${r.jitter} ms\n\n📡 ${r.connection}\n🏢 ${r.isp}\n🖥️ ${r.server}\n📅 ${r.date}\n\nTestez aussi sur BeninSpeed !`;
  }

  async function shareResult() {
    const text = buildShareText();
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mon résultat BeninSpeed", text });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    // Fallback : copier
    await copyResult();
  }

  async function copyResult() {
    const text = buildShareText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      el.copyBtn.textContent = "✅ Copié !";
      setTimeout(() => el.copyBtn.textContent = "📋 Copier", 1800);
    } catch {
      // Ancien fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      el.copyBtn.textContent = "✅ Copié !";
      setTimeout(() => el.copyBtn.textContent = "📋 Copier", 1800);
    }
  }

  // ─── Mesures ──────────────────────────────────────────────────
  function reset() {
    for (const k of ["ping", "download", "upload", "jitter"]) {
      el[k].textContent = "—";
      metric(k, "pending");
    }
    setProgress(0);
    setGauge("0", "Mbps", "PRÊT");
    status("Prêt à tester");
    el.resultsPanel.classList.remove("visible");
  }

  async function ping(onSample) {
    const values = [];
    for (let i = 0; i < CONFIG.pingSamples; i++) {
      const t = performance.now();
      const r = await fetch(`${CONFIG.serverBase}/api/ping?x=${Date.now()}-${i}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!r.ok) throw new Error("Le serveur de test ne répond pas.");
      await r.text();
      const ms = performance.now() - t;
      values.push(ms);
      onSample?.(values);
    }
    return values;
  }

  function avg(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
  function jitter(a) {
    if (a.length < 2) return 0;
    let s = 0;
    for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]);
    return s / (a.length - 1);
  }

  async function downloadOnce(bytes, onProgress) {
    const t0 = performance.now();
    const r = await fetch(`${CONFIG.serverBase}/api/download?bytes=${bytes}&t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error("Échec du téléchargement de test.");
    const reader = r.body?.getReader();
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        onProgress?.(received / bytes);
      }
    } else {
      const b = await r.arrayBuffer();
      received = b.byteLength;
      onProgress?.(1);
    }
    const seconds = (performance.now() - t0) / 1000;
    return { mbps: (received * 8) / seconds / 1e6, seconds, bytes: received };
  }

  async function adaptiveDownload(onProgress) {
    let best = null;
    for (const mb of CONFIG.downloadSizes) {
      const bytes = mb * 1024 * 1024;
      const result = await downloadOnce(bytes, onProgress);
      best = result;
      if (result.seconds >= CONFIG.minTransferSeconds || mb === CONFIG.downloadSizes.at(-1)) break;
    }
    return best;
  }

  function randomBytes(n) {
    const chunk = new Uint8Array(Math.min(n, 1024 * 1024));
    crypto.getRandomValues(chunk);
    const parts = [];
    let left = n;
    while (left > 0) {
      const size = Math.min(left, chunk.length);
      parts.push(chunk.subarray(0, size));
      left -= size;
    }
    return new Blob(parts, { type: "application/octet-stream" });
  }

  async function uploadOnce(bytes) {
    const body = randomBytes(bytes);
    const t0 = performance.now();
    const r = await fetch(`${CONFIG.serverBase}/api/upload?t=${Date.now()}`, {
      method: "POST", body, cache: "no-store",
      headers: { "Content-Type": "application/octet-stream" }
    });
    if (!r.ok) throw new Error("Échec de l’envoi de test.");
    const result = await r.json();
    const seconds = (performance.now() - t0) / 1000;
    const sent = result.bytes || bytes;
    return { mbps: (sent * 8) / seconds / 1e6, seconds, bytes: sent };
  }

  async function adaptiveUpload() {
    let best = null;
    for (const mb of CONFIG.uploadSizes) {
      best = await uploadOnce(mb * 1024 * 1024);
      if (best.seconds >= CONFIG.minTransferSeconds || mb === CONFIG.uploadSizes.at(-1)) break;
    }
    return best;
  }

  // ─── Run ──────────────────────────────────────────────────────
  async function run() {
    if (running) return;
    running = true;
    el.button.disabled = true;
    el.buttonText.textContent = "Test en cours…";
    reset();

    if (location.protocol === "file:" || location.protocol === "content:") {
      status("Serveur de mesure requis pour le test réel.", false, true);
      setGauge("—", "Mbps", "SERVEUR");
      el.serverBadge.textContent = "SERVEUR REQUIS";
      el.button.disabled = false;
      el.buttonText.textContent = "Réessayer";
      running = false;
      return;
    }

    try {
      status("Connexion au serveur de mesure…", true);
      setGauge("…", "Mbps", "CONNEXION");
      setProgress(.05);
      await new Promise(r => setTimeout(r, 180));

      // Ping + Jitter
      metric("ping", "active"); metric("jitter", "active");
      status("Mesure du ping…", true);
      setGauge("…", "ms", "PING");
      setProgress(.08);
      const samples = await ping(vals => {
        const latest = vals.at(-1);
        el.gaugeValue.textContent = Math.round(latest);
        setProgress(.08 + .22 * (vals.length / CONFIG.pingSamples));
      });
      const p = avg(samples), j = jitter(samples);
      el.ping.textContent = Math.round(p);
      el.jitter.textContent = Math.round(j);
      metric("ping", "done"); metric("jitter", "done");
      el.serverLatency.textContent = Math.round(p) + " ms";

      // Download
      metric("download", "active");
      status("Mesure du téléchargement…", true);
      setGauge("…", "Mbps", "DOWNLOAD");
      setProgress(.36);
      const d = await adaptiveDownload(prog => {
        setProgress(.36 + .30 * prog);
      });
      el.download.textContent = d.mbps.toFixed(1);
      setGauge(d.mbps.toFixed(1), "Mbps", "DOWNLOAD");
      metric("download", "done");
      setProgress(.68);

      // Upload
      metric("upload", "active");
      status("Mesure de l’envoi…", true);
      setGauge("…", "Mbps", "UPLOAD");
      setProgress(.72);
      const u = await adaptiveUpload();
      el.upload.textContent = u.mbps.toFixed(1);
      setGauge(u.mbps.toFixed(1), "Mbps", "UPLOAD");
      metric("upload", "done");
      setProgress(.94);

      // Final
      setGauge(d.mbps.toFixed(1), "Mbps", "TERMINÉ");
      status("Test terminé", false, false);
      setProgress(1);

      const now = new Date();
      const dateStr = now.toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });

      const result = {
        download: d.mbps.toFixed(1),
        upload: u.mbps.toFixed(1),
        ping: Math.round(p),
        jitter: Math.round(j),
        connection: connectionType(),
        isp: el.ispName.textContent,
        server: currentServer.name,
        date: dateStr
      };

      showResults(result);
      saveHistory({
        date: dateStr,
        download: result.download,
        upload: result.upload,
        ping: result.ping
      });

    } catch (e) {
      console.error(e);
      status(e.message || "Une erreur est survenue.", false, true);
      setGauge("—", "Mbps", "ERREUR");
    } finally {
      running = false;
      el.button.disabled = false;
      el.buttonText.textContent = "Relancer le test";
    }
  }

  // ─── Init ─────────────────────────────────────────────────────
  updateServerUI();
  el.connection.textContent = connectionType();
  reset();
  renderHistory();
  detectISP();
  quickPing();

  el.button.addEventListener("click", run);
  el.serverSelector.addEventListener("click", openServerModal);
  el.closeModal.addEventListener("click", () => el.serverModal.classList.remove("open"));
  el.serverModal.addEventListener("click", (e) => {
    if (e.target === el.serverModal) el.serverModal.classList.remove("open");
  });
  el.shareBtn.addEventListener("click", shareResult);
  el.copyBtn.addEventListener("click", copyResult);
  el.clearHistory.addEventListener("click", clearHistory);

  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  c?.addEventListener?.("change", () => el.connection.textContent = connectionType());
})();
                                        
