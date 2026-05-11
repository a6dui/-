# CS2 News Channel Bot (UA)

Проєкт для автоматичного новинного каналу по Counter-Strike 2:
- регулярно перевіряє RSS-стрічки;
- відправляє нові новини в Telegram-бота;
- не дублює вже відправлені новини (SQLite);
- текст і службові повідомлення — українською.

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
```

3. Запустити:
```bash
node server.js
```

## Health check

`GET /health`
