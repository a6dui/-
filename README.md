# CS2 News Channel Bot (UA)

Проєкт для автоматичного новинного каналу по Counter-Strike 2:
- регулярно перевіряє RSS-стрічки;
- відправляє в Telegram тільки хайпові новини (фільтр по score);
- не дублює вже відправлені новини (SQLite);
- стиль повідомлень — більш паблік/мемний українською (без обов'язкових посилань/джерела).

## Запуск

1. Встановити залежності:
```bash
npm install
```

2. Задати змінні середовища:
```bash
export BOT_TOKEN="<telegram_bot_token>"
export CHAT_ID="<telegram_chat_id>"
export POLL_INTERVAL_MINUTES=10
export HYPE_THRESHOLD=5
```

3. Запустити:
```bash
node server.js
```

## Health check

`GET /health`
