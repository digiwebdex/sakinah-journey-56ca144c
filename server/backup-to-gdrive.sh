#!/bin/bash
# Deprecated — use nightly-backup.sh instead (DB + uploads + Google Drive).
exec "$(dirname "$0")/nightly-backup.sh" "$@"
