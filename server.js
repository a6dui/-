const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https'); // Import native https module

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Serve static HTML files

// Telegram Bot Credentials (from user input)
const BOT_TOKEN = '8617134849:AAGacGzqtU-wUpGwJr8v-AxsEEsWoVtEKQo';
const CHAT_ID = '755843448';

// Database Setup
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            email TEXT,
            service TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Helper function to send Telegram message
function sendTelegramMessage(messageText) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            chat_id: CHAT_ID,
            text: messageText,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Telegram API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// API Endpoint to handle form submissions
app.post('/api/submit', async (req, res) => {
    try {
        const { name, phone, email, service, project_type, message, details, length } = req.body;
        
        // Normalize fields based on form variations
        const finalName = name || '';
        const finalPhone = phone || '';
        const finalEmail = email || '';
        const finalService = service || project_type || 'Каналізація/Водопровід';
        let finalMessage = message || details || '';
        if (length) {
            finalMessage += `\nДовжина (м): ${length}`;
        }

        // 1. Save to SQLite
        const stmt = db.prepare('INSERT INTO leads (name, phone, email, service, message) VALUES (?, ?, ?, ?, ?)');
        stmt.run([finalName, finalPhone, finalEmail, finalService, finalMessage], function(err) {
            if (err) {
                console.error('SQL Insert Error:', err);
            } else {
                console.log(`Lead saved to DB with ID: ${this.lastID}`);
            }
        });
        stmt.finalize();

        // 2. Format Telegram Message
        let messageText = '<b>🔴 Нова заявка з сайту ВОДТЕПЛОКОМ</b>\n\n';
        if (finalName) messageText += `<b>Ім'я:</b> ${finalName}\n`;
        if (finalPhone) messageText += `<b>Телефон:</b> ${finalPhone}\n`;
        if (finalEmail) messageText += `<b>Email:</b> ${finalEmail}\n`;
        if (finalService) messageText += `<b>Послуга:</b> ${finalService}\n`;
        if (finalMessage) messageText += `<b>Деталі:</b> ${finalMessage}\n`;

        // 3. Send to Telegram
        if (BOT_TOKEN && CHAT_ID) {
            try {
                await sendTelegramMessage(messageText);
                console.log('Sent to Telegram');
            } catch (err) {
                console.error('Failed to send to Telegram:', err);
            }
        }

        res.status(200).json({ success: true, message: 'Заявка успішно збережена та відправлена.' });

    } catch (error) {
        console.error('Server error processing submission:', error);
        res.status(500).json({ success: false, message: 'Внутрішня помилка сервера.' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
