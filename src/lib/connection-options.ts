import type { Transport } from './types.js';
import { validateTransport } from './transport.js';
import { DiagnosticTCPFull } from './transport-diagnostics.js';
import { DiagnosticWSS, WssSocket } from './wss.js';

/** Shared transport selection for auth, direct commands and the daemon. */
export function connectionOptions(transport: Transport = 'tcp') {
  return validateTransport(transport) === 'wss'
    ? { connection: DiagnosticWSS, networkSocket: WssSocket, useWSS: true }
    : { connection: DiagnosticTCPFull, useWSS: false };
}
