"""TG-57: exercise the built CLI in a real PTY without Telegram credentials."""
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
    with tempfile.TemporaryDirectory(prefix="tg-login-story-") as directory:
        config = Path(directory) / "config.json"
        config.write_text('{"profiles":{}}\n')
        env = {key: value for key, value in os.environ.items() if not key.startswith("TG_")}
        env.update(TERM="xterm-256color", NO_COLOR="1")
        master, slave = pty.openpty()
        process = subprocess.Popen(
            [node, binary, "--config", str(config), "--profile", "story",
             "--verbose", "--transport", "wss", "auth", "login"],
            stdin=slave, stderr=slave, stdout=subprocess.PIPE, env=env,
        )
        os.close(slave)
        terminal = bytearray()
        data = bytearray()
        descriptors = {master, process.stdout.fileno()}
        answered = False
        deadline = time.monotonic() + 8
        try:
            while descriptors and time.monotonic() < deadline:
                readable, _, _ = select.select(list(descriptors), [], [], 0.05)
                for descriptor in readable:
                    try:
                        chunk = os.read(descriptor, 65536)
                    except OSError as error:
                        if descriptor != master or error.errno != errno.EIO:
                            raise
                        chunk = b""
                    if not chunk:
                        descriptors.discard(descriptor)
                        continue
                    (terminal if descriptor == master else data).extend(chunk)
                if not answered and b"Phone number (international format): " in terminal:
                    assert b"Starting authentication" not in terminal, "Network started before phone input"
                    assert b"[gramjs" not in terminal, "SDK started before phone input"
                    os.write(master, b"invalid-phone\r")
                    answered = True
            assert answered, "Phone prompt was not visible in the real terminal"
            assert process.wait(timeout=2) == 1, "Invalid input did not exit with failure"
            result = json.loads(data.decode())
            assert result.get("ok") is False and result.get("code") == "INVALID_INPUT"
            assert b"Starting authentication" not in terminal
            assert not list(Path(directory).rglob("*.session")), "Invalid input saved a session"
            return {"realPTY": True, "phoneBeforeNetwork": True, "invalidInputRejected": True,
                    "sessionSaved": False}
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=2)
            process.stdout.close()
            os.close(master)


if __name__ == "__main__":
    print(json.dumps(check(sys.argv[1], sys.argv[2])))
