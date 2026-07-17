# GPA V3 Hostinger VPS Deployment

This runs GPA V3 as one FastAPI service behind Nginx.

## 1. SSH into VPS

```bash
ssh root@YOUR_SERVER_IP
```

## 2. Install packages

```bash
apt update
apt install -y git python3 python3-venv python3-pip nginx
```

## 3. Create app user and folders

```bash
useradd --system --create-home --shell /bin/bash gpa
mkdir -p /opt/gpa-v3/data
chown -R gpa:gpa /opt/gpa-v3
```

## 4. Clone repository

```bash
cd /opt/gpa-v3
git clone https://github.com/gautamgpa3/GPA_V3.git app
chown -R gpa:gpa /opt/gpa-v3
```

## 5. Create Python environment

```bash
cd /opt/gpa-v3/app
python3 -m venv /opt/gpa-v3/venv
/opt/gpa-v3/venv/bin/pip install --upgrade pip
/opt/gpa-v3/venv/bin/pip install -r requirements.txt
```

## 6. Configure environment

```bash
cp .env.example .env
nano .env
```

Default:

```env
GPA_DATABASE_PATH=/opt/gpa-v3/data/gpa.db
GPA_HOST=127.0.0.1
GPA_PORT=8000
```

## 7. Install systemd service

```bash
cp deploy/gpa-v3.service /etc/systemd/system/gpa-v3.service
systemctl daemon-reload
systemctl enable gpa-v3
systemctl start gpa-v3
systemctl status gpa-v3
```

## 8. Configure Nginx

```bash
cp deploy/nginx-gpa-v3.conf /etc/nginx/sites-available/gpa-v3
nano /etc/nginx/sites-available/gpa-v3
ln -s /etc/nginx/sites-available/gpa-v3 /etc/nginx/sites-enabled/gpa-v3
nginx -t
systemctl reload nginx
```

Replace `YOUR_DOMAIN_OR_SERVER_IP` with your domain or VPS IP.

## 9. Open in browser

```text
http://YOUR_SERVER_IP/
```

## 10. Enable HTTPS for voice commands

Voice commands use the browser microphone and speech recognition APIs. Browsers allow this on `localhost`, but on a public VPS they require HTTPS. A raw `http://SERVER_IP/` page can load the app, but the mic button will not work reliably.

Use a domain or subdomain pointed to your VPS IP, for example `gpa.yourdomain.com`. Then update Nginx:

```bash
nano /etc/nginx/sites-available/gpa-v3
```

Set:

```nginx
server_name gpa.yourdomain.com;
```

Install Certbot and issue the certificate:

```bash
apt update
apt install -y certbot python3-certbot-nginx
certbot --nginx -d gpa.yourdomain.com
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Then open:

```text
https://gpa.yourdomain.com/
```

Use Chrome or Edge for voice commands, and allow microphone permission when the browser asks.

## 11. Enable daily Telegram reminders

Create a Telegram bot with BotFather and copy the bot token. Send one message to your bot from your Telegram account, then get your chat ID:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates"
```

Keep Telegram credentials outside the Git repository in a server-only secrets file:

```bash
mkdir -p /opt/gpa-v3/secrets
nano /opt/gpa-v3/secrets/telegram.env
```

Set:

```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
```

Lock the file so only root and the `gpa` service user can read it:

```bash
chown -R gpa:gpa /opt/gpa-v3/secrets
chmod 700 /opt/gpa-v3/secrets
chmod 600 /opt/gpa-v3/secrets/telegram.env
```

Point GPA to that secrets file:

```bash
nano /opt/gpa-v3/app/.env
```

Add:

```env
GPA_TELEGRAM_SECRETS_FILE=/opt/gpa-v3/secrets/telegram.env
```

Install and start the daily reminder timer:

```bash
cp /opt/gpa-v3/app/deploy/gpa-v3-telegram-reminder.service /etc/systemd/system/gpa-v3-telegram-reminder.service
cp /opt/gpa-v3/app/deploy/gpa-v3-telegram-reminder.timer /etc/systemd/system/gpa-v3-telegram-reminder.timer
systemctl daemon-reload
systemctl enable --now gpa-v3-telegram-reminder.timer
systemctl list-timers gpa-v3-telegram-reminder.timer
```

Default send time is `08:30` server time. To change it:

```bash
nano /etc/systemd/system/gpa-v3-telegram-reminder.timer
systemctl daemon-reload
systemctl restart gpa-v3-telegram-reminder.timer
```

Test without sending:

```bash
cd /opt/gpa-v3/app
/opt/gpa-v3/venv/bin/python -m backend.jobs.telegram_reminder --dry-run
```

Send a test message:

```bash
cd /opt/gpa-v3/app
/opt/gpa-v3/venv/bin/python -m backend.jobs.telegram_reminder --force
```

## 12. Enable iCloud contacts sync

This is one-way sync:

```text
iPhone Contacts -> iCloud -> GPA V3 Contacts
```

GPA does not delete or edit contacts on your iPhone.

Create an Apple app-specific password from Apple ID security settings. Do not use your main Apple ID password.

Create the server-only secrets file:

```bash
mkdir -p /opt/gpa-v3/secrets
nano /opt/gpa-v3/secrets/icloud_contacts.env
```

Set:

```env
APPLE_ID=your-apple-id@example.com
APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

Lock the file:

```bash
chown -R gpa:gpa /opt/gpa-v3/secrets
chmod 700 /opt/gpa-v3/secrets
chmod 600 /opt/gpa-v3/secrets/icloud_contacts.env
```

Test without saving:

```bash
cd /opt/gpa-v3/app
GPA_ICLOUD_CONTACTS_FILE=/opt/gpa-v3/secrets/icloud_contacts.env /opt/gpa-v3/venv/bin/python -m backend.jobs.icloud_contacts_sync --dry-run
```

Run one real sync:

```bash
cd /opt/gpa-v3/app
GPA_ICLOUD_CONTACTS_FILE=/opt/gpa-v3/secrets/icloud_contacts.env /opt/gpa-v3/venv/bin/python -m backend.jobs.icloud_contacts_sync
```

Install automatic sync every 30 minutes:

```bash
cp /opt/gpa-v3/app/deploy/gpa-v3-icloud-contacts-sync.service /etc/systemd/system/gpa-v3-icloud-contacts-sync.service
cp /opt/gpa-v3/app/deploy/gpa-v3-icloud-contacts-sync.timer /etc/systemd/system/gpa-v3-icloud-contacts-sync.timer
systemctl daemon-reload
systemctl enable --now gpa-v3-icloud-contacts-sync.timer
systemctl list-timers gpa-v3-icloud-contacts-sync.timer
```

Manual sync is also available in GPA:

```text
Contacts -> Sync iCloud
```

## 13. Enable Google contacts sync

Google sync has two parts:

```text
Google Contacts -> GPA V3 Contacts
GPA V3 Contacts -> Google Contacts only when you click Push Google
```

On your iPhone, add the same Google account under Contacts. Then contacts created in Google will appear on your phone through Google contact sync.

Create a Google Cloud OAuth client, enable the Google People API, and generate a refresh token with this scope:

```text
https://www.googleapis.com/auth/contacts
```

Create the server-only secrets file:

```bash
mkdir -p /opt/gpa-v3/secrets
nano /opt/gpa-v3/secrets/google_contacts.env
```

Set:

```env
CLIENT_ID=your-google-oauth-client-id
CLIENT_SECRET=your-google-oauth-client-secret
REFRESH_TOKEN=your-google-refresh-token
```

Lock the file:

```bash
chown -R gpa:gpa /opt/gpa-v3/secrets
chmod 700 /opt/gpa-v3/secrets
chmod 600 /opt/gpa-v3/secrets/google_contacts.env
```

Test Google to GPA without saving:

```bash
cd /opt/gpa-v3/app
GPA_GOOGLE_CONTACTS_FILE=/opt/gpa-v3/secrets/google_contacts.env /opt/gpa-v3/venv/bin/python -m backend.jobs.google_contacts_sync --dry-run
```

Run one real Google to GPA sync:

```bash
cd /opt/gpa-v3/app
GPA_GOOGLE_CONTACTS_FILE=/opt/gpa-v3/secrets/google_contacts.env /opt/gpa-v3/venv/bin/python -m backend.jobs.google_contacts_sync
```

Test GPA to Google without saving:

```bash
cd /opt/gpa-v3/app
GPA_GOOGLE_CONTACTS_FILE=/opt/gpa-v3/secrets/google_contacts.env /opt/gpa-v3/venv/bin/python -m backend.jobs.google_contacts_sync --push --dry-run
```

Install automatic Google to GPA sync every 30 minutes:

```bash
cp /opt/gpa-v3/app/deploy/gpa-v3-google-contacts-sync.service /etc/systemd/system/gpa-v3-google-contacts-sync.service
cp /opt/gpa-v3/app/deploy/gpa-v3-google-contacts-sync.timer /etc/systemd/system/gpa-v3-google-contacts-sync.timer
systemctl daemon-reload
systemctl enable --now gpa-v3-google-contacts-sync.timer
systemctl list-timers gpa-v3-google-contacts-sync.timer
```

Manual sync is also available in GPA:

```text
Contacts -> Sync Google
Contacts -> Push Google
```

## Update later

```bash
cd /opt/gpa-v3/app
git pull --ff-only
/opt/gpa-v3/venv/bin/pip install -r requirements.txt
systemctl restart gpa-v3
```

## Useful checks

```bash
systemctl status gpa-v3
journalctl -u gpa-v3 -f
curl http://127.0.0.1:8000/health
```

## Backup SQLite database

```bash
cp /opt/gpa-v3/data/gpa.db /opt/gpa-v3/data/gpa-backup-$(date +%F-%H%M).db
```
