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
