import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./theme.js", import.meta.url), "utf8");
function boot({ stored = null, blockRead = false, blockWrite = false } = {}) {
  const writes = [],
    listeners = {},
    events = [];
  const root = { dataset: {} },
    meta = {
      setAttribute(name, value) {
        this[name] = value;
      },
    };
  const window = {
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    dispatchEvent(event) {
      events.push(event.type);
    },
  };
  runInNewContext(source, {
    window,
    document: {
      documentElement: root,
      querySelector() {
        return meta;
      },
    },
    localStorage: {
      getItem() {
        if (blockRead) throw Error("blocked");
        return stored;
      },
      setItem(...entry) {
        if (blockWrite) throw Error("full");
        writes.push(entry);
      },
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  return { theme: window.daylightTheme, root, meta, writes, listeners, events };
}

test("first paint restores a valid preference and safely defaults for missing, invalid or unreadable storage", () => {
  for (const stored of [
    null,
    "leaf",
    "iris",
    "night",
    "unknown",
    "__proto__",
  ]) {
    const app = boot({ stored });
    const expected = ["leaf", "iris", "night"].includes(stored)
      ? stored
      : "leaf";
    assert.equal(app.root.dataset.theme, expected);
    assert.equal(app.theme.current, expected);
    assert.equal(app.writes.length, 0);
  }
  assert.equal(boot({ blockRead: true }).theme.current, "leaf");
});

test("switching persists only the appearance preference and updates browser chrome", () => {
  const app = boot();
  assert.equal(app.theme.apply("night", true), true);
  assert.equal(app.root.dataset.theme, "night");
  assert.equal(app.meta.content, "#151e28");
  assert.deepEqual(app.writes, [["daylight-theme", "night"]]);
  assert.equal(boot({ stored: app.writes[0][1] }).theme.current, "night");
});

test("a failed save still applies a usable theme and reports that it could not persist", () => {
  const app = boot({ blockRead: true, blockWrite: true });
  assert.equal(app.theme.apply("iris", true), false);
  assert.equal(app.root.dataset.theme, "iris");
  assert.equal(app.theme.current, "iris");
  assert.equal(app.writes.length, 0);
});

test("other tabs update appearance without writing back or responding to task data changes", () => {
  const app = boot();
  app.listeners.storage({ key: "daylight-theme", newValue: "night" });
  assert.equal(app.theme.current, "night");
  app.listeners.storage({ key: "daylight-todo", newValue: "unrelated" });
  assert.equal(app.theme.current, "night");
  app.listeners.storage({ key: "daylight-theme", newValue: null });
  assert.equal(app.theme.current, "leaf");
  app.listeners.storage({ key: null, newValue: null });
  assert.equal(app.theme.current, "leaf");
  assert.equal(app.writes.length, 0);
  assert.deepEqual(app.events, [
    "daylight-theme-change",
    "daylight-theme-change",
    "daylight-theme-change",
  ]);
});
