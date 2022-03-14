export function enableTimestampLogger() {
  const _log = console.log;
  const _warn = console.warn;
  const _error = console.error;

  console.log = function(...params: unknown[]) { _log(`[${new Date().toISOString()}]`, ...params)
  };
  console.warn = function(...params: unknown[]) { _warn(`[${new Date().toISOString()}]`, ...params)
  };
  console.error = function(...params: unknown[]) { _error(`[${new Date().toISOString()}]`, ...params)
  };
}
