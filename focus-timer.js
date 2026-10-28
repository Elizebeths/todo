// Callbacks only repaint the UI; elapsed wall time determines the countdown.
export function createFocusTimer(durationMs = 25 * 60 * 1000, now = Date.now) {
  let remainingMs = durationMs;
  let deadline = null;

  function read() {
    let completed = false;
    if (deadline !== null) {
      remainingMs = Math.max(0, Math.min(durationMs, deadline - now()));
      if (remainingMs === 0) {
        deadline = null;
        completed = true;
      }
    }
    return {
      seconds: Math.ceil(remainingMs / 1000),
      running: deadline !== null,
      completed,
    };
  }

  return {
    read,
    start() {
      if (deadline === null) {
        if (remainingMs === 0) remainingMs = durationMs;
        deadline = now() + remainingMs;
      }
      return read();
    },
    pause() {
      const state = read();
      deadline = null;
      return { ...state, running: false };
    },
    reset() {
      deadline = null;
      remainingMs = durationMs;
      return read();
    },
  };
}
