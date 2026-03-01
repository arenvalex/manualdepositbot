const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwwVLVDH4VJruc5d2gxZ9Z37E3bFBPIJ1_SSd6IbllgaxdrRodsI2mIJMPsh3GwHTI6/exec";

const bot = new TelegramBot(token, { polling: true });

let pendingDeposits = {};
let dailyData = {};
let transactions = {};
let transactionId = 1;

/* ================= DATE ================= */

function getDateTime() {
    const now = new Date();
    return {
        date: now.toLocaleDateString("tr-TR"),
        time: now.toLocaleTimeString("tr-TR")
    };
}

/* ================= MENU ================= */

function showMenu(chatId) {
    bot.sendMessage(chatId, "📌 Manuel Deposit Panel", {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "➕ Ekle",
                        switch_inline_query_current_chat: "/ekle "
                    }
                ],
                [
                    {
                        text: "📊 Özet",
                        switch_inline_query_current_chat: "/ozet"
                    }
                ],
                [
                    {
                        text: "❌ Sil",
                        switch_inline_query_current_chat: "/sil "
                    }
                ]
            ]
        }
    });
}

/* ================= SHEET ================= */

async function sendToSheet(data) {
    await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
    showMenu(msg.chat.id);
});

/* ================= EKLE ================= */

bot.onText(/\/ekle (.+) (.+)/, (msg, match) => {

    const chatId = msg.chat.id;
    const username = match[1];
    const amount = parseFloat(match[2]);

    const operator = msg.from.username
        ? "@" + msg.from.username
        : msg.from.first_name;

    pendingDeposits[chatId] = { username, amount, operator };

    bot.sendMessage(chatId, "Saha seçin:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Şahin", callback_data: "Şahin" }],
                [{ text: "Jorpay", callback_data: "Jorpay" }],
                [{ text: "Master", callback_data: "Master" }],
                [{ text: "Karahan", callback_data: "Karahan" }],
                [{ text: "Tiktak", callback_data: "Tiktak" }],
                [{ text: "Ezel", callback_data: "Ezel" }],
                [{ text: "Bizans", callback_data: "Bizans" }],
                [{ text: "Güvenli QR", callback_data: "Güvenli QR" }],
                [{ text: "Cryptobox", callback_data: "Cryptobox" }],
                [{ text: "Easy", callback_data: "Easy" }]
            ]
        }
    });
});

/* ================= CALLBACK ================= */

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    const deposit = pendingDeposits[chatId];

    if (!deposit) return;

    const provider = data;
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

    bot.deleteMessage(chatId, query.message.message_id);

    bot.sendMessage(
        chatId,
        `#${id} | ${deposit.username} ${deposit.amount} TRY ${provider} eklendi ✅
Yapan: ${deposit.operator}`
    );

    delete pendingDeposits[chatId];
});

/* ================= SIL ================= */

bot.onText(/\/sil (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const id = parseInt(match[1]);

    const operator = msg.from.username
        ? "@" + msg.from.username
        : msg.from.first_name;

    if (!transactions[id]) {
        return bot.sendMessage(chatId, "İşlem bulunamadı.");
    }

    const { date, provider, amount } = transactions[id];
    const { time } = getDateTime();

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

    bot.sendMessage(
        chatId,
        `#${id} silindi ❌
Yapan: ${operator}`
    );
});

/* ================= OZET ================= */

bot.onText(/\/ozet/, (msg) => {

    const chatId = msg.chat.id;
    const today = new Date().toLocaleDateString("tr-TR");

    if (!dailyData[today]) {
        return bot.sendMessage(chatId, "Bugün işlem yok.");
    }

    let text = `${today} Özeti:\n\n`;
    let total = 0;

    for (let provider in dailyData[today]) {
        const amount = dailyData[today][provider];
        total += amount;
        text += `${provider}: ${amount} TRY\n`;
    }

    text += `\nToplam: ${total} TRY`;

    bot.sendMessage(chatId, text);
});
