import { isQuietMode, isVerboseMode } from './cli-mode.js';

/**
 * Keep dependency console dumps out of CLI data and avoid exposing SDK objects.
 * Only executable entry points install this guard; library imports leave the
 * embedding application's console unchanged. Use the returned function in tests.
 */
export function installCliConsoleGuard(): () => void {
  const methods = ['log', 'info', 'debug', 'warn', 'error', 'dir', 'dirxml', 'table', 'trace', 'assert', 'count', 'countReset', 'time', 'timeLog', 'timeEnd', 'group', 'groupCollapsed', 'groupEnd', 'clear'] as const;
  const target = console as unknown as Record<string, (...args: unknown[]) => void>;
  const originals = methods.map(method => [method, target[method]] as const);
  for (const method of methods) {
    const diagnostic = (...args: unknown[]) => {
      if (method === 'assert' && args[0]) return;
      if (isQuietMode()) return;
      if (!isVerboseMode() && !['warn', 'error', 'trace', 'assert'].includes(method)) return;
      // gramjs has console.log(message) error branches outside its logger. Such
      // objects can contain client/session data, so never format their arguments.
      process.stderr.write(`[diagnostic] Dependency console.${method} output omitted.\n`);
    };
    target[method] = diagnostic;
  }
  return () => {
    for (const [method, original] of originals) target[method] = original;
  };
}
