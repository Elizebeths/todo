// Update this release key whenever any cached application resource changes.
const CACHE = "daylight-1.7.0-r1";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/theme.js",
  "/board-model.js",
  "/backup.js",
  "/deadline-model.js",
  "/focus-timer.js",
  "/task-tools.js",
  "/bulk-tools.js",
  "/recurrence.js",
  "/storage.js",
  "/focus-session.js",
  "/workspace-tools.js",
  "/task-commands.js",
  "/review-model.js",
  "/detail-view.js",
  "/calendar-view.js",
  "/task-view.js",
  "/card-view.js",
  "/manifest.webmanifest",
  "/icon.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  // Deliberately wait for every old client to close; never replace a live editor.
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("daylight-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !ASSETS.includes(url.pathname)
  )
    return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) =>
          (await cache.match(event.request, { ignoreSearch: true })) ||
          fetch(event.request),
      ),
  );
});
