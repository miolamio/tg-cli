/** Global --quiet / --verbose flags set from the preAction hook. */
import { getDaemonContext } from './daemon/execution-context.js';

let _quietMode = false;
let _verboseMode = false;

export function setQuietMode(enabled: boolean): void {
  _quietMode = enabled;
}

export function setVerboseMode(enabled: boolean): void {
  _verboseMode = enabled;
}

export function isQuietMode(): boolean {
  return getDaemonContext() ? true : _quietMode;
}

export function isVerboseMode(): boolean {
  return getDaemonContext() ? false : _verboseMode;
}
