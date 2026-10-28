export function summarize(data, from, through) {
  const events = (data.events || []).filter(
    (e) => e.date >= from && e.date <= through,
  );
  const sessions = (data.sessions || []).filter(
    (s) =>
      s.date >= from &&
      s.date <= through &&
      s.outcome !== "cancelled" &&
      s.kind !== "break",
  );
  return {
    completed: events.length,
    minutes: Math.floor(sessions.reduce((n, s) => n + s.duration, 0) / 60000),
    overdue: events.filter((e) => e.overdue).length,
  };
}
