import { describe, it, expect } from 'vitest';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';

describe('withAuth daemon detection', () => {
  it('DaemonPaths correctly resolves socket path for profile', () => {
    const paths = new DaemonPaths('/tmp/test-config', 'myprofile');
    expect(paths.socketPath).toContain('myprofile.sock');
    expect(paths.socketPath).toContain('daemon');
  });
});
