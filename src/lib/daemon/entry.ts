import { DaemonServer } from './server.js';
import { DaemonPaths } from './pid.js';
import { installDaemonSignals } from './lifecycle.js';
import { createConfig, getCredentialsOrThrow } from '../config.js';
import { parseIntegerOption, validateProfile } from '../validate.js';
import { installCliConsoleGuard } from '../cli-console.js';
import { resolveTransport, validateTransport } from '../transport.js';

installCliConsoleGuard();

async function main(): Promise<void> {
  const configDir = process.env.TG_DAEMON_CONFIG_DIR;
  const profile = process.env.TG_DAEMON_PROFILE;
  const idleInput = process.env.TG_DAEMON_IDLE_TIMEOUT;
  const configPath = process.env.TG_DAEMON_CONFIG;
  const transportInput = process.env.TG_DAEMON_TRANSPORT;
  const pidPreclaimed = process.env.TG_DAEMON_PID_PRECLAIMED === '1';

  delete process.env.TG_DAEMON_SESSION;
  delete process.env.TG_DAEMON_API_HASH;
  delete process.env.TG_DAEMON_API_ID;
  delete process.env.TG_DAEMON_CONFIG_DIR;
  delete process.env.TG_DAEMON_PROFILE;
  delete process.env.TG_DAEMON_IDLE_TIMEOUT;
  delete process.env.TG_DAEMON_CONFIG;
  delete process.env.TG_DAEMON_TRANSPORT;
  delete process.env.TG_DAEMON_PID_PRECLAIMED;

  if (!configDir || !profile || idleInput == null) {
    process.stderr.write('Daemon missing TG_DAEMON_CONFIG_DIR / PROFILE / IDLE_TIMEOUT\n');
    process.exit(1);
  }
  validateProfile(profile);
  const idleTimeout = parseIntegerOption(idleInput, 'daemon idle timeout');

  const config = createConfig(configPath);
  const { apiId, apiHash } = await getCredentialsOrThrow(config, undefined, profile);
  const transport = resolveTransport(config, profile, transportInput === undefined ? undefined : validateTransport(transportInput));
  const paths = new DaemonPaths(configDir, profile);
  const server = new DaemonServer(
    paths,
    { apiId, apiHash, transport },
    { idleTimeout, onIdle: () => process.exit(0), pidPreclaimed },
  );

  installDaemonSignals(() => server.stop());
  await server.start();
}

main().catch((err) => {
  process.stderr.write(`Daemon start failed: ${(err as Error).message}\n`);
  process.exit(1);
});
