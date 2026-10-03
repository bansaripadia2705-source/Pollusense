
/* =====================================================================
   Smart Industrial Pollution Monitoring — Frontend Application
   Golden Corridor: Vapi · Ankleshwar · Vatva
   Powered by IBM Granite LLM + Watsonx.AI
   ===================================================================== */

const API = "http://localhost:5000/api";

// Chart instances — declared first so theme/language IIFEs below can reference it
const charts = {};

// Thresholds for percentage bar calculation
const AIR_MAX  = { PM2_5:150, PM10:250, SO2:200, NO2:200, CO:15, O3:250, VOC:700, H2S:35 };
const WATER_MAX= { pH:14, BOD:60, COD:500, TDS:3000, Turbidity:50, DO:10, Nitrates:80, HeavyMetals:1.0 };

// ════════════════════════════════════════════════════════════════════
//  THEME — Dark / Light Mode
// ════════════════════════════════════════════════════════════════════

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const iconEl  = document.getElementById("theme-icon");
  const labelEl = document.getElementById("theme-label");
  if (iconEl)  iconEl.textContent  = theme === "dark" ? "🌙" : "☀️";
  if (labelEl) labelEl.textContent = theme === "dark" ? "Dark" : "Light";
  localStorage.setItem("pollution-monitor-theme", theme);
  // Redraw charts so they pick up new grid/label colours
  Object.values(charts).forEach(c => { try { c.update(); } catch(e) {} });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

// Restore saved theme on load
(function() {
  const saved = localStorage.getItem("pollution-monitor-theme") || "dark";
  applyTheme(saved);
})();


// ════════════════════════════════════════════════════════════════════
//  LANGUAGE — Global + Chat
// ════════════════════════════════════════════════════════════════════

const LANG_STRINGS = {
  english: {
    welcome: "Hello! I'm your Environmental AI Assistant for the Golden Corridor (Vapi, Ankleshwar, Vatva). I can help you with pollution levels, health advisories, remedies, and regulatory guidance. How can I help you today?",
    chatTitle: "Environmental AI Assistant",
    chatSubtitle: "Ask me anything about pollution, health risks, or remedies",
    chatPlaceholder: "Type your question here… (English / हिंदी / ગુજરાતી)",
    qsTitle: "💡 Quick Questions",
    ctxTitle: "📡 Live Context",
    quickPrompts: [
      "What is the current AQI in Vapi?",
      "Is it safe to go outside today?",
      "What are the health risks for children?",
      "Which factory is causing the pollution?",
      "How can industries reduce SO2 emissions?",
      "What remedies exist for high BOD in water?",
      "How to file a complaint with GPCB?",
      "What is the water quality index today?",
    ],
  },
  hindi: {
    welcome: "नमस्ते! मैं गोल्डन कॉरिडोर (वापी, अंकलेश्वर, वटवा) के लिए आपका पर्यावरण AI सहायक हूं। मैं प्रदूषण स्तर, स्वास्थ्य सलाह, उपाय और नियामक मार्गदर्शन में आपकी मदद कर सकता हूं। आज मैं आपकी कैसे सहायता कर सकता हूं?",
    chatTitle: "पर्यावरण AI सहायक",
    chatSubtitle: "प्रदूषण, स्वास्थ्य जोखिम या उपाय के बारे में पूछें",
    chatPlaceholder: "अपना प्रश्न यहाँ टाइप करें…",
    qsTitle: "💡 त्वरित प्रश्न",
    ctxTitle: "📡 लाइव डेटा",
    quickPrompts: [
      "वापी में अभी AQI क्या है?",
      "क्या आज बाहर जाना सुरक्षित है?",
      "बच्चों के लिए स्वास्थ्य जोखिम क्या हैं?",
      "कौन सा कारखाना प्रदूषण फैला रहा है?",
      "SO2 उत्सर्जन कम करने के उपाय?",
      "पानी में BOD अधिक हो तो क्या करें?",
      "GPCB में शिकायत कैसे दर्ज करें?",
      "आज जल गुणवत्ता सूचकांक क्या है?",
    ],
  },
  gujarati: {
    welcome: "નમસ્તે! હું ગોલ્ડન કોરિડોર (વાપી, અંકલેશ્વર, વટવા) માટે તમારો પર્યાવરણ AI સહાયક છું. હું પ્રદૂષણ સ્તર, સ્વાસ્થ્ય સલાહ, ઉપાય અને નિયમનકારી માર્ગદર્શનમાં મદદ કરી શકું છું. આજે હું તમારી કેવી રીતે મદદ કરી શકું?",
    chatTitle: "પર્યાવરણ AI સહાયક",
    chatSubtitle: "પ્રદૂષણ, સ્વાસ્થ્ય જોખમ અથવા ઉપાય વિશે પૂછો",
    chatPlaceholder: "તમારો પ્રશ્ન અહીં ટાઈપ કરો…",
    qsTitle: "💡 ઝડપી પ્રશ્નો",
    ctxTitle: "📡 લાઈવ ડેટા",
    quickPrompts: [
      "વાપીમાં અત્યારે AQI શું છે?",
      "આજે બહાર જવું સુરક્ષિત છે?",
      "બાળકો માટે સ્વાસ્થ્ય જોખમ શું છે?",
      "કયું કારખાનું પ્રદૂષણ ફેલાવે છે?",
      "SO2 ઉત્સર્જન ઘટાડવાના ઉપાય?",
      "પાણીમાં BOD વધારે હોય તો શું કરવું?",
      "GPCB માં ફરિયાદ કેવી રીતે નોંધાવવી?",
      "આજે જળ ગુણવત્તા સૂચકાંક શું છે?",
    ],
  },
};

let currentLanguage = "english";

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem("pollution-monitor-language", lang);
  // Sync both language dropdowns
  const globalSel = document.getElementById("global-language");
  const chatSel = document.getElementById("chat-language");
  if (globalSel) globalSel.value = lang;
  if (chatSel) chatSel.value = lang;
  // Update chat UI text
  updateChatLanguageUI(lang);
}

function onChatLangChange() {
  const lang = document.getElementById("chat-language").value;
  setLanguage(lang);
}

function updateChatLanguageUI(lang) {
  const s = LANG_STRINGS[lang] || LANG_STRINGS.english;
  const titleEl = document.getElementById("chat-title");
  const subtitleEl = document.getElementById("chat-subtitle");
  const inputEl = document.getElementById("chat-input");
  const qsTitleEl = document.getElementById("qs-title");
  const ctxTitleEl = document.getElementById("ctx-title");
  if (titleEl) titleEl.textContent = s.chatTitle;
  if (subtitleEl) subtitleEl.textContent = s.chatSubtitle;
  if (inputEl) inputEl.placeholder = s.chatPlaceholder;
  if (qsTitleEl) qsTitleEl.textContent = s.qsTitle;
  if (ctxTitleEl) ctxTitleEl.textContent = s.ctxTitle;
  renderQuickPrompts(lang);
}

function renderQuickPrompts(lang) {
  const container = document.getElementById("quick-prompts");
  if (!container) return;
  const prompts = (LANG_STRINGS[lang] || LANG_STRINGS.english).quickPrompts;
  container.innerHTML = prompts.map(p =>
    `<button class="qp-btn" onclick="useQuickPrompt(this.textContent)">${p}</button>`
  ).join("");
}

function useQuickPrompt(text) {
  const input = document.getElementById("chat-input");
  if (input) {
    input.value = text;
    input.focus();
  }
}

// Restore saved language on load
(function() {
  const saved = localStorage.getItem("pollution-monitor-language") || "english";
  currentLanguage = saved;
  const globalSel = document.getElementById("global-language");
  if (globalSel) globalSel.value = saved;
})();


// ════════════════════════════════════════════════════════════════════
//  ENVIRONMENTAL DASHBOARD AGENT
// ════════════════════════════════════════════════════════════════════

async function runEnvDashboard() {
  const loc = document.getElementById("envdash-location").value;
  const cardsEl = document.getElementById("envdash-cards");
  const aiPanel = document.getElementById("envdash-ai-panel");
  const aiBtnEl = document.querySelector("#tab-env-dashboard .btn-agent");

  cardsEl.innerHTML = `<div class="loading" style="grid-column:1/-1"><span class="spinner"></span>Fetching environmental data…</div>`;
  aiPanel.classList.add("hidden");
  if (aiBtnEl) aiBtnEl.disabled = true;

  try {
    const resp = await fetch(`${API}/agents/env-dashboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: loc }),
    });
    const d = await resp.json();

    // Render location snapshot cards
    cardsEl.innerHTML = "";
    for (const [locName, snap] of Object.entries(d.snapshot)) {
      const compColor = snap.compliance_pct >= 60 ? "#22c55e" : snap.compliance_pct >= 30 ? "#eab308" : "#ef4444";
      const violTags = snap.top_violations.map(v =>
        `<span class="envdash-violation-tag">${v.param}=${v.value}</span>`
      ).join("") || `<span style="color:#22c55e;font-size:0.75rem">✅ No critical violations</span>`;

      // Mini sparkline using inline SVG
      const aqiTrend = snap.aqi_trend;
      const sparkHtml = aqiTrend.length >= 2 ? buildSparkline(aqiTrend, snap.aqi.color) : "";

      cardsEl.innerHTML += `
        <div class="envdash-card">
          <div class="envdash-card-header">
            <div class="envdash-loc-name">📍 ${locName}</div>
            <div class="envdash-compliance" style="background:${compColor}20;color:${compColor}">
              ${snap.compliance_pct}% Compliant
            </div>
          </div>
          <div class="envdash-indexes">
            <div class="envdash-idx">
              <div class="lbl">AQI</div>
              <div class="val" style="color:${snap.aqi.color}">${snap.aqi.value}</div>
              <div class="st" style="color:${snap.aqi.color}">${snap.aqi.status}</div>
            </div>
            <div class="envdash-idx">
              <div class="lbl">WQI</div>
              <div class="val" style="color:${snap.wqi.color}">${snap.wqi.value}</div>
              <div class="st" style="color:${snap.wqi.color}">${snap.wqi.status}</div>
            </div>
            <div class="envdash-idx">
              <div class="lbl">Bad Params</div>
              <div class="val" style="color:#ef4444">${snap.bad_params}</div>
              <div class="st" style="color:#eab308">${snap.moderate_params} moderate</div>
            </div>
          </div>
          ${sparkHtml ? `<div style="margin-bottom:0.5rem">${sparkHtml}</div>` : ""}
          <div class="envdash-violations">
            <span style="color:var(--text-dim);font-size:0.7rem;text-transform:uppercase">Top Violations: </span>
            ${violTags}
          </div>
        </div>`;
    }

    // Show AI summary panel
    aiPanel.classList.remove("hidden");
    document.getElementById("envdash-worst-badge").textContent =
      `⚠️ Worst: ${d.worst_location} (${d.total_bad_params} total violations)`;
    document.getElementById("envdash-ai-body").textContent = d.ai_summary;

    showToast(`✅ Dashboard report generated for ${loc === "all" ? "all locations" : loc}`, "good");
  } catch (e) {
    cardsEl.innerHTML = `<div class="loading" style="color:#ef4444">Error: ${e.message}</div>`;
  } finally {
    if (aiBtnEl) aiBtnEl.disabled = false;
  }
}

function buildSparkline(values, color) {
  if (!values || values.length < 2) return "";
  const w = 100, h = 30;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:30px">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}


// ════════════════════════════════════════════════════════════════════
//  AI CHAT ASSISTANT
// ════════════════════════════════════════════════════════════════════

let chatHistory = [];  // [{role: "user"|"assistant", content: "..."}]

async function initChatAssistant() {
  const lang = currentLanguage;
  updateChatLanguageUI(lang);
  const chatSel = document.getElementById("chat-language");
  if (chatSel) chatSel.value = lang;
  await refreshChatContext();
}

async function refreshChatContext() {
  const loc = document.getElementById("chat-location")?.value || "Vapi";
  const ctxBox = document.getElementById("chat-context-box");
  if (!ctxBox) return;
  try {
    const resp = await fetch(`${API}/sensors/${loc}/latest`);
    const d = await resp.json();
    ctxBox.innerHTML = `
      <div class="ctx-row"><span class="ctx-label">📍 Location</span><span style="font-weight:600;color:var(--text)">${loc}</span></div>
      <div class="ctx-row"><span class="ctx-label">AQI</span><span style="font-weight:700;color:${d.aqi.color}">${d.aqi.value} — ${d.aqi.status}</span></div>
      <div class="ctx-row"><span class="ctx-label">WQI</span><span style="font-weight:700;color:${d.wqi.color}">${d.wqi.value} — ${d.wqi.status}</span></div>
      <div class="ctx-row"><span class="ctx-label">PM2.5</span><span>${d.air.PM2_5} µg/m³</span></div>
      <div class="ctx-row"><span class="ctx-label">SO2</span><span>${d.air.SO2} µg/m³</span></div>
      <div class="ctx-row"><span class="ctx-label">BOD</span><span>${d.water.BOD} mg/L</span></div>
      <div class="ctx-row" style="margin:0"><span class="ctx-label">pH</span><span>${d.water.pH}</span></div>`;
  } catch (e) {
    ctxBox.innerHTML = `<span style="color:var(--text-dim);font-size:0.75rem">Context unavailable</span>`;
  }
}

function appendMessage(role, text, isTyping = false) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (isTyping) {
    div.id = "typing-indicator";
    div.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "👤" : "🤖"}</div>
      <div class="msg-bubble">
        <div class="msg-text"><div class="typing-dots"><span></span><span></span><span></span></div></div>
      </div>`;
  } else {
    div.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "👤" : "🤖"}</div>
      <div class="msg-bubble">
        <div class="msg-text">${text}</div>
        <div class="msg-time">${now}</div>
      </div>`;
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const msg = input.value.trim();
  if (!msg) return;

  const lang = document.getElementById("chat-language").value;
  const loc  = document.getElementById("chat-location").value;

  // Append user message
  appendMessage("user", msg);
  chatHistory.push({ role: "user", content: msg });
  input.value = "";
  sendBtn.disabled = true;
  document.getElementById("chat-send-icon").textContent = "⏳";

  // Show typing indicator
  const typingEl = appendMessage("assistant", "", true);

  try {
    const resp = await fetch(`${API}/agents/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        language: lang,
        location: loc,
        history: chatHistory.slice(-6),
      }),
    });
    const d = await resp.json();

    // Remove typing indicator
    typingEl.remove();

    const aiText = d.response || "Sorry, I could not process your request.";
    appendMessage("assistant", aiText);
    chatHistory.push({ role: "assistant", content: aiText });

    // Keep history bounded
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    // Refresh context
    await refreshChatContext();
  } catch (e) {
    typingEl.remove();
    appendMessage("assistant", `⚠️ Connection error: ${e.message}. Please ensure the backend is running.`);
  } finally {
    sendBtn.disabled = false;
    document.getElementById("chat-send-icon").textContent = "➤";
  }
}

function handleChatKey(event) {
  // Send on Enter (not Shift+Enter)
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

function clearChat() {
  chatHistory = [];
  const messages = document.getElementById("chat-messages");
  if (!messages) return;
  const lang = currentLanguage;
  const welcome = (LANG_STRINGS[lang] || LANG_STRINGS.english).welcome;
  messages.innerHTML = `
    <div class="chat-msg assistant">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <div class="msg-text">${welcome}</div>
        <div class="msg-time">Now</div>
      </div>
    </div>`;
}


// ── Utility ─────────────────────────────────────────────────────────────────

function statusColor(s) {
  return s === "good" ? "#22c55e" : s === "moderate" ? "#eab308" : "#ef4444";
}

function statusIcon(s) {
  return s === "good" ? "✅" : s === "moderate" ? "⚠️" : "🚨";
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 10)  return "just now";
  if (diff < 60)  return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

function showToast(msg, type = "info") {
  const c = document.getElementById("toast-container");
  const d = document.createElement("div");
  d.className = `toast ${type}`;
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

function getParamStatus(param, value, category) {
  const airTh = {
    PM2_5:   { good:30, moderate:60 },
    PM10:    { good:50, moderate:100 },
    SO2:     { good:40, moderate:80 },
    NO2:     { good:40, moderate:80 },
    CO:      { good:2,  moderate:5 },
    O3:      { good:50, moderate:100 },
    VOC:     { good:150,moderate:300 },
    H2S:     { good:5,  moderate:10 },
  };
  const waterTh = {
    pH:           { type:"range", good:[6.5,8.5], moderate:[6.0,9.0] },
    BOD:          { good:3,   moderate:10 },
    COD:          { good:50,  moderate:150 },
    TDS:          { good:500, moderate:1000 },
    Turbidity:    { good:5,   moderate:15 },
    DO:           { type:"reverse", good:6, moderate:4 },
    Nitrates:     { good:10,  moderate:30 },
    HeavyMetals:  { good:0.05,moderate:0.1 },
  };
  const th = category === "air" ? airTh[param] : waterTh[param];
  if (!th) return "unknown";
  if (th.type === "range") {
    const v = parseFloat(value);
    if (v >= th.good[0] && v <= th.good[1]) return "good";
    if (v >= th.moderate[0] && v <= th.moderate[1]) return "moderate";
    return "bad";
  }
  if (th.type === "reverse") {
    if (value >= th.good) return "good";
    if (value >= th.moderate) return "moderate";
    return "bad";
  }
  if (value <= th.good) return "good";
  if (value <= th.moderate) return "moderate";
  return "bad";
}

// ── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => {
    if (b.textContent.toLowerCase().includes(name.replace("-", " "))) {
      b.classList.add("active");
    }
  });
  if (name === "air")       loadAirDetail();
  if (name === "water")     loadWaterDetail();
  if (name === "alerts")    loadAlerts();
  if (name === "assistant") initChatAssistant();
  // env-dashboard and agents tabs have no auto-load; user triggers each agent manually
}

// ── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  document.getElementById("header-time").textContent =
    now.toLocaleTimeString("en-IN", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Dashboard Location Cards ─────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const resp = await fetch(`${API}/sensors/latest`);
    const data = await resp.json();
    renderLocationCards(data);
    loadTrends();
  } catch (e) {
    console.error("Dashboard load error:", e);
  }
}

function renderLocationCards(data) {
  const container = document.getElementById("location-cards");
  container.innerHTML = "";
  for (const [loc, d] of Object.entries(data)) {
    const aqi = d.aqi;
    const wqi = d.wqi;
    const air = d.air;
    const water = d.water;
    // Pick a few key params for the mini display
    const airSample = ["PM2_5","SO2","NO2","CO"];
    const waterSample = ["pH","BOD","DO","TDS"];

    let airRows = airSample.map(p => {
      const s = getParamStatus(p, air[p], "air");
      return `<div class="mini-param ${s}">
        <span class="pname">${p.replace("_",".")}</span>
        <span class="pval">${air[p]}</span>
      </div>`;
    }).join("");

    let waterRows = waterSample.map(p => {
      const s = getParamStatus(p, water[p], "water");
      return `<div class="mini-param ${s}">
        <span class="pname">${p}</span>
        <span class="pval">${water[p]}</span>
      </div>`;
    }).join("");

    container.innerHTML += `
    <div class="location-card">
      <div class="lc-header">
        <div>
          <div class="lc-name">📍 ${loc}</div>
          <div class="lc-time">${timeAgo(d.timestamp)}</div>
        </div>
      </div>
      <div class="lc-indexes">
        <div class="index-box">
          <div class="index-label">AQI</div>
          <div class="index-value" style="color:${aqi.color}">${aqi.value}</div>
          <div class="index-status" style="color:${aqi.color}">${aqi.status}</div>
        </div>
        <div class="index-box">
          <div class="index-label">WQI</div>
          <div class="index-value" style="color:${wqi.color}">${wqi.value}</div>
          <div class="index-status" style="color:${wqi.color}">${wqi.status}</div>
        </div>
      </div>
      <div class="lc-params">
        ${airRows}${waterRows}
      </div>
    </div>`;
  }
}

// ── Trend Charts ─────────────────────────────────────────────────────────────

async function loadTrends() {
  const loc = document.getElementById("trend-location").value;
  try {
    const resp = await fetch(`${API}/sensors/${loc}/history?limit=20`);
    const history = await resp.json();
    if (!history.length) return;

    const labels = history.map(d => {
      const t = new Date(d.timestamp);
      return t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    });

    // Air trend
    buildLineChart("air-trend-chart", labels, [
      { label: "PM2.5", data: history.map(d => d.air.PM2_5), borderColor: "#38bdf8", tension: 0.4 },
      { label: "SO2",   data: history.map(d => d.air.SO2),   borderColor: "#f97316", tension: 0.4 },
      { label: "NO2",   data: history.map(d => d.air.NO2),   borderColor: "#a855f7", tension: 0.4 },
      { label: "PM10",  data: history.map(d => d.air.PM10),  borderColor: "#eab308", tension: 0.4 },
    ]);

    // Water trend
    buildLineChart("water-trend-chart", labels, [
      { label: "BOD",   data: history.map(d => d.water.BOD),   borderColor: "#22c55e", tension: 0.4 },
      { label: "COD",   data: history.map(d => d.water.COD),   borderColor: "#ef4444", tension: 0.4 },
      { label: "TDS",   data: history.map(d => d.water.TDS),   borderColor: "#38bdf8", tension: 0.4 },
      { label: "DO",    data: history.map(d => d.water.DO),    borderColor: "#84cc16", tension: 0.4 },
    ]);

    // AQI vs WQI
    buildLineChart("aqi-wqi-chart", labels, [
      { label: "AQI", data: history.map(d => d.aqi.value), borderColor: "#f97316", tension: 0.4, yAxisID: "y" },
      { label: "WQI", data: history.map(d => d.wqi.value), borderColor: "#22c55e", tension: 0.4, yAxisID: "y1" },
    ], true);

    // Status pie
    const counts = { good: 0, moderate: 0, bad: 0 };
    const latest = history[history.length - 1];
    for (const [p, v] of Object.entries(latest.air))   counts[getParamStatus(p, v, "air")]++;
    for (const [p, v] of Object.entries(latest.water)) counts[getParamStatus(p, v, "water")]++;
    buildPieChart("status-pie-chart", counts);

  } catch (e) {
    console.error("Trend load error:", e);
  }
}

function buildLineChart(id, labels, datasets, dualAxis = false) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (charts[id]) charts[id].destroy();
  const opts = {
    responsive: true,
    animation: false,
    plugins: { legend: { labels: { color: "#94a3b8", font: { size: 10 } } } },
    scales: {
      x: {
        ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 8 },
        grid: { color: "#1e293b" },
      },
      y: {
        ticks: { color: "#64748b", font: { size: 9 } },
        grid: { color: "#1e293b" },
      },
    },
  };
  if (dualAxis) {
    opts.scales.y1 = {
      position: "right",
      ticks: { color: "#64748b", font: { size: 9 } },
      grid: { drawOnChartArea: false },
    };
    datasets[1].yAxisID = "y1";
  }
  datasets.forEach(d => {
    d.fill = false;
    d.pointRadius = 2;
    d.borderWidth = 2;
    d.backgroundColor = d.borderColor + "20";
  });
  charts[id] = new Chart(canvas, { type: "line", data: { labels, datasets }, options: opts });
}

function buildPieChart(id, counts) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Good", "Moderate", "Bad"],
      datasets: [{
        data: [counts.good, counts.moderate, counts.bad],
        backgroundColor: ["#22c55e", "#eab308", "#ef4444"],
        borderColor: "#0f1117",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 11 } } },
      },
    },
  });
}

// ── Air Quality Detail ───────────────────────────────────────────────────────

async function loadAirDetail() {
  const loc = document.getElementById("air-location").value;
  const grid = document.getElementById("air-params-grid");
  grid.innerHTML = `<div class="loading"><span class="spinner"></span>Loading sensor data…</div>`;
  try {
    const resp = await fetch(`${API}/sensors/${loc}/latest`);
    const d = await resp.json();
    const units = { PM2_5:"µg/m³", PM10:"µg/m³", SO2:"µg/m³", NO2:"µg/m³", CO:"mg/m³", O3:"µg/m³", VOC:"µg/m³", H2S:"µg/m³" };
    const labels = { PM2_5:"PM 2.5", PM10:"PM 10", SO2:"SO₂", NO2:"NO₂", CO:"CO", O3:"O₃", VOC:"VOC", H2S:"H₂S" };
    const thresholds = { PM2_5:30, PM10:50, SO2:40, NO2:40, CO:2, O3:50, VOC:150, H2S:5 };

    grid.innerHTML = "";
    const barLabels = [], barValues = [], barColors = [];
    for (const [p, v] of Object.entries(d.air)) {
      const s = getParamStatus(p, v, "air");
      const pct = Math.min(100, Math.round(v / AIR_MAX[p] * 100));
      grid.innerHTML += `
      <div class="param-card ${s}">
        <div class="param-name">${labels[p] || p}</div>
        <div><span class="param-value">${v}</span><span class="param-unit">${units[p]||""}</span></div>
        <span class="param-status ${s}">${s}</span>
        <div class="param-threshold">Safe limit: ${thresholds[p]} ${units[p]||""}</div>
        <div class="param-bar-bg"><div class="param-bar" style="width:${pct}%"></div></div>
      </div>`;
      barLabels.push(labels[p] || p);
      barValues.push(v);
      barColors.push(statusColor(s));
    }

    // Bar chart
    const canvas = document.getElementById("air-bar-chart");
    if (charts["air-bar"]) charts["air-bar"].destroy();
    charts["air-bar"] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: barLabels,
        datasets: [{ label: `${loc} — Air Parameters`, data: barValues, backgroundColor: barColors.map(c=>c+"90"), borderColor: barColors, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { labels: { color: "#94a3b8" } } },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
        },
      },
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading">Error loading data.</div>`;
  }
}

// ── Water Quality Detail ─────────────────────────────────────────────────────

async function loadWaterDetail() {
  const loc = document.getElementById("water-location").value;
  const grid = document.getElementById("water-params-grid");
  grid.innerHTML = `<div class="loading"><span class="spinner"></span>Loading sensor data…</div>`;
  try {
    const resp = await fetch(`${API}/sensors/${loc}/latest`);
    const d = await resp.json();
    const units   = { pH:"pH", BOD:"mg/L", COD:"mg/L", TDS:"mg/L", Turbidity:"NTU", DO:"mg/L", Nitrates:"mg/L", HeavyMetals:"mg/L" };
    const thresholds = { pH:"6.5–8.5", BOD:"3", COD:"50", TDS:"500", Turbidity:"5", DO:"≥6", Nitrates:"10", HeavyMetals:"0.05" };

    grid.innerHTML = "";
    const barLabels = [], barValues = [], barColors = [];
    for (const [p, v] of Object.entries(d.water)) {
      const s = getParamStatus(p, v, "water");
      const max = WATER_MAX[p] || 100;
      const pct = Math.min(100, Math.round(v / max * 100));
      grid.innerHTML += `
      <div class="param-card ${s}">
        <div class="param-name">${p}</div>
        <div><span class="param-value">${v}</span><span class="param-unit">${units[p]||""}</span></div>
        <span class="param-status ${s}">${s}</span>
        <div class="param-threshold">Safe: ${thresholds[p]} ${units[p]||""}</div>
        <div class="param-bar-bg"><div class="param-bar" style="width:${pct}%"></div></div>
      </div>`;
      barLabels.push(p);
      barValues.push(v);
      barColors.push(statusColor(s));
    }

    const canvas = document.getElementById("water-bar-chart");
    if (charts["water-bar"]) charts["water-bar"].destroy();
    charts["water-bar"] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: barLabels,
        datasets: [{ label: `${loc} — Water Parameters`, data: barValues, backgroundColor: barColors.map(c=>c+"90"), borderColor: barColors, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { labels: { color: "#94a3b8" } } },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
        },
      },
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading">Error loading data.</div>`;
  }
}

// ── Alerts ───────────────────────────────────────────────────────────────────

async function loadAlerts() {
  const container = document.getElementById("alerts-container");
  container.innerHTML = `<div class="loading"><span class="spinner"></span>Checking sensors for violations…</div>`;
  try {
    const resp = await fetch(`${API}/alerts`);
    const alerts = await resp.json();
    document.getElementById("alert-count-badge").textContent = `${alerts.length} Active`;

    if (!alerts.length) {
      container.innerHTML = `<div class="no-alerts">✅ All parameters within safe limits. No active violations.</div>`;
      return;
    }

    container.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.status}">
      <div class="alert-icon">${a.status === "bad" ? "🚨" : "⚠️"}</div>
      <div class="alert-body">
        <div class="alert-message">${a.message}</div>
        <div class="alert-detail">
          📍 ${a.location} · ${a.category.toUpperCase()} · Threshold: ${a.threshold} ${a.unit} · ${timeAgo(a.timestamp)}
        </div>
      </div>
      <span class="alert-badge ${a.status}">${a.status}</span>
      <button class="alert-btn" onclick="getParamRemedy('${a.parameter}','${a.value}','${a.category}','${a.status}','${a.location}')">Get Remedy</button>
    </div>`).join("");
  } catch (e) {
    container.innerHTML = `<div class="loading">Error loading alerts.</div>`;
  }
}

// ── AI Analysis ──────────────────────────────────────────────────────────────

async function runAIAnalysis() {
  const loc = document.getElementById("ai-location").value;
  const btn = document.querySelector(".btn-ai");
  const textEl = document.getElementById("ai-btn-text");
  btn.disabled = true;
  textEl.innerHTML = `<span class="spinner"></span>IBM Granite LLM is analyzing…`;

  try {
    const resp = await fetch(`${API}/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: loc }),
    });
    const result = await resp.json();

    // Show result panel
    const panel = document.getElementById("ai-result-panel");
    panel.classList.remove("hidden");

    document.getElementById("ai-result-location").textContent = `📍 ${loc} — AI Analysis`;
    const statusBadge = document.getElementById("ai-status-badge");
    statusBadge.textContent = result.overall_status.toUpperCase();
    statusBadge.className = `ai-status-badge ${result.overall_status}`;

    document.getElementById("ai-metrics-row").innerHTML = `
      <div class="ai-metric">
        <div class="ai-metric-label">AQI</div>
        <div class="ai-metric-value" style="color:${result.aqi.color}">${result.aqi.value}</div>
      </div>
      <div class="ai-metric">
        <div class="ai-metric-label">AQI Status</div>
        <div class="ai-metric-value" style="color:${result.aqi.color};font-size:0.9rem">${result.aqi.status}</div>
      </div>
      <div class="ai-metric">
        <div class="ai-metric-label">WQI</div>
        <div class="ai-metric-value" style="color:${result.wqi.color}">${result.wqi.value}</div>
      </div>
      <div class="ai-metric">
        <div class="ai-metric-label">WQI Status</div>
        <div class="ai-metric-value" style="color:${result.wqi.color};font-size:0.9rem">${result.wqi.status}</div>
      </div>
      <div class="ai-metric">
        <div class="ai-metric-label">Bad Params</div>
        <div class="ai-metric-value" style="color:#ef4444">${result.bad_count}</div>
      </div>
      <div class="ai-metric">
        <div class="ai-metric-label">Moderate</div>
        <div class="ai-metric-value" style="color:#eab308">${result.moderate_count}</div>
      </div>`;

    document.getElementById("ai-response-text").textContent = result.ai_response;

    const vList = document.getElementById("violations-list");
    if (result.violations.length) {
      vList.innerHTML = `<div style="font-size:0.78rem;color:#64748b;margin-bottom:0.5rem;text-transform:uppercase">Violations / Concerns</div>` +
        result.violations.map(v => `<span class="violation-tag">${v}</span>`).join("");
    } else {
      vList.innerHTML = `<span style="color:#22c55e;font-size:0.82rem">✅ No violations detected — all parameters within safe limits.</span>`;
    }

    showToast(`✅ Analysis complete for ${loc}`, result.overall_status);
  } catch (e) {
    console.error("AI analysis error:", e);
    showToast("❌ Error connecting to AI backend", "bad");
  } finally {
    btn.disabled = false;
    textEl.innerHTML = `🔍 Analyze with IBM Granite LLM`;
  }
}

async function getParamRemedy(param, value, category, status, location) {
  switchTab("ai");
  document.getElementById("ai-location").value = location;
  const panel = document.getElementById("ai-result-panel");
  panel.classList.remove("hidden");
  document.getElementById("ai-response-text").textContent = "⏳ Fetching IBM Granite LLM remediation advice…";
  document.getElementById("ai-result-location").textContent = `💊 Remedy for ${param} — ${location}`;

  try {
    const resp = await fetch(`${API}/ai/remedies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parameter: param, value: parseFloat(value), category, status, location }),
    });
    const result = await resp.json();
    document.getElementById("ai-response-text").textContent = result.remedies;
  } catch (e) {
    document.getElementById("ai-response-text").textContent = "Error fetching remedies.";
  }
}

// ── Auto-refresh ─────────────────────────────────────────────────────────────

let refreshCounter = 0;
setInterval(async () => {
  refreshCounter++;
  // Reload dashboard every 5s
  if (document.getElementById("tab-dashboard").classList.contains("active")) {
    await loadDashboard();
  }
  if (document.getElementById("tab-air").classList.contains("active")) {
    await loadAirDetail();
  }
  if (document.getElementById("tab-water").classList.contains("active")) {
    await loadWaterDetail();
  }
  // Reload alerts every 10s
  if (refreshCounter % 2 === 0 && document.getElementById("tab-alerts").classList.contains("active")) {
    await loadAlerts();
  }
}, 5000);

// ── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const resp = await fetch(`${API}/status`);
    const s = await resp.json();
    showToast(`🟢 System online — ${s.region}`, "good");
  } catch (e) {
    showToast("❌ Cannot reach backend. Make sure start.bat is running.", "bad");
  }
  loadDashboard();
})();


// ════════════════════════════════════════════════════════════════════
//  NEW AI AGENTS — Frontend Logic
// ════════════════════════════════════════════════════════════════════

// ── Shared helper: show loading inside an agent result div ──────────────────
function agentLoading(id, label) {
  const el = document.getElementById(`result-${id}`);
  el.classList.remove("hidden");
  el.innerHTML = `<div class="loading"><span class="spinner"></span>${label}…</div>`;
}

function agentLocation() {
  return document.getElementById("agents-location").value;
}

// ── 1. Pollution Prediction ──────────────────────────────────────────────────
// ── 2. Public Health Risk    (both use generic runAgent dispatcher)
// ── 3. Source Identification
// ── 4. Anomaly Detection
// ── 6. Environmental Risk Scoring

async function runAgent(agentKey) {
  const loc = agentLocation();
  const resultEl = document.getElementById(`result-${agentKey}`);
  const btn = document.querySelector(`#ag-${agentKey} .btn-agent`);

  agentLoading(agentKey, "IBM Granite LLM is processing");
  if (btn) btn.disabled = true;

  try {
    const body = { location: loc };
    if (agentKey === "prediction") {
      body.horizon_hours = parseInt(document.getElementById("pred-horizon").value);
    }

    const resp = await fetch(`${API}/agents/${agentKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    resultEl.classList.remove("hidden");

    if (agentKey === "prediction")          renderPrediction(resultEl, data);
    else if (agentKey === "health-risk")    renderHealthRisk(resultEl, data);
    else if (agentKey === "source-identification") renderSourceId(resultEl, data);
    else if (agentKey === "anomaly-detection") renderAnomalyDetection(resultEl, data);
    else if (agentKey === "risk-scoring")   renderRiskScoring(resultEl, data);

    showToast(`✅ ${data.agent} completed for ${loc}`, "good");
  } catch (e) {
    resultEl.innerHTML = `<span style="color:#ef4444">Error: ${e.message}</span>`;
    showToast("❌ Agent request failed", "bad");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Render: Pollution Prediction ────────────────────────────────────────────
function renderPrediction(el, d) {
  const tColor = d.trajectory === "rising" ? "#ef4444" : d.trajectory === "falling" ? "#22c55e" : "#eab308";
  const tIcon  = d.trajectory === "rising" ? "📈" : d.trajectory === "falling" ? "📉" : "➡️";

  // Forecast table
  let tableRows = d.forecast.map(pt => {
    const cols = ["PM2_5","SO2","NO2","CO"].map(p => {
      if (!pt[p]) return "<td>—</td>";
      const cls = `fc-${pt[p].status}`;
      return `<td class="${cls}">${pt[p].value}</td>`;
    }).join("");
    return `<tr><td style="color:#94a3b8">${pt.hour}</td>${cols}</tr>`;
  }).join("");

  // Trends summary
  const trendRows = Object.entries(d.trends).map(([p, t]) => {
    const arrow = t.slope_per_reading > 0.2 ? "↑" : t.slope_per_reading < -0.2 ? "↓" : "→";
    const c = t.slope_per_reading > 0.2 ? "#ef4444" : t.slope_per_reading < -0.2 ? "#22c55e" : "#eab308";
    return `<div class="ag-metric-box"><div class="lbl">${p}</div><div class="val" style="color:${c};font-size:0.95rem">${t.current} <span style="font-size:0.75rem">${arrow}</span></div></div>`;
  }).join("");

  el.innerHTML = `
    <div class="ag-metrics">
      <div class="ag-metric-box"><div class="lbl">Trajectory</div><div class="val" style="color:${tColor}">${tIcon} ${d.trajectory.toUpperCase()}</div></div>
      <div class="ag-metric-box"><div class="lbl">Horizon</div><div class="val">${d.horizon_hours}h</div></div>
      <div class="ag-metric-box"><div class="lbl">Location</div><div class="val" style="font-size:0.9rem">${d.location}</div></div>
    </div>
    <div style="margin-bottom:0.6rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Current Trends</div>
    <div class="ag-metrics" style="margin-bottom:1rem">${trendRows}</div>
    <div style="margin-bottom:0.6rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Hourly Forecast</div>
    <table class="forecast-table">
      <thead><tr><th>Time</th><th>PM2.5</th><th>SO2</th><th>NO2</th><th>CO</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Prediction</div>
    <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_prediction}</div>`;
}

// ── Render: Public Health Risk ───────────────────────────────────────────────
function renderHealthRisk(el, d) {
  const effectTags = d.health_effects.map(e => `<span class="violation-tag">${e}</span>`).join("");

  el.innerHTML = `
    <div class="ag-metrics">
      <div class="ag-metric-box"><div class="lbl">Risk Score</div><div class="val" style="color:${d.risk_color}">${d.risk_score}/10</div></div>
      <div class="ag-metric-box"><div class="lbl">Risk Level</div><div class="val" style="color:${d.risk_color};font-size:0.85rem">${d.risk_level}</div></div>
      <div class="ag-metric-box"><div class="lbl">Air Risk</div><div class="val">${d.air_risk}/10</div></div>
      <div class="ag-metric-box"><div class="lbl">Water Risk</div><div class="val">${d.water_risk}/10</div></div>
      <div class="ag-metric-box"><div class="lbl">Population</div><div class="val" style="font-size:0.85rem">${d.population.toLocaleString()}</div></div>
      <div class="ag-metric-box"><div class="lbl">Affected Est.</div><div class="val" style="color:#ef4444;font-size:0.85rem">~${d.affected_estimate.toLocaleString()}</div></div>
      <div class="ag-metric-box"><div class="lbl">Sensitive At Risk</div><div class="val" style="color:#eab308;font-size:0.85rem">~${d.sensitive_at_risk.toLocaleString()}</div></div>
    </div>
    <div style="margin-bottom:0.4rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Observed Health Effects</div>
    <div style="margin-bottom:1rem">${effectTags}</div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Health Assessment</div>
    <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_assessment}</div>`;
}

// ── Render: Source Identification ────────────────────────────────────────────
function renderSourceId(el, d) {
  const sourceRows = d.source_analysis.map(s => `
    <div class="source-row">
      <span class="source-badge ${s.likelihood}">${s.likelihood}</span>
      <span style="flex:1;font-weight:600;color:#f1f5f9">${s.name}</span>
      <span style="color:#64748b;font-size:0.75rem">${s.type}</span>
      <span style="color:#94a3b8;font-size:0.75rem">Score: ${s.responsibility_score}</span>
    </div>`).join("");

  const elevatedTags = d.elevated_parameters.map(p =>
    `<span class="violation-tag">${p.parameter}=${p.value} [${p.status.toUpperCase()}]</span>`
  ).join("");

  el.innerHTML = `
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Elevated Parameters</div>
    <div style="margin-bottom:1rem">${elevatedTags || '<span style="color:#22c55e">None — all within limits</span>'}</div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Industrial Source Likelihood</div>
    <div class="source-list">${sourceRows}</div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Source Analysis</div>
    <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_analysis}</div>`;
}

// ── Render: Anomaly Detection ────────────────────────────────────────────────
function renderAnomalyDetection(el, d) {
  const anomalyRows = d.anomalies.length
    ? d.anomalies.map(a => `
      <div class="anomaly-row ${a.severity}">
        <span style="font-weight:700;color:${a.severity === 'critical' ? '#ef4444' : '#eab308'}">${a.parameter}</span>
        <span style="color:#94a3b8">${a.category.toUpperCase()}</span>
        <span>${a.current_value} ${a.unit}</span>
        <span style="color:#64748b">z=${a.z_score > 0 ? '+' : ''}${a.z_score}</span>
        <span style="color:#94a3b8;flex:1">${a.anomaly_type}</span>
        <span style="font-size:0.72rem;color:#475569">${a.description}</span>
      </div>`).join("")
    : `<div style="color:#22c55e;padding:0.5rem">✅ No statistical anomalies detected in recent readings.</div>`;

  el.innerHTML = `
    <div class="ag-metrics">
      <div class="ag-metric-box"><div class="lbl">Total Anomalies</div><div class="val">${d.total_anomalies}</div></div>
      <div class="ag-metric-box"><div class="lbl">Critical</div><div class="val" style="color:#ef4444">${d.critical_count}</div></div>
      <div class="ag-metric-box"><div class="lbl">Warning</div><div class="val" style="color:#eab308">${d.warning_count}</div></div>
    </div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Detected Anomalies</div>
    <div class="anomaly-list">${anomalyRows}</div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Anomaly Analysis</div>
    <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_analysis}</div>`;
}

// ── Render: Environmental Risk Scoring ───────────────────────────────────────
function renderRiskScoring(el, d) {
  const eriPct = Math.min(100, d.eri);
  const eriBarColor = d.eri >= 75 ? "#7f1d1d" : d.eri >= 55 ? "#ef4444" : d.eri >= 35 ? "#eab308" : "#22c55e";

  const dimRows = d.dimensions.map(dim => {
    const pct = Math.min(100, dim.score);
    const c = dim.score >= 75 ? "#ef4444" : dim.score >= 50 ? "#eab308" : "#22c55e";
    return `
      <div class="dim-row">
        <span class="dim-name">${dim.name}</span>
        <div class="dim-bar-bg"><div class="dim-bar" style="width:${pct}%;background:${c}"></div></div>
        <span class="dim-val">${dim.score}</span>
        <span class="dim-weight">${dim.weight}</span>
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="ag-metrics">
      <div class="ag-metric-box"><div class="lbl">ERI Score</div><div class="val" style="color:${eriBarColor}">${d.eri}/100</div></div>
      <div class="ag-metric-box"><div class="lbl">Risk Level</div><div class="val" style="color:${eriBarColor};font-size:0.85rem">${d.eri_level}</div></div>
      <div class="ag-metric-box"><div class="lbl">Compliance Deficit</div><div class="val" style="color:#ef4444">${d.compliance_violation_pct}%</div></div>
    </div>
    <div class="eri-bar-wrap">
      <div style="font-size:0.75rem;color:#64748b;margin-bottom:0.35rem;text-transform:uppercase">Environmental Risk Index</div>
      <div class="eri-bar-bg"><div class="eri-bar" style="width:${eriPct}%;background:${eriBarColor}"></div></div>
      <div class="eri-label">${d.eri}/100 — ${d.eri_level}</div>
    </div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Risk Dimensions</div>
    <div style="margin-bottom:1rem">${dimRows}</div>
    <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Risk Assessment</div>
    <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_scoring}</div>`;
}

// ── 5. Citizen Complaints ────────────────────────────────────────────────────
async function submitComplaint() {
  const loc  = agentLocation();
  const text = document.getElementById("complaint-text").value.trim();
  const type = document.getElementById("complaint-type").value;

  if (!text) {
    showToast("⚠️ Please describe your complaint before submitting.", "bad");
    return;
  }

  const resultEl = document.getElementById("result-complaints");
  agentLoading("complaints", "Analyzing complaint with IBM Granite LLM");

  try {
    const resp = await fetch(`${API}/agents/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: loc, complaint: text, type }),
    });
    const d = await resp.json();
    resultEl.classList.remove("hidden");

    const corrTags = (d.sensor_corroboration || []).map(c =>
      `<span class="corr-tag">${c}</span>`).join("") || '<span style="color:#64748b">No direct sensor corroboration</span>';

    resultEl.innerHTML = `
      <div class="ag-metrics">
        <div class="ag-metric-box"><div class="lbl">Complaint ID</div><div class="val" style="font-size:0.8rem;color:#38bdf8">${d.complaint_id}</div></div>
        <div class="ag-metric-box"><div class="lbl">Type</div><div class="val" style="font-size:0.85rem">${d.type.toUpperCase()}</div></div>
        <div class="ag-metric-box"><div class="lbl">Location</div><div class="val" style="font-size:0.85rem">${d.location}</div></div>
      </div>
      <div style="margin-bottom:0.4rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">Sensor Corroboration</div>
      <div style="margin-bottom:1rem">${corrTags}</div>
      <div style="margin-bottom:0.5rem;font-size:0.75rem;color:#64748b;text-transform:uppercase">🤖 IBM Granite Analysis</div>
      <div style="white-space:pre-wrap;color:#cbd5e1">${d.ai_analysis}</div>`;

    document.getElementById("complaint-text").value = "";
    showToast(`✅ Complaint ${d.complaint_id} submitted and analyzed`, "good");
  } catch (e) {
    resultEl.innerHTML = `<span style="color:#ef4444">Error: ${e.message}</span>`;
  }
}

async function loadComplaints() {
  const loc = agentLocation();
  const listEl = document.getElementById("complaints-list-panel");
  listEl.classList.remove("hidden");
  listEl.innerHTML = `<div class="loading"><span class="spinner"></span>Loading complaints…</div>`;

  try {
    const resp = await fetch(`${API}/agents/complaints/list?location=${loc}`);
    const complaints = await resp.json();

    if (!complaints.length) {
      listEl.innerHTML = `<div style="color:#64748b;padding:0.5rem;font-size:0.82rem">No complaints submitted yet for ${loc}.</div>`;
      return;
    }

    listEl.innerHTML = `<div style="font-size:0.75rem;color:#64748b;text-transform:uppercase;margin-bottom:0.5rem">Complaint History — ${loc}</div>` +
      complaints.map(c => `
        <div class="cmp-item">
          <div class="cmp-header">
            <span class="cmp-id">${c.id}</span>
            <span class="cmp-time">${new Date(c.timestamp).toLocaleString()}</span>
          </div>
          <div style="color:#eab308;font-size:0.72rem;text-transform:uppercase;margin-bottom:0.25rem">${c.type}</div>
          <div class="cmp-text">${c.text}</div>
          ${(c.sensor_corroboration || []).length ? `
            <div class="cmp-corroboration">
              ${c.sensor_corroboration.map(t => `<span class="corr-tag">${t}</span>`).join("")}
            </div>` : ""}
        </div>`).join("");
  } catch (e) {
    listEl.innerHTML = `<span style="color:#ef4444">Error loading complaints.</span>`;
  }
}
