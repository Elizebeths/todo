import { parseBackup } from "./backup.js";
export const DATA_KEY = "daylight-v1";
export const APP_VERSION = "1.7.0";
export const SCHEMA_VERSION = 2;
export function envelope(data, metadata = {}) {
  return {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    revision: 0,
    source: "export",
    ...metadata,
  };
}
export function checkpoint(storage, source, reason) {
  if (source === null) return;
  const key = "daylight-recovery";
  const points = JSON.parse(storage.getItem(key) || "[]");
  points.unshift({ at: Date.now(), reason, source });
  while (points.length > 5 || JSON.stringify(points).length > 1000000) {
    if (points.length === 1)
      throw new Error("恢复点超过容量上限，请先导出当前数据");
    points.pop();
  }
  storage.setItem(key, JSON.stringify(points));
}
// All writers, including backup replacement, use the same origin-wide lock.
export function createRepository({
  storage,
  locks,
  source = crypto.randomUUID(),
  onExternal = () => {},
}) {
  let base = storage.getItem(DATA_KEY),
    chain = Promise.resolve(),
    pending = 0,
    generation = 0;
  const read = () => {
    const raw = storage.getItem(DATA_KEY);
    return raw === null ? null : parseBackup(raw);
  };
  function write(
    data,
    { replace = false, expected = base, reason = "导入替换" } = {},
  ) {
    if (replace) generation++;
    const epoch = generation;
    const copy = structuredClone(data);
    pending++;
    const ensureCurrent = () => {
      if (epoch !== generation) {
        const error = new Error("已放弃旧的待保存版本");
        error.code = "STALE_WRITE";
        throw error;
      }
    };
    const work = async () => {
      ensureCurrent();
      if (!locks)
        throw new Error(
          "此浏览器不支持安全写入锁，已进入只读模式；请导出修改并在新版浏览器恢复",
        );
      return locks.request("daylight-write", async () => {
        ensureCurrent();
        const current = storage.getItem(DATA_KEY);
        if (current !== (replace ? expected : base))
          throw new Error("其他页面已更新数据，请先处理冲突；本页修改已保留");
        let previous = null;
        if (current !== null) {
          try {
            previous = parseBackup(current);
          } catch (error) {
            if (!replace || error.message.includes("不支持")) throw error;
            // Explicit restore can replace corrupt bytes only after checkpointing them.
          }
        }
        if (
          replace ||
          (previous && JSON.parse(current).schemaVersion !== SCHEMA_VERSION)
        )
          checkpoint(storage, current, replace ? reason : "数据升级");
        const next = envelope(copy, {
          source,
          revision: (previous?.revision || 0) + 1,
        });
        const raw = JSON.stringify(parseBackup(JSON.stringify(next)));
        storage.setItem(DATA_KEY, raw);
        base = raw;
        return next;
      });
    };
    const result = chain.then(work);
    chain = result
      .catch(() => {})
      .finally(() => {
        pending--;
      });
    return result;
  }
  return {
    read,
    write,
    get pending() {
      return pending;
    },
    get raw() {
      return base;
    },
    accept(raw) {
      if (raw !== null) parseBackup(raw);
      generation++;
      base = raw;
    },
    external(raw) {
      if (raw !== base) onExternal(raw);
    },
  };
}
