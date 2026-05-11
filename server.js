const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
function loadEnvFile() {
  const envPath = path.resolve(__dirname, '.env');
  if (!require('fs').existsSync(envPath)) return;

  const raw = require('fs').readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CHAT_ID = process.env.CHAT_ID || '';
const POLL_INTERVAL_MINUTES = Number(process.env.POLL_INTERVAL_MINUTES || 10);
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15000);

const FEEDS = [
  { name: 'HLTV', url: 'https://www.hltv.org/rss/news' },
  { name: 'Dust2.us', url: 'https://www.dust2.us/rss/news' },
  { name: 'ESL Counter-Strike', url: 'https://pro.eslgaming.com/csgo/proleague/feed/' }
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Помилка підключення БД:', err.message);
    return;
  }

  db.run(`CREATE TABLE IF NOT EXISTS sent_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE,
    title TEXT,
    link TEXT,
    source TEXT,
    published_at TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('SQLite готова до роботи.');
});

function httpGet(url, redirectCount = 0) {
  const client = url.startsWith('http://') ? http : https;

  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'CS2NewsBot/1.1 (+https://localhost)'
        },
        timeout: HTTP_TIMEOUT_MS
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(httpGet(redirectUrl, redirectCount + 1));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} для ${url}`));
          res.resume();
          return;
        }

        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => resolve(rawData));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout ${HTTP_TIMEOUT_MS}ms для ${url}`));
    });
    req.on('error', reject);
  });
}

function stripCdata(v = '') {
  return v.replace('<![CDATA[', '').replace(']]>', '').trim();
}

function parseTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripCdata(match[1]) : '';
}

function parseRssItems(xml) {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return items
    .map((itemXml) => {
      const title = parseTag(itemXml, 'title');
      const link = parseTag(itemXml, 'link');
      const guid = parseTag(itemXml, 'guid') || link || title;
      const pubDate = parseTag(itemXml, 'pubDate');
      const description = parseTag(itemXml, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      return { title, link, guid, pubDate, description };
    })
    .filter((item) => item.title && item.link && item.guid);
}

function scoreHype(news) {
  const txt = `${news.title} ${news.description || ''}`.toLowerCase();
  let score = 0;

  HYPE_RULES.forEach((rule) => {
    if (rule.words.some((w) => txt.includes(w))) {
      score += rule.score;
    }
  });

  if (/!/.test(news.title)) score += 1;
  if (/[A-Z]{3,}/.test(news.title)) score += 1;

  return score;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanupTitle(title = '') {
  return title.replace(/\s+/g, ' ').trim();
}

function formatHypeMessage(news) {
  const headline = cleanupTitle(news.title);
  return [
    pick(HYPE_OPENERS),
    '',
    `🎮 ${headline}`,
    '',
    pick(HYPE_TAUNTS)
  ].join('\n');
}

  return items.map((itemXml) => {
    const title = parseTag(itemXml, 'title');
    const link = parseTag(itemXml, 'link');
    const guid = parseTag(itemXml, 'guid') || link || title;
    const pubDate = parseTag(itemXml, 'pubDate');

    return { title, link, guid, pubDate };
  }).filter((item) => item.title && item.link && item.guid);
}

function isAlreadySent(guid) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM sent_news WHERE guid = ?', [guid], (err, row) => {
      if (err) reject(err);
      else resolve(Boolean(row));
    });
  });
}

function markAsSent(news) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO sent_news (guid, title, link, source, published_at) VALUES (?, ?, ?, ?, ?)',
      [news.guid, news.title, news.link, news.source, news.pubDate || null],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function sendTelegramMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('BOT_TOKEN/CHAT_ID не задані — режим автономного збору: новина збережеться в БД без Telegram.');
    return Promise.resolve();
  }

  const postData = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
    disable_web_page_preview: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: HTTP_TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Telegram API помилка: ${res.statusCode}, ${data}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout ${HTTP_TIMEOUT_MS}ms Telegram API`));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function checkFeed(feed) {
  const xml = await httpGet(feed.url);
  const items = parseRssItems(xml);

  for (const item of items.reverse()) {
    const news = { ...item, source: feed.name };
    const exists = await isAlreadySent(news.guid);
    if (exists) continue;

    const hypeScore = scoreHype(news);
    if (hypeScore < HYPE_THRESHOLD) {
      await markAsSent(news);
      console.log(`Пропущено як не-хайп: ${news.title} (score=${hypeScore})`);
      continue;
    }

    await sendTelegramMessage(formatHypeMessage(news));
    await markAsSent(news);
    console.log(`Відправлено хайп: ${news.title} (score=${hypeScore})`);
  }
}

function formatTelegramNews(news) {
  return [
    '📰 <b>Нова новина по CS2</b>',
    '',
    `<b>Джерело:</b> ${news.source}`,
    `<b>Заголовок:</b> ${news.title}`,
    `<b>Посилання:</b> ${news.link}`,
    news.pubDate ? `<b>Опубліковано:</b> ${news.pubDate}` : ''
  ].filter(Boolean).join('\n');
}

async function checkFeed(feed) {
  const xml = await httpGet(feed.url);
  const items = parseRssItems(xml);

  for (const item of items.reverse()) {
    const news = { ...item, source: feed.name };
    const exists = await isAlreadySent(news.guid);
    if (exists) continue;

    try {
      await sendTelegramMessage(formatTelegramNews(news));
      await markAsSent(news);
      console.log(`Оброблено: ${news.title}`);
    } catch (err) {
      console.error(`Помилка відправки новини: ${err.message}`);
    }
  }
}

let isPolling = false;
async function runNewsPolling() {
  if (isPolling) {
    console.warn('Попередній цикл ще виконується — цей цикл пропущено.');
    return;
  }

  isPolling = true;
  console.log('Запуск перевірки новин...');
  try {
    for (const feed of FEEDS) {
      try {
        await checkFeed(feed);
      } catch (err) {
        console.error(`Помилка фіда ${feed.name}:`, err.message);
      }
    }
  } finally {
    isPolling = false;
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'cs2-news-bot',
    feeds: FEEDS,
    pollIntervalMinutes: POLL_INTERVAL_MINUTES,
    autonomousMode: !BOT_TOKEN || !CHAT_ID
  });
});

app.listen(PORT, () => {
  console.log(`CS2 News bot server запущено на http://localhost:${PORT}`);
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('BOT_TOKEN/CHAT_ID не задані. Бот працює автономно: збирає й записує новини в SQLite.');
  }
  runNewsPolling();
  setInterval(runNewsPolling, POLL_INTERVAL_MINUTES * 60 * 1000);
});
