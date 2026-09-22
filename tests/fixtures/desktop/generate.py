"""Generate SYNTHETIC tdata vectors, offline, using opentele 1.15.1's crypto.

Not a runtime/test dependency. Reproduce in a disposable Python 3.12 venv with
opentele==1.15.1 and tgcrypto==1.2.5. No real Desktop files are read. Keys, IDs and
passcodes below are deliberately fake. Node tests consume the checked-in JSON.
"""
import base64
import hashlib
import json
import struct
from pathlib import Path
from opentele import td
from PyQt5.QtCore import QByteArray

be = lambda n: struct.pack('>i', n)
array = lambda data: struct.pack('>I', len(data)) + data
salt = bytes(range(32))
local = bytes(range(256))


def encrypt(payload, key):
    plain = struct.pack('<I', len(payload) + 4) + payload
    plain += bytes((-len(plain)) % 16)
    msg = hashlib.sha1(plain).digest()[:16]
    encrypted = td.Storage.aesEncryptLocal(QByteArray(plain), td.AuthKey(key), QByteArray(msg))
    return msg + bytes(encrypted)


def container(payload):
    version = struct.pack('<I', 7002009)
    checksum = hashlib.md5(payload + struct.pack('<I', len(payload)) + version + b'TDF$').digest()
    return base64.b64encode(b'TDF$' + version + payload + checksum).decode()


def filename(index):
    name = 'data' if index == 0 else f'data#{index+1}'
    return ''.join(f'{b:02x}'[::-1] for b in hashlib.md5(name.encode()).digest()[:8]).upper() + 's'


def case(indices=(0,), passcode='', bad=None, retired=False):
    info = be(len(indices)) + b''.join(be(i) for i in indices) + be(indices[0])
    if bad == 'account-count': info = be(2**31-1)
    if bad == 'duplicate-index': info = be(2) + be(0) + be(0)
    if bad == 'info-tail': info += b'x'
    passkey = bytes(td.Storage.CreateLocalKey(QByteArray(salt), QByteArray(passcode.encode())).key)
    keydata = array(salt) + array(encrypt(local, passkey)) + array(encrypt(info, local))
    if bad == 'null-array': keydata = b'\xff'*4
    files = {'key_datas': container(keydata)}
    expected = []
    for index in indices:
        dc = 2 if index == 0 else 4
        user = 1001 if index == 0 else 9007199254740993 + index
        header = be(user) + be(dc) if index == 0 else be(-1) + be(-1) + struct.pack('>Q', user) + be(dc)
        if bad == 'zero-user': header = be(0) + be(dc)
        if bad == 'bad-dc': header = be(1001) + be(8)
        keys = [(2, bytes([32 + index])*256), (4, bytes([64 + index])*256)]
        if bad == 'missing-main-key': keys = [(4, bytes([64])*256)]
        if bad == 'duplicate-dc': keys = [(2, bytes([32])*256), (2, bytes([64])*256)]
        old = be(6) + b''.join(be(2) + bytes([100+i])*256 for i in range(6)) if retired else be(0)
        serialized = header + be(len(keys)) + b''.join(be(k) + v for k, v in keys) + old
        if bad == 'auth-tail': serialized += b'x'
        if bad == 'short-key': serialized = header + be(1) + be(2) + bytes(255)
        block = be(74 if bad == 'unsupported-block' else 75) + array(serialized)
        files[filename(index)] = container(array(encrypt(block, local)))
        expected.append({'index': index, 'userId': str(user), 'dc': dc, 'keyByte': 32+index if dc == 2 else 64+index})
    return {'files': files, 'expected': expected}


vectors = {
    '_notice': 'Synthetic offline crypto vectors. No real credentials, account IDs or sessions.',
    'plain': case(),
    'passcoded': case(passcode='fixture-passcode'),
    'multi': case(indices=(0, 2, 5)),
    'sole-nonzero': case(indices=(2,)),
    'retired-keys': case(retired=True),
}
for bad in ['account-count', 'duplicate-index', 'info-tail', 'null-array', 'zero-user', 'bad-dc',
            'missing-main-key', 'duplicate-dc', 'auth-tail', 'short-key', 'unsupported-block']:
    vectors['invalid-' + bad] = case(bad=bad)
Path(__file__).with_name('synthetic-tdata.json').write_text(json.dumps(vectors, indent=2) + '\n')
print('Generated synthetic Desktop vectors; no network or real account data used.')
