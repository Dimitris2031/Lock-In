const STORAGE_KEYS = {
  sessions: "lockin_sessions_v1",
  whitelist: "lockin_whitelist_v1",
  activeSession: "lockin_active_session_v1",
};

const overlay = document.getElementById("overlay");
const overlayTimer = document.getElementById("overlay-timer");
const overlayTag = document.getElementById("overlay-tag");
const overlayNote = document.getElementById("overlay-note");
const abortButton = document.getElementById("abort-session");
const alarm = document.getElementById("alarm");

const historyList = document.getElementById("history-list");
const historyTemplate = document.getElementById("history-item-template");
const clearHistoryButton = document.getElementById("clear-history");
const whitelistTextarea = document.getElementById("whitelist");
const whitelistStatus = document.getElementById("whitelist-status");
const saveWhitelistButton = document.getElementById("save-whitelist");

const todayTotalEl = document.getElementById("today-total");
const weekTotalEl = document.getElementById("week-total");
const streakEl = document.getElementById("streak-count");
const weeklyChart = document.getElementById("weekly-chart");

const customForm = document.getElementById("custom-session");
const customMinutesInput = document.getElementById("custom-minutes");
const sessionTagInput = document.getElementById("session-tag");
const whitelistNoteInput = document.getElementById("whitelist-note");

let countdownInterval = null;
let activeSession = null;

const minutesToMs = (minutes) => minutes * 60 * 1000;

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Failed to parse sessions", err);
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
}

function loadWhitelist() {
  return localStorage.getItem(STORAGE_KEYS.whitelist) ?? "";
}

function saveWhitelist(value) {
  localStorage.setItem(STORAGE_KEYS.whitelist, value);
}

function loadActiveSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeSession);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveActiveSession(session) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEYS.activeSession);
  } else {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(session));
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHistoryDuration(ms) {
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function showOverlay(session) {
  overlay.classList.remove("hidden");
  overlayTag.textContent = session.tag ? `Focus: ${session.tag}` : "Locking in";
  overlayNote.textContent = session.note || "Stay on the whitelist only.";
  updateOverlayTimer();
  requestFullscreen();
}

function hideOverlay() {
  overlay.classList.add("hidden");
  exitFullscreen();
}

function requestFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {
      console.warn("Fullscreen request denied by the browser.");
    });
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
}

function updateOverlayTimer() {
  if (!activeSession) return;
  const now = Date.now();
  const remaining = activeSession.endsAt - now;
  if (remaining <= 0) {
    overlayTimer.textContent = "00:00";
    completeSession();
    return;
  }
  overlayTimer.textContent = formatDuration(remaining);
}

function startTimerLoop() {
  stopTimerLoop();
  countdownInterval = window.setInterval(updateOverlayTimer, 1000);
  updateOverlayTimer();
}

function stopTimerLoop() {
  if (countdownInterval) {
    window.clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function startSession(minutes, tag, note) {
  if (activeSession && activeSession.endsAt > Date.now()) {
    alert("A focus session is already running. Abort it first if you need to restart.");
    return;
  }
  const duration = minutesToMs(minutes);
  const now = Date.now();
  activeSession = {
    startedAt: now,
    endsAt: now + duration,
    tag: tag?.trim() || "",
    note: note?.trim() || "",
  };
  saveActiveSession(activeSession);
  showOverlay(activeSession);
  startTimerLoop();
}

function abortSession() {
  stopTimerLoop();
  activeSession = null;
  saveActiveSession(null);
  hideOverlay();
}

function completeSession() {
  stopTimerLoop();
  const session = activeSession;
  activeSession = null;
  saveActiveSession(null);
  if (!session) {
    hideOverlay();
    return;
  }

  hideOverlay();
  alarm.currentTime = 0;
  alarm.play().catch(() => {});

  const sessions = loadSessions();
  sessions.push({
    startedAt: session.startedAt,
    endedAt: Date.now(),
    tag: session.tag,
    minutes: Math.round((session.endsAt - session.startedAt) / 60000),
  });
  saveSessions(sessions);
  refreshUI();
}

function refreshUI() {
  renderHistory();
  updateStats();
  drawWeeklyChart();
}

function renderHistory() {
  const sessions = loadSessions();
  historyList.innerHTML = "";
  const recent = sessions.slice(-12).reverse();
  for (const session of recent) {
    const clone = historyTemplate.content.firstElementChild.cloneNode(true);
    clone.querySelector(".history-time").textContent = formatDateTime(session.startedAt);
    clone.querySelector(".history-duration").textContent = formatHistoryDuration(session.minutes * 60000);
    clone.querySelector(".history-tag").textContent = session.tag ? `#${session.tag}` : "";
    historyList.appendChild(clone);
  }
  if (!recent.length) {
    const empty = document.createElement("li");
    empty.textContent = "No sessions yet. Start one to build your streak.";
    historyList.appendChild(empty);
  }
}

function updateStats() {
  const sessions = loadSessions();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = new Date(now);
  const day = (now.getDay() + 6) % 7; // Monday as first day
  startOfWeek.setDate(now.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfWeekMs = startOfWeek.getTime();

  let todayTotal = 0;
  let weekTotal = 0;

  for (const session of sessions) {
    const durationMs = session.minutes * 60000;
    if (session.startedAt >= startOfToday) {
      todayTotal += durationMs;
    }
    if (session.startedAt >= startOfWeekMs) {
      weekTotal += durationMs;
    }
  }

  todayTotalEl.textContent = `${Math.round(todayTotal / 60000)}m`;
  weekTotalEl.textContent = `${Math.round(weekTotal / 60000)}m`;
  streakEl.textContent = `${calculateStreak(sessions)} days`;
}

function calculateStreak(sessions) {
  if (!sessions.length) return 0;
  const daySet = new Set(
    sessions.map((session) => new Date(session.startedAt).toISOString().slice(0, 10))
  );

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  let streak = 0;
  let currentKey = cursor.toISOString().slice(0, 10);

  if (daySet.has(currentKey)) {
    streak = 1;
  } else {
    cursor.setDate(cursor.getDate() - 1);
    currentKey = cursor.toISOString().slice(0, 10);
    if (!daySet.has(currentKey)) {
      return 0;
    }
    streak = 1;
  }

  while (true) {
    cursor.setDate(cursor.getDate() - 1);
    currentKey = cursor.toISOString().slice(0, 10);
    if (daySet.has(currentKey)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function drawWeeklyChart() {
  if (!weeklyChart) return;
  const ctx = weeklyChart.getContext("2d");
  const sessions = loadSessions();
  const now = new Date();

  const days = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - idx));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const totals = days.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const start = day.getTime();
    const end = nextDay.getTime();
    return sessions
      .filter((session) => session.startedAt >= start && session.startedAt < end)
      .reduce((acc, session) => acc + session.minutes, 0);
  });

  ctx.clearRect(0, 0, weeklyChart.width, weeklyChart.height);
  const barWidth = weeklyChart.width / (totals.length * 1.6);
  const maxMinutes = Math.max(60, ...totals, 1);
  const chartHeight = weeklyChart.height - 30;

  totals.forEach((minutes, index) => {
    const barHeight = (minutes / maxMinutes) * chartHeight;
    const x = (index + 0.5) * (weeklyChart.width / totals.length) - barWidth / 2;
    const y = weeklyChart.height - barHeight - 20;

    ctx.fillStyle = "rgba(56, 189, 248, 0.7)";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${minutes}m`, x + barWidth / 2, y - 4);

    const label = days[index].toLocaleDateString(undefined, { weekday: "short" });
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.fillText(label, x + barWidth / 2, weeklyChart.height - 5);
  });
}

function attachEventListeners() {
  document.querySelectorAll(".preset").forEach((button) => {
    button.addEventListener("click", () => {
      const minutes = Number(button.dataset.minutes);
      startSession(minutes, sessionTagInput.value, whitelistNoteInput.value);
    });
  });

  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const minutes = Number(customMinutesInput.value);
    if (!minutes || minutes <= 0) {
      customMinutesInput.focus();
      customMinutesInput.classList.add("error");
      setTimeout(() => customMinutesInput.classList.remove("error"), 700);
      return;
    }
    startSession(minutes, sessionTagInput.value, whitelistNoteInput.value);
    customForm.reset();
  });

  abortButton.addEventListener("click", () => {
    if (confirm("Abort this focus session?")) {
      abortSession();
    }
  });

  clearHistoryButton.addEventListener("click", () => {
    if (confirm("Clear all saved session history?")) {
      saveSessions([]);
      refreshUI();
    }
  });

  saveWhitelistButton.addEventListener("click", () => {
    saveWhitelist(whitelistTextarea.value);
    whitelistStatus.textContent = "Whitelist saved.";
    setTimeout(() => {
      whitelistStatus.textContent = "";
    }, 2000);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && activeSession) {
      requestFullscreen();
    }
  });
}

function resumeActiveSession() {
  const session = loadActiveSession();
  if (!session) return;
  if (session.endsAt <= Date.now()) {
    activeSession = session;
    completeSession();
    return;
  }
  activeSession = session;
  showOverlay(session);
  startTimerLoop();
}

function bootstrap() {
  whitelistTextarea.value = loadWhitelist();
  attachEventListeners();
  refreshUI();
  resumeActiveSession();
}

bootstrap();
