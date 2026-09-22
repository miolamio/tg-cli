# Synthetic Desktop storage vectors (TG-63)

Every account ID, key and passcode in `synthetic-tdata.json` is invented. The
vectors were generated offline with Python 3.12, opentele 1.15.1 and tgcrypto
1.2.5. They are not exported accounts and cannot authenticate to Telegram.

`generate.py` uses opentele's passcode derivation and AES-IGE implementation,
independently of the production TypeScript reader. The outer Qt byte arrays and
TDF$ containers are constructed from the documented Desktop layout. It reads no
user files and does not connect to a network. Padding is deterministic zero data.

To regenerate in a disposable virtual environment:

```sh
python -m pip install opentele==1.15.1 tgcrypto==1.2.5
python tests/fixtures/desktop/generate.py
```

These packages are not CLI runtime or CI test dependencies. Tests read the
checked-in vectors; the real-terminal fixture uses only Python's standard
library. Cases include sparse account indices, wide IDs, passcode protection,
retired keys and malformed decrypted structures.

Format references: official Desktop
[local storage](https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/storage/details/storage_file_utilities.cpp),
[account list](https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/storage/storage_domain.cpp),
and [authorization serialization](https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/main/main_account.cpp).
