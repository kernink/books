#!/bin/sh
# Refuse to publish anything that ties this repo to one physical device or one
# private network.
#
#   ./scripts/check-public.sh
#
# Runs in CI or before a push. Exits non-zero and prints the offending lines if
# it finds a real machine path, a private address, a MAC address, a Kindle
# serial, a bare SSH key path, a 32-hex identifier or a private key.
#
# The patterns below are deliberately generic, so the check does not need to be
# told any secret and can itself be published and scanned like any other file —
# it deliberately does *not* exclude itself.
#
# It catches *structured* identifiers: machine paths, private addresses, MAC
# addresses, Kindle serials, GUIDs, bare SSH key paths, private keys.
#
# It cannot catch a name. A network name, a hostname, a service name or a
# person's handle is not a pattern, and you still have to read the diff for
# those. Treat a clean run as "nothing mechanical slipped through", not as
# "this is safe to publish".
set -eu

cd "$(dirname "$0")/.."

PATTERN='(/Users|[[:<:]]/home)/[A-Za-z0-9._-]+/'
PATTERN="$PATTERN|\\b(10|192\\.168|172\\.(1[6-9]|2[0-9]|3[01]))\\.[0-9]{1,3}\\.[0-9]{1,3}\\b"
PATTERN="$PATTERN|([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}"
PATTERN="$PATTERN|\\bG0[0-9A-Z]{14}\\b"
PATTERN="$PATTERN|\\[[0-9a-f]{32}\\]|[[:space:]][0-9a-f]{32}[[:space:][:punct:]]"
PATTERN="$PATTERN|~/?\\.ssh/[^<[:space:]]"
PATTERN="$PATTERN|BEGIN [A-Z ]*PRIVATE KEY"

hits=$(grep -rnIE --exclude-dir=.git "$PATTERN" . || true)

if [ -n "$hits" ]; then
  echo "possible identifiers in publishable files:" >&2
  echo "$hits" >&2
  echo >&2
  echo "mask them (the convention is in the-kindle-from-the-panel-up/99-references.md)." >&2
  exit 1
fi

echo "check-public: clean"
