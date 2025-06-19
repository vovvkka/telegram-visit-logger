import 'dotenv/config';
import cors from "cors";
import express, {Request, Response} from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в переменных окружения');
    process.exit(1);
}

interface VisitPayload {
    userAgent: string;
    referrer?: string;
}

interface GeoInfo {
    success: boolean;
    country: string;
    city: string;
}

function getClientIp(req: Request): any {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string') {
        return xForwardedFor.split(',')[0].trim();
    }
    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
        return xForwardedFor[0].trim();
    }

    return req.ip;
}

async function getGeoInfo(ip: string): Promise<{ country: string; city: string }> {
    try {
        const res = await fetch(`https://ipwho.is/${ip}`);
        const data = (await res.json()) as GeoInfo;

        if (!data.success) {
            return {country: 'Неизвестно', city: 'Неизвестно'};
        }

        return {
            country: data.country,
            city: data.city,
        };
    } catch {
        return {country: 'Ошибка', city: 'Ошибка'};
    }
}

async function sendTelegramMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
        }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error('Ошибка при отправке сообщения в Telegram:', errorText);
    }
}

app.post('/log-visit', async (req: Request<{}, {}, VisitPayload>, res: Response) => {
    try {
        const ip = getClientIp(req);
        const geo = await getGeoInfo(ip);
        const {userAgent, referrer} = req.body;

        const now = new Date().toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const message = `
<b>Новый визит</b>
🕒 Время: ${now}
📍 Страна: ${geo.country}, Город: ${geo.city}
🌐 IP: ${ip}
💻 User-Agent: ${userAgent}
🔗 Реферер: ${referrer || 'нет'}
`.trim();

        await sendTelegramMessage(message);
        res.json({status: 'ok'});
    } catch (error) {
        console.error(error);
        res.status(500).json({status: 'error'});
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
