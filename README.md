# VotePlease

A civic information agent for Grambling, Louisiana. Every Monday morning it scrapes local news and civic resources, generates an AI-powered summary with Claude, and sends it by SMS to all subscribers via Twilio. Users can also reply to any message and get instant AI-powered Q&A about local news, voting, and upcoming events.

## Features

- **Weekly Monday SMS digest** — automatically scraped and summarized
- **Interactive Q&A** — reply to any message and the AI answers
- **Self-service subscribe/unsubscribe** — reply STOP / START
- **7 civic sources** scraped concurrently
- **Conversation history** — Claude remembers recent context per user
- **Admin API** — trigger digests manually, manage subscribers

## Civic Sources

| Source                       | URL                                                       |
| ---------------------------- | --------------------------------------------------------- |
| Grambling City News          | cityofgrambling.org                                       |
| City Facebook Page           | facebook.com/City-of-Grambling _(requires Graph API key)_ |
| Lincoln Parish Calendar      | lincolnparish.org/calendar                                |
| Lincoln Parish News          | lincolnparish.org/news                                    |
| Louisiana Secretary of State | sos.la.gov                                                |
| Power Coalition              | powercoalition.org                                        |
| Power Coalition GOTV         | powercoalition.org/get-out-the-vote                       |

## Quick Start

### Install dependencies

```bash
npm install
```

### Run

```bash
npm start
```

The server starts on port 3000 and schedules the Monday digest automatically.

## Facebook Graph API

The Facebook scraper is disabled by default because Facebook requires auth.
To enable it:

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
2. Add the **Pages** product
3. Get a **Page Access Token** for the City of Grambling page
4. Find the page's numeric ID (use the Graph API Explorer)
5. Add to `.env`:
   ```
   FB_PAGE_ID=123456789
   FB_PAGE_ACCESS_TOKEN=EAA...
   ```

## API Endpoints

### Public

| Method | Path      | Description                     |
| ------ | --------- | ------------------------------- |
| `POST` | `/sms`    | Twilio inbound webhook          |
| `GET`  | `/health` | Health check + subscriber count |

### Admin (requires `x-admin-key` header)

| Method | Path               | Description                      |
| ------ | ------------------ | -------------------------------- |
| `POST` | `/admin/trigger`   | Manually run the weekly pipeline |
| `GET`  | `/admin/users`     | List all users                   |
| `POST` | `/admin/subscribe` | Subscribe a phone number         |
| `POST` | `/admin/send`      | Send a custom SMS to a user      |

**Example — manually trigger digest:**

```bash
curl -X POST http://localhost:3000/admin/trigger \
  -H "x-admin-key: your_admin_key"
```

**Example — subscribe a number:**

```bash
curl -X POST http://localhost:3000/admin/subscribe \
  -H "x-admin-key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+13185551234"}'
```

## SMS Commands (user-facing)

| Message       | Effect               |
| ------------- | -------------------- |
| `STOP`        | Unsubscribe          |
| `START`       | Re-subscribe         |
| `HELP`        | Show info message    |
| Anything else | AI-powered civic Q&A |

## Project Structure

```
votePlease/
├── src/
│   ├── scrapers/
│   │   ├── index.js           # Orchestrator — runs all scrapers
│   │   ├── grambling.js       # cityofgrambling.org
│   │   ├── gramblingFacebook.js  # Facebook Graph API
│   │   ├── lincolnCalendar.js # lincolnparish.org/calendar
│   │   ├── lincolnNews.js     # lincolnparish.org/news
│   │   ├── sos.js             # sos.la.gov
│   │   ├── powerCoalition.js  # powercoalition.org
│   │   └── gotv.js            # powercoalition.org/get-out-the-vote
│   ├── agent/
│   │   └── index.js           # OpenAI agent (digest generation + Q&A)
│   ├── sms/
│   │   └── index.js           # Twilio wrapper + broadcast
│   ├── db/
│   │   └── index.js           # Supabase (users + conversation history)
│   ├── scheduler/
│   │   └── index.js           # Monday cron job
│   └── index.js               # Express server + webhook handler
├── data/                      # Local scraped payload cache (optional)
├── .env.example
└── package.json
```

## Technology Stack

| Layer        | Technology                                      |
| ------------ | ----------------------------------------------- |
| AI Agent     | OpenAI via `openai`                             |
| SMS          | Twilio via `twilio`                             |
| Web Scraping | `axios` + `cheerio`                             |
| Database     | Supabase (Postgres) via `@supabase/supabase-js` |
| Scheduler    | `node-cron`                                     |
| Web Server   | `express`                                       |
