/**
 * Cross-runtime Win32 console API — Node.js stub.
 * These functions are no-ops on Node.js (non-Windows platforms don't need them;
 * Windows FFI can be added later via koffi or node-ffi-napi).
 */

export function win32DisableProcessedInput() {
  // No-op on Node.js — Windows FFI not yet implemented
}

export function win32FlushInputBuffer() {
  // No-op on Node.js — Windows FFI not yet implemented
}

export function win32InstallCtrlCGuard() {
  // No-op on Node.js — Windows FFI not yet implemented
  return undefined
}
