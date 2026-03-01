const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwwVLVDH4VJruc5d2gxZ9Z37E3bFBPIJ1_SSd6IbllgaxdrRodsI2mIJMPsh3GwHTI6/exec";

const bot = new TelegramBot(token, { polling: true });

let waitingForInput = {};
let waitingForDelete = {};
let pendingDeposits = {};
let transactions = {};
let dailyData = {};
let transactionId = 1;

/* ================= ISTANBUL DATE ================= */

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

/* ================= MENU ================= */

function showMenu(chatId) {
    bot.sendMessage(chatId, "📌 Manuel Deposit Panel", {
        reply_markup: {
            keyboard: [
                ["➕ Ekle", "📊 Özet"],
                ["❌ Sil"]
            ],
            resize_keyboard: true
        }
    });
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

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
    showMenu(msg.chat.id);
});

/* ================= MESSAGE ================= */

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (text === "➕ Ekle") {
        waitingForInput[chatId] = true;
        waitingForDelete[chatId] = false;

        bot.sendMessage(chatId, "Kullanıcı + tutar yaz.\nörnek: test1 1500");
        return;
    }

    if (text === "📊 Özet") {

        const today = getDateTime().date;

        if (!dailyData[today]) {
            bot.sendMessage(chatId, "Bugün işlem yok.");
            return;
        }

        let total = 0;
        let summary = `${today} Özeti:\n\n`;

        for (let provider in dailyData[today]) {
            const amount = dailyData[today][provider];
            total += amount;
            summary += `${provider}: ${amount} TRY\n`;
        }

        summary += `\nToplam: ${total} TRY`;

        bot.sendMessage(chatId, summary);
        return;
    }

    if (text === "❌ Sil") {
        waitingForDelete[chatId] = true;
        waitingForInput[chatId] = false;

        bot.sendMessage(chatId, "Silmek için ID yaz.");
        return;
    }

    /* ===== DEPOSIT INPUT ===== */

    if (waitingForInput[chatId]) {

        const parts = text.trim().split(" ");

        if (parts.length !== 2 || isNaN(parts[1])) {
            bot.sendMessage(chatId,
                "Lan napıyon :D\nFormat yanlış.\n\nörnek: test1 1500\n\nBir de iki işlem yapıcaksın onu da yanlış girme ya :D"
            );
            return;
        }

        const username = parts[0];
        const amount = parseFloat(parts[1]);

        const operator = msg.from.username
            ? "@" + msg.from.username
            : msg.from.first_name;

        pendingDeposits[chatId] = { username, amount, operator };
        waitingForInput[chatId] = false;

        bot.sendMessage(chatId, "Saha seç:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Şahin", callback_data: "Şahin" }],
                    [{ text: "Jorpay", callback_data: "Jorpay" }],
                    [{ text: "Master", callback_data: "Master" }],
                    [{ text: "Karahan", callback_data: "Karahan" }]
                ]
            }
        });

        return;
    }

    /* ===== DELETE INPUT ===== */

    if (waitingForDelete[chatId]) {

        const id = parseInt(text);

        if (!transactions[id]) {
            bot.sendMessage(chatId, "İşlem bulunamadı.");
            return;
        }

        const { date, provider, amount } = transactions[id];
        const { time } = getDateTime();

        const operator = msg.from.username
            ? "@" + msg.from.username
            : msg.from.first_name;

        dailyData[date][provider] -= amount;

        await sendToSheet({
            id,
            date,
            time,
            username: "-",
            amount: -amount,
            provider,
            type: "SIL",
            operator
        });

        delete transactions[id];
        waitingForDelete[chatId] = false;

        bot.sendMessage(chatId, `#${id} silindi.`);
        return;
    }

});

/* ================= PROVIDER SELECT ================= */

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const provider = query.data;

    const deposit = pendingDeposits[chatId];
    if (!deposit) return;

    const { date, time } = getDateTime();

    if (!dailyData[date]) dailyData[date] = {};
    if (!dailyData[date][provider]) dailyData[date][provider] = 0;

    dailyData[date][provider] += deposit.amount;

    const id = transactionId++;

    transactions[id] = {
        date,
        provider,
        amount: deposit.amount
    };

    await sendToSheet({
        id,
        date,
        time,
        username: deposit.username,
        amount: deposit.amount,
        provider,
        type: "EKLE",
        operator: deposit.operator
    });

    bot.sendMessage(
        chatId,
        `#${id} | ${deposit.username} ${deposit.amount} TRY ${provider} eklendi.\nEkleyen: ${deposit.operator}\nSaat: ${time}`
    );

    delete pendingDeposits[chatId];
});
