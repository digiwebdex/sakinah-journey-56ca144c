// VPS Deployment Guide - Manasik Travel Hub ERP
// ======================================

## Quick Start

### 1. Setup PostgreSQL on VPS

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y

# Create database and user
sudo -u postgres psql << 'SQL'
CREATE USER digiwebdex WITH PASSWORD 'your_strong_password';
CREATE DATABASE manasik OWNER digiwebdex;
GRANT ALL PRIVILEGES ON DATABASE manasik TO digiwebdex;
SQL

# Run schema
cd /var/www/manasik-travel-hub/server
sudo -u postgres psql -d manasik -f schema.sql
```

### 2. Setup Node.js Backend

```bash
cd /var/www/manasik-travel-hub/server

# Create .env from example
cp .env.example .env
nano .env  # Edit with your actual values

# Install dependencies
npm install

# Create uploads directory
mkdir -p uploads

# Test it works
node index.js
```

### 3. Update Frontend Build

```bash
cd /var/www/manasik-travel-hub

# Add API URL to .env
echo 'VITE_API_URL=/api' >> .env

# Rebuild frontend
npm run build
```

### 4. Update Nginx Config

```bash
sudo tee /etc/nginx/sites-available/manasik << 'NGINX'
server {
    listen 80;
    server_name manasiktravelhub.com www.manasiktravelhub.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name manasiktravelhub.com www.manasiktravelhub.com;

    ssl_certificate /etc/letsencrypt/live/manasiktravelhub.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/manasiktravelhub.com/privkey.pem;

    client_max_body_size 10M;

    # API proxy to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Uploaded files
    location /uploads/ {
        alias /var/www/manasik-travel-hub/server/uploads/;
    }

    # Frontend (static files)
    location / {
        root /var/www/manasik-travel-hub/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
NGINX

sudo nginx -t && sudo systemctl restart nginx
```

### 5. Keep Backend Running with PM2

```bash
sudo npm install -g pm2

cd /var/www/manasik-travel-hub/server
pm2 start index.js --name "manasik-api"
pm2 save
pm2 startup  # Follow the instructions to auto-start on reboot
```

### 6. Nightly Backups (database + uploads)

Automated backup script: `server/nightly-backup.sh`

- **Database:** `pg_dump` → `server/backups/daily/manasik_db_*.sql.gz`
- **Files:** `server/uploads/` → `server/backups/daily/manasik_uploads_*.tar.gz`
- **Off-site:** copies to Google Drive (`Manasik Travel Hub/Backups/`) when `rclone` is configured
- **Retention:** 30 days (local + Drive)

Add to root crontab (runs daily at 2:15 AM):

```bash
15 2 * * * /var/www/manasik-travel-hub/server/nightly-backup.sh
```

Manual run:

```bash
/var/www/manasik-travel-hub/server/nightly-backup.sh
tail -f /var/log/manasik-backup.log
```

Restore:

```bash
# Database (read DATABASE_URL from server/.env first)
gunzip -c server/backups/daily/manasik_db_YYYY-MM-DD_HH-MM-SS.sql.gz | psql "$DATABASE_URL"

# Uploads
tar -xzf server/backups/daily/manasik_uploads_YYYY-MM-DD_HH-MM-SS.tar.gz -C server/
```

Admin panel JSON backups (`/api/backup/create`) are separate — useful for table-level restore, but do not include uploaded files.

### 7. Data Migration

Export data from Lovable Cloud and import to your PostgreSQL:
- Use the site-backup feature in Admin Settings to export all data as JSON
- Then write import scripts or use pg_dump/pg_restore

### Default Login
- Email: admin@manasiktravelhub.com
- Password: Admin@123456 (CHANGE THIS IMMEDIATELY)

## Architecture

```
Browser → Nginx (443)
            ├── /api/* → Node.js (3004) → PostgreSQL
            ├── /uploads/* → Static files
            └── /* → dist/index.html (React SPA)
```
