"""TG-63: hidden Desktop passcode input in a real PTY, entirely offline."""
import base64
import errno
import json
import os
import pty
import select
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def check(node, binary):
    vectors = json.loads((Path(__file__).parent / 'desktop/synthetic-tdata.json').read_text())
    with tempfile.TemporaryDirectory(prefix='tg-desktop-passcode-') as directory:
        root = Path(directory)
        source = root / 'tdata'
        source.mkdir()
        for name, value in vectors['passcoded']['files'].items():
            (source / name).write_bytes(base64.b64decode(value))
        config = root / 'config.json'
        config.write_text('{"profiles":{}}')
        (root / 'sessions').mkdir()
        # Prevent networking after successful decryption, before preset lookup.
        (root / 'sessions/occupied.session').write_text('invalid-synthetic-session')
        env = {k: v for k, v in os.environ.items() if not k.startswith('TG_')}
        env.update(TERM='xterm-256color', NO_COLOR='1')
        master, slave = pty.openpty()
        process = subprocess.Popen([node, binary, '--config', str(config), '--profile', 'new',
            'session', 'import-desktop', str(source), '--desktop-closed', '--ask-passcode'],
            stdin=slave, stderr=slave, stdout=subprocess.PIPE, env=env)
        os.close(slave)
        terminal, data = bytearray(), bytearray()
        descriptors = {master, process.stdout.fileno()}
        answered = False
        try:
            deadline = time.monotonic() + 8
            while descriptors and time.monotonic() < deadline:
                readable, _, _ = select.select(list(descriptors), [], [], 0.05)
                for descriptor in readable:
                    try:
                        chunk = os.read(descriptor, 65536)
                    except OSError as error:
                        if descriptor != master or error.errno != errno.EIO:
                            raise
                        chunk = b''
                    if not chunk:
                        descriptors.discard(descriptor)
                    else:
                        (terminal if descriptor == master else data).extend(chunk)
                if not answered and b'Telegram Desktop local passcode: ' in terminal:
                    os.write(master, b'fixture-passcode\r')
                    answered = True
            assert answered and process.wait(timeout=2) == 1
            assert json.loads(data)['code'] == 'SESSION_ERROR', 'Did not pass decryption and reach the offline duplicate guard'
            assert b'fixture-passcode' not in terminal + data, 'Passcode echoed'
            assert b'Verifying' not in terminal and b'[gramjs' not in terminal
            assert not (root / 'sessions/new.session').exists()
            for name, value in vectors['passcoded']['files'].items():
                assert (source / name).read_bytes() == base64.b64decode(value)
            return {'realPTY': True, 'hiddenInput': True, 'decrypted': True, 'networkStarted': False, 'sourceUnchanged': True}
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=2)
            process.stdout.close()
            os.close(master)


if __name__ == '__main__':
    print(json.dumps(check(sys.argv[1], sys.argv[2])))
