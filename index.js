const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbw5v5BD_g39znoB_9AvPb-NKPw8sq56sb6H5zorA933uioStPiX0ie_CzFerHznyjI/exec";

const bot = new TelegramBot(token, { polling: true });

let waitingForInput = {};
let waitingForDelete = {};
let dailyData = {};
let dailyTransactions = {};
let errorCount = {};

/* ✅ WHITELIST */
const allowedUsers = [
    8467771210,
    5340962409,
    1382439300,
    8217946285,
    8153108008,
    649401002,
    8139153707,
    1409197362,
    8473156805
];

/* ================= TÜRKÇE NORMALIZE ================= */

function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c");
}

/* ================= PROVIDER MAP ================= */

const providerMap = {
    "sahin": "Şahin",
    "jorpay": "Jorpay",
    "master": "Master",
    "karahan": "Karahan",
    "tiktak": "Tiktak",
    "ezel": "Ezel",
    "bizans": "Bizans",
    "garanti": "Garanti QR",
    "cryptobox": "Cryptobox",
    "easy": "Easy",
    "manuel": "Manuel Test"
};

/* ================= DATE ================= */

function getDateTime() {
    const now = new Date();

    const date = now.toLocaleDateString("tr-TR", {
        timeZone: "Europe/Istanbul",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const time = now.toLocaleTimeString("tr-TR", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    return { date, time };
}

/* ================= GÜNLÜK ID ================= */

async function getNextId(date) {
    try {
        const response = await fetch(SHEET_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "GET_NEXT_ID",
                date: date
            })
        });

        const data = await response.json();

        if (!data.id || isNaN(data.id)) {
            return 1;
        }

        return data.id;

    } catch (err) {
        console.log("ID fetch error:", err);
        return 1;
    }
}

/* ================= SHEET ================= */

async function sendToSheet(data) {
    try {
        await fetch(SHEET_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
    } catch (err) {
        console.log("Sheet Error:", err);
    }
}

/* ================= MENU ================= */

function showMenu(chatId) {
    bot.sendMessage(chatId, "📌 Manuel Deposit Panel", {
        reply_markup: {
            keyboard: [
                ["➕ Ekle", "📊 Özet"],
                ["❌ Sil"]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
}

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
    if (!allowedUsers.includes(msg.from.id)) {
        bot.sendMessage(msg.chat.id, "Yetkisiz işlem.");
        return;
    }
    showMenu(msg.chat.id);
});

/* ================= MESSAGE ================= */

bot.on("message", async (msg) => {

    if (!msg.text) return;

    if (!allowedUsers.includes(msg.from.id)) {
        return; // Sessiz ignore
    }

    const chatId = msg.chat.id;
    const text = msg.text;

    /* ===== EKLE ===== */

    if (text === "➕ Ekle") {
        waitingForInput[chatId] = true;
        waitingForDelete[chatId] = false;
        errorCount[chatId] = 0;

        const sent = await bot.sendMessage(
            chatId,
            "Kullanıcı ve tutar yaz:\nörnek: test1 1500"
        );

        setTimeout(() => {
            bot.deleteMessage(chatId, sent.message_id).catch(() => {});
        }, 20000);

        return;
    }
    
    /* ===== ÖZET ===== */

    if (text === "📊 Özet") {

        const { date } = getDateTime();
        const groupName = normalizeText(msg.chat.title || "");

        let provider = null;
        for (let key in providerMap) {
            if (groupName.includes(key)) {
                provider = providerMap[key];
                break;
            }
        }

        if (!provider) {
            bot.sendMessage(chatId, "Bu grup için saha eşleşmesi bulunamadı.");
            return;
        }

        if (!dailyData[date] || !dailyData[date][provider]) {
            bot.sendMessage(chatId, "Bugün bu saha için işlem yok.");
            return;
        }

        let summary = `📊 ${date} - ${provider} Özeti\n\n`;
        summary += `Toplam: ${dailyData[date][provider]} TRY\n\n`;
        summary += "📝 İşlemler:\n";

        dailyTransactions[date]
            .filter(t => t.provider === provider)
            .forEach(t => {
                summary += `#${t.id} | ${t.username} - ${t.amount} TRY\n`;
            });

        bot.sendMessage(chatId, summary);
        return;
    }

    /* ===== SİL ===== */

    if (text === "❌ Sil") {
        waitingForDelete[chatId] = true;
        waitingForInput[chatId] = false;
        bot.sendMessage(chatId, "Silmek için ID yaz:");
        return;
    }

    /* ===== DELETE INPUT ===== */

    if (waitingForDelete[chatId]) {

        const id = parseInt(text);

        if (isNaN(id)) {
            waitingForDelete[chatId] = false;
            return;
        }

        await sendToSheet({
            action: "DELETE",
            id: id
        });

        // RAM temizle
        Object.keys(dailyTransactions).forEach(date => {
            dailyTransactions[date] =
                dailyTransactions[date].filter(t => t.id !== id);
        });

        Object.keys(dailyData).forEach(date => {
            Object.keys(dailyData[date]).forEach(provider => {

                let total = 0;

                if (dailyTransactions[date]) {
                    dailyTransactions[date]
                        .filter(t => t.provider === provider)
                        .forEach(t => total += t.amount);
                }

                dailyData[date][provider] = total;
            });
        });

        bot.sendMessage(chatId, `#${id} silindi ❌`);

        waitingForDelete[chatId] = false;
        return;
    }

    /* ===== DEPOSIT ===== */

    if (waitingForInput[chatId]) {

        const parts = text.trim().split(" ");

        if (parts.length !== 2 || isNaN(parts[1])) {

            if (!errorCount[chatId]) {
                errorCount[chatId] = 1;
                bot.sendMessage(chatId, "Hatalı işlem, tekrar dene!");
                return;
            } else {
                bot.sendMessage(chatId, "İşlem iptal edildi.");
                waitingForInput[chatId] = false;
                errorCount[chatId] = 0;
                return;
            }
        }

        errorCount[chatId] = 0;

        const username = parts[0];
        const amount = parseFloat(parts[1]);

        const operator = msg.from.username
            ? "@" + msg.from.username
            : msg.from.first_name || "Bilinmiyor";

        const groupName = normalizeText(msg.chat.title || "");

        let provider = null;
        for (let key in providerMap) {
            if (groupName.includes(key)) {
                provider = providerMap[key];
                break;
            }
        }

        if (!provider) {
            bot.sendMessage(chatId, "Bu grup için saha eşleşmesi bulunamadı.");
            return;
        }

        const { date, time } = getDateTime();
        const id = await getNextId(date);

        if (!dailyData[date]) {
            dailyData[date] = {};
            dailyTransactions[date] = [];
        }

        if (!dailyData[date][provider])
            dailyData[date][provider] = 0;

        dailyData[date][provider] += amount;

        dailyTransactions[date].push({
            id,
            username,
            amount,
            provider
        });

        await sendToSheet({
            id,
            date,
            time,
            username,
            amount,
            provider,
            type: "EKLE"
        });

        await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

        bot.sendMessage(
            chatId,
            `#${id} | ${username} ${amount} TRY ${provider} manuel eklendi ✅\nEkleyen: ${operator}`
        );

        waitingForInput[chatId] = false;
        return;
    }

});
