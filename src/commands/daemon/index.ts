import { Command } from 'commander';
import { daemonStartAction } from './start.js';
import { daemonStopAction } from './stop.js';
import { daemonStatusAction } from './status.js';

export function createDaemonCommand(): Command {
  const daemon = new Command('daemon')
    .description('Manage persistent Telegram connection daemon');

  daemon
    .command('start')
    .description('Start the daemon for persistent connection')
    .option('--idle-timeout <seconds>', 'Auto-stop after N seconds of inactivity', '300')
    .option('--foreground', 'Run in foreground (do not fork)')
    .action(daemonStartAction);

  daemon
    .command('stop')
    .description('Stop the running daemon')
    .action(daemonStopAction);

  daemon
    .command('status')
    .description('Check daemon status')
    .action(daemonStatusAction);

  return daemon;
}
