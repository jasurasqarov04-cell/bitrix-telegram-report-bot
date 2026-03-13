# 🤖 Bitrix24 Telegram Report Bot

A production-ready Telegram bot that generates daily lead performance reports from your Bitrix24 CRM. Built with **Node.js**, **Telegraf**, **Axios**, and **node-cron**.

---

## 📋 Features

- 📊 On-demand lead reports: **Today / Yesterday / This Month**
- 🔄 One-tap refresh of any report
- 🏆 All-time managers performance rating
- ⏰ Automatic daily report sent at a configurable time
- 📄 Full Bitrix24 pagination support (handles any number of leads)
- ✅ Error handling with user-friendly Telegram error messages
- 🩺 Health-check HTTP endpoint for uptime monitoring

---

## 🗂️ Project Structure

```
bitrix-telegram-report-bot/
├── app.js                    # Entry point — wires everything together
├── config/
│   └── config.js             # Centralised config + .env validation
├── services/
│   ├── bitrixService.js      # All Bitrix24 REST API calls + pagination
│   └── reportService.js      # Business logic + report formatting
├── telegram/
│   ├── bot.js                # Telegraf bot + all command/button handlers
│   └── keyboards.js          # Inline keyboard definitions
├── jobs/
│   └── dailyReport.js        # node-cron scheduled daily report
├── .env.example              # Template for environment variables
├── package.json
└── README.md
```

---

## ⚙️ Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18 or higher |
| npm | 9 or higher |
| Bitrix24 account | Any paid or free plan |
| Telegram bot token | From @BotFather |

---

## 🚀 Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-org/bitrix-telegram-report-bot.git
cd bitrix-telegram-report-bot
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Configure environment variables

```bash
cp .env.example .env
nano .env   # or use any text editor
```

Fill in all required values (see the [Environment Variables](#-environment-variables) section below).

### Step 4 — Run the bot

```bash
# Development (with auto-restart on file changes)
npm run dev

# Production
npm start
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in the following values:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Your Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `BITRIX_WEBHOOK` | ✅ | Your Bitrix24 REST webhook URL |
| `TELEGRAM_CHAT_ID` | ✅ | Chat ID where automatic reports are sent |
| `PORT` | ❌ | HTTP server port (default: `3000`) |
| `REPORT_HOUR` | ❌ | Hour for the daily report (0–23, default: `9`) |
| `REPORT_MINUTE` | ❌ | Minute for the daily report (0–59, default: `0`) |
| `TIMEZONE` | ❌ | Timezone for the cron scheduler (default: `Asia/Tashkent`) |

### How to get your Bitrix24 Webhook URL

1. Open your Bitrix24 portal
2. Go to **Applications → Webhooks → Add inbound webhook**
3. Grant access to: `crm`, `user`
4. Copy the generated webhook URL
5. It should look like: `https://your-domain.bitrix24.com/rest/1/abc123xyz/`

### How to get your Telegram Chat ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your User ID — use this as `TELEGRAM_CHAT_ID`
3. For group chats: add the bot to the group, then message [@RawDataBot](https://t.me/RawDataBot)

---

## 📊 Report Example

```
📊 Lead report — Today
📅 11.03.2026
👥 Total leads: 32

🥇 Anna Smirnova
   📥 Leads: 14
   🔄 In progress: 6
   ✅ Converted to deal: 4
   📈 Conversion: 28.6%
   ⏱ Avg processing time: 2h 15m

🥈 Ivan Petrov
   📥 Leads: 18
   🔄 In progress: 7
   ✅ Converted to deal: 5
   📈 Conversion: 27.8%
   ⏱ Avg processing time: 1h 42m

🏆 Top manager: Anna Smirnova (28.6% conversion)
```

---

## 🖥️ Deployment on a VPS Server

### Option A — PM2 (recommended)

PM2 is a process manager that keeps your bot running 24/7 and restarts it automatically on crashes or server reboots.

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start app.js --name "bitrix-bot"

# Save the process list so PM2 restarts it on reboot
pm2 save

# Enable PM2 to start on system boot
pm2 startup
# ↑ Follow the command it prints to complete the setup

# Useful PM2 commands
pm2 status              # View running processes
pm2 logs bitrix-bot     # Tail live logs
pm2 restart bitrix-bot  # Restart the bot
pm2 stop bitrix-bot     # Stop the bot
```

### Option B — systemd service

```bash
sudo nano /etc/systemd/system/bitrix-bot.service
```

Paste the following (replace `/home/ubuntu/bitrix-telegram-report-bot` with your actual path):

```ini
[Unit]
Description=Bitrix24 Telegram Report Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/bitrix-telegram-report-bot
ExecStart=/usr/bin/node app.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bitrix-bot
EnvironmentFile=/home/ubuntu/bitrix-telegram-report-bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable bitrix-bot
sudo systemctl start bitrix-bot

# Check status and logs
sudo systemctl status bitrix-bot
sudo journalctl -u bitrix-bot -f
```

### Option C — Docker

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "app.js"]
```

```bash
# Build and run
docker build -t bitrix-bot .
docker run -d --name bitrix-bot --env-file .env bitrix-bot
```

---

## 🔬 Health Check

The bot exposes a health endpoint for uptime monitors:

```
GET http://your-server-ip:3000/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-03-11T09:00:00.000Z",
  "timezone": "Asia/Tashkent",
  "reportSchedule": "09:00"
}
```

---

## 🧩 Extending the Bot

The architecture is designed for easy extension. Here are the most common additions:

### Add a filter by manager
In `reportService.js`, the `generateReport()` function already accepts an `options` object:
```js
// Pass specific manager IDs to filter the report
await reportService.generateReport(range, 'Today', { managerIds: ['42', '87'] });
```
Add a button in `keyboards.js` and a handler in `bot.js` that presents a list of managers to choose from.

### Add a filter by lead source
Add `SOURCE_ID` to the `SELECT` array in `bitrixService.getLeads()`, then filter in `reportService.generateReport()` using `options.sources`.

### Add weekly reports
In `jobs/dailyReport.js`, add a second `cron.schedule()`:
```js
cron.schedule('0 9 * * 1', runWeeklyReport, { timezone }); // Every Monday 09:00
```

### Export to Excel
Install `exceljs`, create `services/excelService.js` that accepts the same `stats` array produced by `reportService`, and wire it to a new bot button.

---

## 🛠️ Tech Stack

| Library | Purpose |
|---|---|
| [Telegraf](https://telegraf.js.org/) | Telegram Bot framework |
| [Axios](https://axios-http.com/) | HTTP client for Bitrix24 REST API |
| [node-cron](https://github.com/node-cron/node-cron) | Cron scheduler for daily reports |
| [Express](https://expressjs.com/) | HTTP server (health-check + future API) |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variable management |

---

## 📄 License

MIT
