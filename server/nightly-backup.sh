#!/bin/bash
# Manasik Travel Hub — nightly backup (PostgreSQL + uploads)
# Schedule: crontab — see server/DEPLOY.md
#
# Restore database:
#   gunzip -c server/backups/daily/manasik_db_YYYY-MM-DD_HH-MM-SS.sql.gz | psql "$DATABASE_URL"
# Restore uploads:
#   tar -xzf server/backups/daily/manasik_uploads_YYYY-MM-DD_HH-MM-SS.tar.gz -C server/

set -euo pipefail

APP_DIR="/var/www/manasik-travel-hub"
SERVER_DIR="$APP_DIR/server"
ENV_FILE="$SERVER_DIR/.env"
BACKUP_DIR="$SERVER_DIR/backups/daily"
UPLOADS_DIR="$SERVER_DIR/uploads"
LOG_FILE="/var/log/manasik-backup.log"
KEEP_DAYS=30
GDRIVE_REMOTE="gdrive"
GDRIVE_FOLDER="Manasik Travel Hub/Backups"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

load_database_url() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log "ERROR: .env not found at $ENV_FILE"
    exit 1
  fi
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERROR: DATABASE_URL not set in $ENV_FILE"
    exit 1
  fi
}

require_nonempty() {
  local file="$1"
  local label="$2"
  if [[ ! -s "$file" ]]; then
    log "ERROR: $label backup is empty or missing: $file"
    exit 1
  fi
}

log "===== Manasik backup started ====="
load_database_url
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
DB_BACKUP="$BACKUP_DIR/manasik_db_${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP="$BACKUP_DIR/manasik_uploads_${TIMESTAMP}.tar.gz"

log "Dumping PostgreSQL database..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$DB_BACKUP"
require_nonempty "$DB_BACKUP" "Database"
log "Database backup: $(du -h "$DB_BACKUP" | cut -f1) — $(basename "$DB_BACKUP")"

log "Archiving uploads folder..."
if [[ -d "$UPLOADS_DIR" ]]; then
  tar -czf "$UPLOADS_BACKUP" -C "$SERVER_DIR" uploads
  require_nonempty "$UPLOADS_BACKUP" "Uploads"
  log "Uploads backup: $(du -h "$UPLOADS_BACKUP" | cut -f1) — $(basename "$UPLOADS_BACKUP")"
else
  log "WARN: uploads directory not found, skipping file backup"
fi

if command -v rclone >/dev/null 2>&1; then
  log "Uploading to Google Drive (${GDRIVE_FOLDER})..."
  rclone mkdir "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/database" 2>/dev/null || true
  rclone mkdir "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/uploads" 2>/dev/null || true
  rclone copy "$DB_BACKUP" "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/database/" --log-file "$LOG_FILE" --log-level INFO
  if [[ -f "$UPLOADS_BACKUP" ]]; then
    rclone copy "$UPLOADS_BACKUP" "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/uploads/" --log-file "$LOG_FILE" --log-level INFO
  fi
  rclone delete "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/database/" --min-age "${KEEP_DAYS}d" 2>/dev/null || true
  rclone delete "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/uploads/" --min-age "${KEEP_DAYS}d" 2>/dev/null || true
  log "Google Drive sync complete"
else
  log "rclone not installed — local backup only"
fi

log "Removing local backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -type f \( -name 'manasik_db_*.sql.gz' -o -name 'manasik_uploads_*.tar.gz' \) -mtime +"${KEEP_DAYS}" -delete 2>/dev/null || true

log "===== Manasik backup completed successfully ====="
