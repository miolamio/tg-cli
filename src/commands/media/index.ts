import { Command } from 'commander';

/**
 * Create the `media` command group.
 * Stub - not yet implemented.
 */
export function createMediaCommand(): Command {
  const media = new Command('media')
    .description('Download and upload media files');

  return media;
}
