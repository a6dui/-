const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CHAT_ID = process.env.CHAT_ID || '';
const POLL_INTERVAL_MINUTES = Number(process.env.POLL_INTERVAL_MINUTES || 10);
const HYPE_THRESHOLD = Number(process.env.HYPE_THRESHOLD || 5);

const FEEDS = [
  { name: 'HLTV', url: 'https://www.hltv.org/rss/news' },
  { name: 'ESL Counter-Strike', url: 'https://pro.eslgaming.com/csgo/proleague/feed/' }
];

const HYPE_RULES = [
  { score: 4, words: ['donk', 's1mple', 'zywoo', 'm0nesy', 'niko', 'device', 'navi', 'vitality', 'g2', 'faze', 'spirit'] },
  { score: 3, words: ['major', 'grand final', 'final', 'playoff', 'blast', 'iem', 'katowice', 'cologne', 'шок', 'сенсац'] },
  { score: 2, words: ['transfer', 'bench', 'rumor', 'roster', 'update', 'patch', 'buff', 'nerf', 'скандал'] },
  { score: 1, words: ['match', 'win', 'lose', 'map', 'ancient', 'mirage', 'inferno', 'dust2'] }
];

const HYPE_OPENERS = [
  '🔥 ГАРЯЧЕ по CS2:',
  '🚨 Чат, це зараз підірве сцену:',
  '💣 Оце поворот у CS2:',
  '😮‍💨 Шо коїться, братва:',
  '⚡️ Свіжак, поки всі сплять:'
];

const HYPE_TAUNTS = [
  'Якщо це правда — твітер згорить до ранку 😏',
  'Хто ставив проти цього? Признавайтесь 😅',
  'Пахне драмою і новими мемами 👀',
  'Виглядає так, ніби нас чекає люта заруба 💥',
  'Ну все, аналітикам знову без сну 🫠'
];


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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} для ${url}`));
        res.resume();
        return;
      }

      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (rawData += chunk));
      res.on('end', () => resolve(rawData));
    }).on('error', reject);
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
    console.warn('BOT_TOKEN/CHAT_ID не задані — відправку в Telegram пропущено.');
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
        }
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

    await sendTelegramMessage(formatTelegramNews(news));
    await markAsSent(news);
    console.log(`Відправлено: ${news.title}`);
  }
}

async function runNewsPolling() {
  console.log('Запуск перевірки новин...');
  for (const feed of FEEDS) {
    try {
      await checkFeed(feed);
    } catch (err) {
      console.error(`Помилка фіда ${feed.name}:`, err.message);
    }
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'cs2-news-bot',
    feeds: FEEDS,
    pollIntervalMinutes: POLL_INTERVAL_MINUTES,
    hypeThreshold: HYPE_THRESHOLD
    pollIntervalMinutes: POLL_INTERVAL_MINUTES
  });
});

app.listen(PORT, () => {
  console.log(`CS2 News bot server запущено на http://localhost:${PORT}`);
  runNewsPolling();
  setInterval(runNewsPolling, POLL_INTERVAL_MINUTES * 60 * 1000);
});
