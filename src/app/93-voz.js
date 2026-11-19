/* ---------- 27d. 🔊 Leer en voz alta (síntesis de voz del navegador, funciona sin conexión) ----------
   Cada recuadro de explicación lleva un botón 🔊. La notación se convierte en palabras para que no se lea letra a letra
   («Cxf7+» → «caballo captura en f7, jaque»). Con «Leer automáticamente» (⚙ Ajustes) se lee cada explicación nueva. */
const Voice = { ok: typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance === "function", box: null, lastText: {} };
const VOICE_BOXES = ["thinkBox", "talkBox", "scanBox", "lessonBox", "retryBox", "coachBox", "cpuBox", "trainFeedback", "aiAnswer"];
const PIECE_WORDS = {
  es: { R: "rey", D: "dama", T: "torre", A: "alfil", C: "caballo" },
  en: { K: "rey", Q: "dama", R: "torre", B: "alfil", N: "caballo" },
  fig: { "♔": "rey", "♕": "dama", "♖": "torre", "♗": "alfil", "♘": "caballo", "♚": "rey", "♛": "dama", "♜": "torre", "♝": "alfil", "♞": "caballo" }
};
const NAG_WORDS = { "!!": "jugada brillante", "!": "buena jugada", "!?": "jugada interesante", "?!": "imprecisión", "?": "error", "??": "error grave" };
/* Texto de ajedrez → texto que se puede leer en voz alta */
function chessToSpeech(text, lang = settings.lang) {
  const map = lang === "en" ? PIECE_WORDS.en : PIECE_WORDS.es;
  let t = String(text || "");
  t = t.replace(/[♔♕♖♗♘♚♛♜♝♞]/g, ch => (lang === "en" ? { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N" } : { "♔": "R", "♕": "D", "♖": "T", "♗": "A", "♘": "C", "♚": "R", "♛": "D", "♜": "T", "♝": "A", "♞": "C" })[ch]);
  t = t.replace(/\b[O0]-[O0]-[O0]([+#]?)/g, (_, c) => "enroque largo" + (c === "#" ? ", mate" : c ? ", jaque" : ""));
  t = t.replace(/\b[O0]-[O0]([+#]?)/g, (_, c) => "enroque corto" + (c === "#" ? ", mate" : c ? ", jaque" : ""));
  const pieces = Object.keys(map).join("");
  const re = new RegExp(`(^|[\\s(«"'—–-])(\\d+\\.(?:\\.\\.|…)?\\s*)?([${pieces}])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([${pieces}]))?([+#])?(!!|\\?\\?|!\\?|\\?!|!|\\?)?(?=$|[\\s,.;:)»"'—–-])`, "g");
  t = t.replace(re, (all, pre, num, pc, df, dr, x, to, promo, chk, nag) => {
    if (!pc && !x && !df && !dr && !promo && !chk && !nag && !num) return all;   // una casilla suelta («e4») se deja tal cual
    let w = pc ? map[pc] : "peón";
    if (df || dr) w += ` de ${df || ""}${dr || ""}`;
    w += x ? ` captura en ${to}` : ` a ${to}`;
    if (promo) w += ` y corona ${map[promo] === "dama" ? "dama" : "en " + map[promo]}`;
    if (chk) w += chk === "#" ? ", mate" : ", jaque";
    if (nag) w += `, ${NAG_WORDS[nag]}`;
    return pre + (num ? num.replace(/[.…\s]+/g, "") + ". " : "") + w;
  });
  t = t.replace(/([+−-])(\d+)\.(\d\d)\b/g, (_, s, a, b) => `${s === "+" ? "más" : "menos"} ${a},${b}`);
  t = t.replace(/\p{Extended_Pictographic}|️|‍/gu, " ");
  return t.replace(/\s+/g, " ").trim();
}
function speakText(text) {
  if (!Voice.ok) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    const v = (synth.getVoices() || []).find(x => /^es(-|_|$)/i.test(x.lang) && /es-ES/i.test(x.lang)) || (synth.getVoices() || []).find(x => /^es/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1;
    u.onend = u.onerror = () => { if (Voice.utter === u) { Voice.utter = null; Voice.box = null; voiceButtons(); } };
    Voice.utter = u;
    synth.speak(u);
    return true;
  } catch (e) { console.warn("Voz:", e); return false; }
}
function stopSpeaking() {
  if (!Voice.ok) return;
  try { window.speechSynthesis.cancel(); } catch {}
  Voice.utter = null; Voice.box = null;
  voiceButtons();
}
/* El texto de un recuadro sin sus botones ni controles */
function boxSpeechText(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll("button, select, input, textarea, .speak-btn, .controls, script, style").forEach(x => x.remove());
  return chessToSpeech(c.innerText || c.textContent || "");
}
function speakBox(id) {
  const el = $(id);
  if (!el || el.hidden) return;
  if (Voice.box === id) { stopSpeaking(); return; }
  const text = boxSpeechText(el);
  if (!text) return;
  if (speakText(text)) { Voice.box = id; voiceButtons(); }
}
function voiceButtons() {
  document.querySelectorAll(".speak-btn").forEach(b => {
    const on = Voice.box === b.dataset.box;
    b.textContent = on ? "⏹" : "🔊";
    b.title = on ? "Dejar de leer" : "Leer en voz alta";
    b.setAttribute("aria-label", b.title);
    b.setAttribute("aria-pressed", String(on));
  });
}
/* Pone el botón en cada recuadro (y lo vuelve a poner cuando el recuadro se redibuja) y, si se pide, lee lo nuevo */
function ensureSpeakButton(id) {
  const el = $(id);
  if (!el || el.querySelector(".speak-btn")) return;
  const head = el.querySelector(".retry-head");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sm-btn speak-btn" + (head ? "" : " float");
  b.dataset.box = id;
  b.onclick = e => { e.stopPropagation(); speakBox(id); };
  if (head) head.append(b); else el.prepend(b);
  voiceButtons();
}
/* Un temporizador por recuadro: si fuera uno solo, el cambio de otro recuadro anularía la lectura pendiente */
const voiceTimers = {};
const voiceAuto = id => { clearTimeout(voiceTimers[id]); voiceTimers[id] = setTimeout(() => voiceAutoNow(id), 450); };
function voiceAutoNow(id) {
  const el = $(id);
  if (!settings.voiceAuto || !el || el.hidden) return;
  const text = boxSpeechText(el);
  if (!text || text === Voice.lastText[id] || /⏳/.test(el.textContent)) return;
  Voice.lastText[id] = text;
  if (speakText(text)) { Voice.box = id; voiceButtons(); }
}
(function initVoice() {
  if (!Voice.ok) { const row = $("voiceRow"); if (row) row.hidden = true; return; }
  for (const id of VOICE_BOXES) {
    const el = $(id);
    if (!el) continue;
    new MutationObserver(() => {
      ensureSpeakButton(id);
      if (el.hidden && Voice.box === id) stopSpeaking();
      voiceAuto(id);
    }).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    ensureSpeakButton(id);
  }
  if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = () => {};
  window.addEventListener("pagehide", () => { try { window.speechSynthesis.cancel(); } catch {} });
})();
