export function startSession(
  task,
  minutes = 25,
  breakMinutes = 5,
  now = Date.now(),
) {
  const duration = Math.max(1, Math.min(180, minutes)) * 60000;
  return {
    id: crypto.randomUUID(),
    taskId: task?.id || "",
    title: task?.title || "自由专注",
    duration,
    remaining: duration,
    deadline: now + duration,
    startedAt: now,
    breakMinutes,
    paused: false,
  };
}
export function sessionState(session, now = Date.now()) {
  if (!session) return { seconds: 25 * 60, running: false };
  const remaining = session.paused
    ? session.remaining
    : Math.max(0, Math.min(session.remaining, session.deadline - now));
  return {
    seconds: Math.ceil(remaining / 1000),
    running: !session.paused && remaining > 0,
    completed: !session.paused && remaining === 0,
    remaining,
  };
}
export function pauseSession(session, now = Date.now()) {
  session.remaining = sessionState(session, now).remaining;
  session.paused = true;
}
export function resumeSession(session, now = Date.now()) {
  session.deadline = now + session.remaining;
  session.paused = false;
}
export function finishSession(data, outcome, date, now = Date.now()) {
  const s = data.focus;
  if (!s) return false;
  data.sessions ||= [];
  if (!data.sessions.some((row) => row.id === s.id))
    data.sessions.push({
      id: s.id,
      taskId: s.taskId,
      title: s.title,
      date,
      outcome,
      kind: s.isBreak ? "break" : "focus",
      duration:
        outcome === "completed"
          ? s.duration
          : s.duration - sessionState(s, now).remaining,
      endedAt: now,
    });
  data.focus = null;
  return true;
}
