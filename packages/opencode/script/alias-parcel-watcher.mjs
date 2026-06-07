// No-op stub for @parcel/watcher/wrapper.
// esbuild aliases @parcel/watcher/wrapper → this file so the node-web bundle
// doesn't pull in the native @parcel/watcher binding (which requires native compilation).
// The `binding` parameter is intentionally ignored — it receives the native
// binding path, but we don't need file-watching in headless/server mode.
export function createWrapper(binding) {
  return {
    subscribe() { return Promise.resolve({ unsubscribe() {} }) },
    getEventsSince() { return Promise.resolve([]) },
  }
}
