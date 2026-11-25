#!/usr/bin/env bash
# ==============================================================================
# Fast Indexer - 1-Click VPS Installation & Deployment Script
# Supports: Ubuntu 20.04+, Ubuntu 22.04+, Debian 11+, Debian 12+
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Installing Fast Indexer on VPS..."
echo "=========================================================="

# 1. Update OS Packages
echo "--> Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw build-essential

# 2. Install Node.js 20 LTS (if not present)
if ! command -v node &> /dev/null; then
    echo "--> Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# 3. Setup Project Directory
INSTALL_DIR="/opt/fast-indexer"
echo "--> Deploying files to ${INSTALL_DIR}..."

if [ -d "$INSTALL_DIR" ]; then
    echo "--> Existing installation found. Updating git repo..."
    cd "$INSTALL_DIR"
    git pull origin main || true
else
    git clone https://github.com/gusfing/fast-indexer.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 4. Install Dependencies
echo "--> Installing dependencies..."
npm install --production

# 5. Setup Systemd Service
echo "--> Configuring Systemd service..."
cp fast-indexer.service /etc/systemd/system/fast-indexer.service
systemctl daemon-reload
systemctl enable fast-indexer
systemctl restart fast-indexer

# 6. Configure Firewall
if command -v ufw &> /dev/null; then
    echo "--> Allowing port 4040 through UFW firewall..."
    ufw allow 4040/tcp || true
fi

echo ""
echo "=========================================================="
echo "🎉 Fast Indexer is successfully running on your VPS!"
echo "=========================================================="
echo "Local Port:    4040"
echo "Dashboard:     http://YOUR_SERVER_IP:4040"
echo "REST API:      http://YOUR_SERVER_IP:4040/api/v1/index"
echo "Bot Tracker:   http://YOUR_SERVER_IP:4040/api/v1/bot-logs"
echo "Isolated RSS:  http://YOUR_SERVER_IP:4040/rss/latest.xml"
echo ""
echo "Next Steps:"
echo "1. Place your Google Cloud 'service-account.json' into ${INSTALL_DIR}/service-account.json"
echo "2. (Optional) Setup Caddy or Nginx reverse proxy using the included Caddyfile or nginx.conf"
echo "3. Restart service with: systemctl restart fast-indexer"
echo "=========================================================="
