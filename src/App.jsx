import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEYS = {
  sessions: 'lockin_sessions_v2',
  whitelist: 'lockin_whitelist_v2',
  activeSession: 'lockin_active_session_v2',
};

const PRESET_MINUTES = [25, 50, 90];

const minutesToMs = (minutes) => minutes * 60 * 1000;
const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatHistoryDuration = (minutes) => `${minutes} min`;

const formatHistoryTime = (timestamp) =>
  new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

const loadJson = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse localStorage key ${key}`, error);
    return fallback;
  }
};

const loadString = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

const calculateStreak = (sessions) => {
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
};

const deriveStats = (sessions) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const startOfWeek = new Date(now);
  const day = (now.getDay() + 6) % 7; // Monday first
  startOfWeek.setDate(now.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfWeekMs = startOfWeek.getTime();

  let todayTotal = 0;
  let weekTotal = 0;

  sessions.forEach((session) => {
    const durationMs = session.minutes * 60000;
    if (session.startedAt >= startOfToday) {
      todayTotal += durationMs;
    }
    if (session.startedAt >= startOfWeekMs) {
      weekTotal += durationMs;
    }
  });

  return {
    todayMinutes: Math.round(todayTotal / 60000),
    weekMinutes: Math.round(weekTotal / 60000),
    streak: calculateStreak(sessions),
  };
};

const weeklyBuckets = (sessions) => {
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

  return { days, totals };
};

function App() {
  const alarmRef = useRef(null);
  const canvasRef = useRef(null);

  const [sessions, setSessions] = useState(() => loadJson(STORAGE_KEYS.sessions, []));
  const [whitelist, setWhitelist] = useState(() => loadString(STORAGE_KEYS.whitelist, ''));
  const [whitelistStatus, setWhitelistStatus] = useState('');
  const [activeSession, setActiveSession] = useState(() => loadJson(STORAGE_KEYS.activeSession, null));
  const [now, setNow] = useState(Date.now());
  const [customMinutes, setCustomMinutes] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.whitelist, whitelist);
  }, [whitelist]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeSession) {
      window.localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(activeSession));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.activeSession);
    }
  }, [activeSession]);

  const completeSession = useCallback(() => {
    setActiveSession((session) => {
      if (!session) return null;
      const completedSession = {
        startedAt: session.startedAt,
        endedAt: Date.now(),
        tag: session.tag,
        minutes: Math.round((session.endsAt - session.startedAt) / 60000),
      };
      setSessions((prev) => [...prev, completedSession]);
      if (alarmRef.current) {
        alarmRef.current.currentTime = 0;
        alarmRef.current.play().catch(() => {});
      }
      return null;
    });
  }, []);

  const abortSession = useCallback(() => {
    if (!activeSession) return;
    if (window.confirm('Abort this focus session?')) {
      setActiveSession(null);
    }
  }, [activeSession]);

  const startSession = useCallback((minutes, tag, note) => {
    let started = false;
    const trimmedTag = tag.trim();
    const trimmedNote = note.trim();
    setActiveSession((current) => {
      if (current && current.endsAt > Date.now()) {
        window.alert('A focus session is already running. Abort it first to restart.');
        return current;
      }
      const startedAt = Date.now();
      started = true;
      return {
        startedAt,
        endsAt: startedAt + minutesToMs(minutes),
        tag: trimmedTag,
        note: trimmedNote,
      };
    });
    return started;
  }, []);

  // Resume an expired session on mount if needed.
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.endsAt <= Date.now()) {
      completeSession();
    }
  }, [activeSession, completeSession]);

  // Timer loop when a session is active.
  useEffect(() => {
    if (!activeSession) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSession]);

  const remainingMs = useMemo(() => {
    if (!activeSession) return 0;
    return Math.max(0, activeSession.endsAt - now);
  }, [activeSession, now]);

  useEffect(() => {
    if (activeSession && remainingMs === 0) {
      completeSession();
    }
  }, [activeSession, remainingMs, completeSession]);

  useEffect(() => {
    const el = document.documentElement;
    if (activeSession) {
      el.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }, [activeSession]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && activeSession) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [activeSession]);

  useEffect(() => {
    if (!whitelistStatus) return;
    const id = window.setTimeout(() => setWhitelistStatus(''), 2000);
    return () => window.clearTimeout(id);
  }, [whitelistStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.clientHeight * devicePixelRatio;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { days, totals } = weeklyBuckets(sessions);
    if (!totals.length) return;

    const barWidth = canvas.width / (totals.length * 1.6);
    const maxMinutes = Math.max(60, ...totals, 1);
    const chartHeight = canvas.height - 30 * devicePixelRatio;

    totals.forEach((minutes, index) => {
      const barHeight = (minutes / maxMinutes) * chartHeight;
      const slotWidth = canvas.width / totals.length;
      const x = (index + 0.5) * slotWidth - barWidth / 2;
      const y = canvas.height - barHeight - 20 * devicePixelRatio;

      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = `${12 * devicePixelRatio}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${minutes}m`, x + barWidth / 2, y - 4 * devicePixelRatio);

      const label = days[index].toLocaleDateString(undefined, { weekday: 'short' });
      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.fillText(label, x + barWidth / 2, canvas.height - 5 * devicePixelRatio);
    });
  }, [sessions]);

  const stats = useMemo(() => deriveStats(sessions), [sessions]);
  const recentSessions = useMemo(
    () => [...sessions].slice(-12).reverse(),
    [sessions]
  );

  return (
    <>
      <header className="app-header">
        <h1>Lock-In Focus</h1>
        <p className="tagline">Full-screen study timer that locks distractions until you finish.</p>
      </header>

      <main className="app-layout">
        <section className="timer-controls card">
          <h2>Start a focus block</h2>
          <div className="preset-buttons">
            {PRESET_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="preset"
                disabled={Boolean(activeSession)}
                onClick={() => {
                  if (startSession(minutes, customTag, customNote)) {
                    setCustomMinutes('');
                    setCustomTag('');
                    setCustomNote('');
                  }
                }}
              >
                {minutes} min
              </button>
            ))}
          </div>

          <SessionForm
            minutes={customMinutes}
            tag={customTag}
            note={customNote}
            onMinutesChange={setCustomMinutes}
            onTagChange={setCustomTag}
            onNoteChange={setCustomNote}
            onStart={(mins, tag, note) => {
              if (startSession(mins, tag, note)) {
                setCustomMinutes('');
                setCustomTag('');
                setCustomNote('');
              }
            }}
            active={Boolean(activeSession)}
          />

          <a
            className="playlist"
            href="https://www.youtube.com/watch?v=4xDzrJKXOOY"
            target="_blank"
            rel="noopener"
          >
            🎧 Open focus playlist
          </a>
        </section>

        <section className="stats card">
          <h2>Progress</h2>
          <dl>
            <div>
              <dt>Today</dt>
              <dd>{stats.todayMinutes}m</dd>
            </div>
            <div>
              <dt>This week</dt>
              <dd>{stats.weekMinutes}m</dd>
            </div>
            <div>
              <dt>Current streak</dt>
              <dd>{stats.streak} days</dd>
            </div>
          </dl>
          <canvas
            ref={canvasRef}
            id="weekly-chart"
            className="weekly-chart"
            width={320}
            height={160}
            aria-label="Weekly focus chart"
          />
        </section>

        <section className="history card">
          <h2>Session history</h2>
          <p className="history-hint">Most recent sessions (stored locally in your browser).</p>
          <ul className="history-list" id="history-list">
            {recentSessions.length === 0 ? (
              <li>No sessions yet. Start one to build your streak.</li>
            ) : (
              recentSessions.map((session, index) => (
                <li key={`${session.startedAt}-${index}`}>
                  <div className="history-item">
                    <span className="history-time">{formatHistoryTime(session.startedAt)}</span>
                    <span className="history-duration">{formatHistoryDuration(session.minutes)}</span>
                    <span className="history-tag">{session.tag ? `#${session.tag}` : ''}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm('Clear all saved session history?')) {
                setSessions([]);
              }
            }}
          >
            Clear history
          </button>
        </section>

        <section className="whitelist card">
          <h2>Allowed tools reminder</h2>
          <textarea
            value={whitelist}
            rows={5}
            placeholder="List the apps or websites you're allowed to use while locked in."
            onChange={(event) => setWhitelist(event.target.value)}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setWhitelistStatus('Whitelist saved.');
            }}
          >
            Save whitelist
          </button>
          <p className="whitelist-status" role="status" aria-live="polite">
            {whitelistStatus}
          </p>
        </section>
      </main>

      <div className={`overlay ${activeSession ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-live="polite">
        <div className="overlay-content">
          <h2 id="overlay-timer">{formatCountdown(remainingMs)}</h2>
          <p id="overlay-tag">{activeSession?.tag ? `Focus: ${activeSession.tag}` : 'Locking in'}</p>
          <p id="overlay-note">{activeSession?.note || 'Stay on the whitelist only.'}</p>
          <button type="button" id="abort-session" className="secondary" onClick={abortSession}>
            Abort session
          </button>
        </div>
      </div>

      <audio
        ref={alarmRef}
        src="https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg"
        preload="auto"
      />
    </>
  );
}

function SessionForm({
  minutes,
  tag,
  note,
  onMinutesChange,
  onTagChange,
  onNoteChange,
  onStart,
  active,
}) {
  const [highlightError, setHighlightError] = useState(false);

  useEffect(() => {
    if (!highlightError) return;
    const id = window.setTimeout(() => setHighlightError(false), 700);
    return () => window.clearTimeout(id);
  }, [highlightError]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const parsed = Number(minutes);
    if (!parsed || parsed <= 0) {
      setHighlightError(true);
      return;
    }
    onStart(parsed, tag, note);
  };

  return (
    <form className="custom-session" onSubmit={handleSubmit}>
      <label>
        Custom length (minutes)
        <input
          type="number"
          min="1"
          max="360"
          value={minutes}
          onChange={(event) => onMinutesChange(event.target.value)}
          disabled={active}
          className={highlightError ? 'error' : ''}
        />
      </label>
      <label>
        Tag (optional)
        <input
          type="text"
          maxLength={32}
          placeholder="e.g. Deep work"
          value={tag}
          onChange={(event) => onTagChange(event.target.value)}
          disabled={active}
        />
      </label>
      <label>
        Whitelist note (remind yourself what is allowed)
        <input
          type="text"
          maxLength={120}
          placeholder="Docs, Figma, Calculator"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          disabled={active}
        />
      </label>
      <button type="submit" className="primary" disabled={active}>
        Start focus
      </button>
    </form>
  );
}

export default App;
