import { DaemonServer } from './server.js';
import { DaemonPaths } from './pid.js';

const configDir = process.env.TG_DAEMON_CONFIG_DIR!;
const profile = process.env.TG_DAEMON_PROFILE!;
const apiId = parseInt(process.env.TG_DAEMON_API_ID!, 10);
const apiHash = process.env.TG_DAEMON_API_HASH!;
const sessionString = process.env.TG_DAEMON_SESSION!;
const idleTimeout = parseInt(process.env.TG_DAEMON_IDLE_TIMEOUT!, 10);

const paths = new DaemonPaths(configDir, profile);
const server = new DaemonServer(paths, { apiId, apiHash, sessionString }, { idleTimeout });

server.start().catch((err) => {
  process.stderr.write(`Daemon start failed: ${err.message}\n`);
  process.exit(1);
});
