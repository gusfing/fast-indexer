# Fast Indexer ⚡

> **Rapid URL Indexing Suite, REST API & Googlebot Telemetry Dashboard**  
> Multi-engine crawl infrastructure combining the Google Indexing API v3, IndexNow protocol, isolated RSS syndication feeds, and real-time Googlebot crawl tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)

---

## What's New in v2.0

1. **Isolated RSS Feeds:** Generates dynamic, dedicated RSS 2.0 XML feeds per batch (`/rss/:batchId.xml`) and broadcasts them to Google WebSub and Ping-o-Matic.
2. **Googlebot & Spider Telemetry:** Automatically tracks and records visits by `Googlebot (Smartphone)`, `Googlebot (Desktop)`, `Google Inspection Tool`, and `Bingbot`, storing IP, timestamp, user agent, and reverse DNS verification.
3. **VPS Ready & REST API:** Deploy on any Ubuntu/Debian VPS with Docker Compose or systemd, featuring `POST /api/v1/index` for automated workflow integration.

---

## Architecture & The 5 Crawl Vectors

```
                                  ┌───► [Stage 1] Preflight HTTP 200 & noindex Check
                                  │
                                  ├───► [Stage 2] Google Indexing API v3 (Direct Push)
                                  │
[Your Target URLs] ──► Fast Indexer ───► [Stage 3] IndexNow Protocol (Bing / Yandex / Seznam)
                                  │
                                  ├───► [Stage 4] Isolated RSS & XML-RPC Ping Cascade
                                  │                └── Google WebSub & Ping-o-Matic
                                  │
                                  └───► [Stage 5] Headless Chrome Telemetry Visit
                                                   └── Fires Analytics & Network Signals

                                  ┌───► Real-Time Googlebot Telemetry Logger
[Search Engine Spiders] ──────────┼───► /rss/:batchId.xml (Isolated Feed Crawls)
                                  └───► Reverse DNS Bot Verification
```

---

## REST API Documentation

Fast Indexer includes a high-performance REST API for programmatic indexing.

### `POST /api/v1/index`
Submit a batch of URLs for rapid crawl scheduling.

**Headers:**
```http
Content-Type: application/json
X-API-Key: your-secret-api-key (optional, if configured)
```

**Request Body:**
```json
{
  "urls": [
    "https://example.com/new-product-page",
    "https://example.com/blog/latest-article"
  ],
  "mode": "full",
  "siteName": "My Website",
  "siteUrl": "https://example.com"
}
```

*Modes:* `full` (all 5 stages), `google` (Google API only), `indexnow` (Bing/Yandex only), `ping` (Isolated RSS pings only), `browser` (Headless Chrome visits only).

**Response (HTTP 200):**
```json
{
  "success": true,
  "batchId": "batch_1795593596552",
  "stats": {
    "totalUrls": 2,
    "isolatedFeedUrl": "http://your-vps:4040/rss/batch_1795593596552.xml",
    "preflightPassed": 2,
    "googlePublished": 2,
    "indexNowStatus": "Success",
    "browserVisits": 2
  },
  "logs": [
    "[1:30:00 PM] Isolated RSS feed published: http://your-vps:4040/rss/batch_1795593596552.xml",
    "[1:30:01 PM] [200 OK] Google crawl queued: https://example.com/new-product-page",
    "[1:30:02 PM] [IndexNow OK] HTTP 200 Accepted: 2 URL(s) queued for crawl."
  ]
}
```

### `GET /api/v1/bot-logs`
Retrieve real-time crawl visits from Googlebot, Bingbot, and other spiders.

**Query Parameters:**
- `bot=google`: Filter to Googlebot hits only.
- `limit=50`: Number of log entries (default: 50, max: 1000).

**Response:**
```json
{
  "stats": {
    "totalHits": 14,
    "googleHits": 11,
    "bingHits": 3,
    "lastVisit": "2026-11-25T08:15:32.486Z"
  },
  "logs": [
    {
      "timestamp": "2026-11-25T08:15:32.486Z",
      "bot": "Googlebot (Desktop)",
      "isGoogle": true,
      "ip": "66.249.66.1",
      "path": "/rss/batch_1795593596552.xml",
      "userAgent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "verified": true,
      "reverseDns": "crawl-66-249-66-1.googlebot.com"
    }
  ]
}
```

### `GET /rss/:batchId.xml`
Returns the isolated RSS 2.0 XML feed generated for that batch. Automatically records spider visits.

---

## VPS Deployment Guide

Fast Indexer is packaged with automated scripts for fast VPS deployment.

### Method 1: 1-Click Bash Installer (Ubuntu/Debian)
On a fresh VPS (Ubuntu 20.04+, 22.04+, Debian 11+), run:
```bash
curl -fsSL https://raw.githubusercontent.com/gusfing/fast-indexer/main/deploy-vps.sh | sudo bash
```
Or clone and run:
```bash
git clone https://github.com/gusfing/fast-indexer.git /opt/fast-indexer
cd /opt/fast-indexer
chmod +x deploy-vps.sh
sudo ./deploy-vps.sh
```

### Method 2: Docker Compose
```bash
git clone https://github.com/gusfing/fast-indexer.git
cd fast-indexer
cp service-account.sample.json service-account.json # Add your GCP credentials
docker compose up -d
```
The application will be live at `http://your-vps-ip:4040`.

### Method 3: Reverse Proxy with SSL (Caddy or Nginx)
- **Caddy (Automatic SSL):** Use the included `Caddyfile`. Replace `indexer.yourdomain.com` and run `caddy run`.
- **Nginx:** Use the included `nginx.conf` and secure with Certbot.

---

## Local Usage (Windows)

Double-click `start.bat` on your Desktop. It automatically frees port 4040, starts the server, and opens [http://localhost:4040](http://localhost:4040).

---

## License

This project is licensed under the [MIT License](LICENSE).
