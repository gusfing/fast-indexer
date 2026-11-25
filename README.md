# Fast Indexer ⚡

> **Rapid URL Indexing Suite and Local Web Dashboard**  
> Direct multi-engine crawl acceleration combining the Google Indexing API, IndexNow protocol, XML-RPC Ping Cascades, and Headless Browser Telemetry.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)

---

## Overview

When new web pages, blog posts, or programmatic landing pages are published, search engine crawlers (Googlebot, Bingbot, YandexBot) often take days or weeks to discover and index them.

**Fast Indexer** bridges this discovery gap by simultaneously broadcasting your URLs across five independent crawl vectors through a single, responsive local web interface.

---

## How It Works: The 5 Crawl Vectors

```
                                  ┌───► [Stage 1] Preflight HTTP & noindex Check
                                  │
                                  ├───► [Stage 2] Google Indexing API v3 (Direct Push)
                                  │
[Your Target URLs] ──► Fast Indexer ───► [Stage 3] IndexNow Protocol (Bing / Yandex / Seznam)
                                  │
                                  ├───► [Stage 4] XML-RPC & WebSub Ping Cascade
                                  │
                                  └───► [Stage 5] Headless Chrome Telemetry Visit
```

### 1. Preflight Health & Canonical Verification
Before sending URLs to search engines, Fast Indexer tests each URL with an automated HTTP request. It verifies that the server returns `HTTP 200 OK` and inspects the response body for accidental `<meta name="robots" content="noindex">` directives or broken status codes. This protects your crawl quota and prevents notifying search engines of faulty pages.

### 2. Google Rapid Indexing API v3
Fast Indexer authenticates directly with Google Cloud Platform using an authorized Service Account (`service-account.json`). It submits `URL_UPDATED` notification payloads directly into Google's instant indexing queue. This is the fastest legitimate method to trigger real-time Googlebot crawls.

### 3. IndexNow Protocol
IndexNow is an open protocol initiated by Microsoft Bing, Yandex, and Seznam. With a single HTTP POST request signed with your domain's verification key, Fast Indexer instantly notifies Bing and participating search engines that URLs were added or changed. Crawlers prioritize these URLs within seconds to minutes.

### 4. RSS 2.0 & XML-RPC Ping Cascade
Search engines and content aggregators listen for XML-RPC update pings. Fast Indexer dispatches standard `weblogUpdates.ping` XML payloads to Ping-o-Matic (which rebroadcasts to aggregators) and sends PubSubHubbub / WebSub notifications directly to Google's official WebSub Hub (`pubsubhubbub.appspot.com`).

### 5. Headless Chrome Browser Telemetry
Commercial indexing services frequently rely on synthetic user visits. Fast Indexer launches a local headless Chromium/Chrome instance to visit each target URL. This triggers client-side scripts, Google Analytics / Tag Manager events, and browser telemetry signals, confirming to search engine analytics infrastructure that the page is active and serving traffic.

---

## Features

- **Modern Dark-Mode GUI:** Responsive dashboard built with a focused, readable dark palette.
- **Real-Time Streaming Terminal:** Live execution progress delivered line-by-line using Server-Sent Events (SSE).
- **1-Click Launchers:** Windows `.bat` and PowerShell `.ps1` files to start the server and open the browser automatically.
- **Selective Crawl Vectors:** Run the complete 5-stage rapid indexing pipeline or target specific engines (Google Only, IndexNow Only, Ping Cascade, or Browser Simulation).
- **History & Stats Tracking:** Automatically preserves run history, success metrics, and timestamped logs in `data/history.json`.
- **Zero Heavy Backend Dependencies:** The local server runs on native Node.js HTTP with fallback path resolution.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher.
- Google Chrome installed on your machine (for Stage 5 browser telemetry).

### 1. Clone the Repository
```bash
git clone https://github.com/gusfing/fast-indexer.git
cd fast-indexer
```

### 2. Install Optional Dependencies (if not already globally available)
```bash
npm install
```

### 3. Add Google Service Account Credentials
1. In the Google Cloud Console, enable the **Web Search Indexing API**.
2. Create a Service Account and generate a JSON key.
3. In Google Search Console, add the Service Account email address as a **Verified Owner** of your domain property.
4. Rename your downloaded key file to `service-account.json` and place it in the root folder (see `service-account.sample.json` for reference).

> **Security Note:** `service-account.json` is automatically ignored in `.gitignore` and should never be committed to public repositories.

### 4. Configure IndexNow (Optional / Recommended)
Generate an IndexNow API key and place the verification text file on your domain's root (e.g. `https://yourdomain.com/your-key.txt`). Configure your key in `.env` or in `modules/indexnow.js`.

---

## Running the Application

### Option A: 1-Click Launch (Windows)
Double-click `start.bat` (or right-click `start.ps1` and choose **Run with PowerShell**).  
The script clears any stale local ports, boots the server, and automatically launches `http://localhost:4040` in your default browser.

### Option B: Terminal Command
```bash
node server.js
```
Then visit [http://localhost:4040](http://localhost:4040) in your browser.

---

## Project Structure

```
fast-indexer/
├── start.bat                  # 1-Click Windows batch launcher
├── start.ps1                  # 1-Click PowerShell launcher
├── server.js                  # Local HTTP + SSE streaming server
├── package.json               # Project manifest
├── service-account.sample.json# Template for Google Cloud credentials
├── .env.example               # Example environment variables
├── .gitignore                 # Excludes secrets, logs, and node_modules
├── README.md                  # Documentation and architecture guide
│
├── public/
│   └── index.html             # Web dashboard GUI with live SSE terminal
│
├── modules/
│   ├── preflight.js           # Stage 1: HTTP 200 & noindex verification
│   ├── google-indexer.js      # Stage 2: Google Indexing API v3 client
│   ├── indexnow.js            # Stage 3: IndexNow (Bing/Yandex) dispatcher
│   ├── ping-cascade.js        # Stage 4: XML-RPC & Google WebSub pinger
│   └── browser-ping.js        # Stage 5: Headless Chrome telemetry simulator
│
└── data/
    ├── core-urls.json         # Preset target URLs for 1-click loading
    └── history.json           # Past execution history and metrics
```

---

## API Endpoints

The local server exposes lightweight JSON & SSE endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Serves the web dashboard GUI |
| `/api/status` | `GET` | Returns system credentials and engine availability |
| `/api/core-urls` | `GET` | Loads preset URLs from `data/core-urls.json` |
| `/api/history` | `GET` | Returns past execution runs from `data/history.json` |
| `/api/run` | `POST` | Dispatches URLs and streams live execution logs via SSE |

---

## License

This project is licensed under the [MIT License](LICENSE).
