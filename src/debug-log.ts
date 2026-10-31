export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
const KEY = 'gancube.debugLog.v1';
const LIMIT = 500;
export function errorDetails(error: unknown): unknown {
  // DOMException and cross-realm errors need not inherit this realm's Error.
  if (error && typeof error === 'object' && 'message' in error) {
    const value = error as { name?: unknown; message: unknown; stack?: unknown };
    return { name: String(value.name ?? 'Error'), message: String(value.message), stack: value.stack === undefined ? undefined : String(value.stack) };
  }
  return error;
}
/** Bounded, tab-local diagnostics. Batch storage writes to avoid slowing Bluetooth events. */
export function createDebugLog(onChange: () => void) {
  let lines: string[] = [];
  let pending: ReturnType<typeof setTimeout> | undefined;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) lines = saved.filter(line => typeof line === 'string').slice(-LIMIT);
  } catch { /* Logging must work even when storage is unavailable. */ }
  function flush() {
    clearTimeout(pending);
    pending = undefined;
    try { sessionStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* Keep memory log. */ }
  }
  return {
    add(level: LogLevel, message: string, details?: unknown) {
      let suffix = '';
      if (details !== undefined) {
        try { suffix = ` ${JSON.stringify(details)}`; } catch { suffix = ' [unserializable details]'; }
      }
      lines.push(`${new Date().toISOString()} [${level}] ${message}${suffix}`.slice(0, 5000));
      if (lines.length > LIMIT) lines.splice(0, lines.length - LIMIT);
      if (!pending) pending = setTimeout(flush, 250);
      onChange();
    },
    text: () => lines.join('\n'),
    clear() { lines = []; flush(); onChange(); },
    flush,
  };
}
