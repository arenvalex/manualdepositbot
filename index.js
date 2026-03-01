const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwwVLVDH4VJruc5d2gxZ9Z37E3bFBPIJ1_SSd6IbllgaxdrRodsI2mIJMPsh3GwHTI6/exec";

const bot = new TelegramBot(token, { polling: true });

let pendingDeposits = {};
let dailyData = {};
let transactions = {};
let transactionId = 1;

function getDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString("tr-TR");
    const time = now.toLocaleTimeString("tr-TR");
    return { date, time };
}

async function sendToSheet(data) {
    await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

bot.onText(/\/ekle (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    const amount = parseFloat(match[2]);

    pendingDeposits[chatId] = { username, amount };

    const options = {
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
    };

    bot.sendMessage(chatId, "Saha seçin:", options);
});

bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;

    const data = pendingDeposits[chatId];
    if (!data) return;

    const provider = callbackQuery.data;
    const { date, time } = getDateTime();

    if (!dailyData[date]) dailyData[date] = {};
    if (!dailyData[date][provider]) dailyData[date][provider] = 0;

    dailyData[date][provider] += data.amount;

    const id = transactionId++;

    transactions[id] = {
        date,
        provider,
        amount: data.amount
    };

    await sendToSheet({
        id,
        date,
        time,
        username: data.username,
        amount: data.amount,
        provider,
        type: "EKLE"
    });

    bot.deleteMessage(chatId, msg.message_id);

    bot.sendMessage(
        chatId,
        `#${id} | ${data.username} ${data.amount} TRY ${provider} sahasına eklendi ✅`
    );

    delete pendingDeposits[chatId];
});

bot.onText(/\/sil (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const id = parseInt(match[1]);

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
        type: "SIL"
    });

    delete transactions[id];

    bot.sendMessage(chatId, `#${id} numaralı işlem silindi ❌`);
});

bot.onText(/\/ozet/, (msg) => {
    const chatId = msg.chat.id;
    const today = new Date().toLocaleDateString("tr-TR");

    if (!dailyData[today]) {
        return bot.sendMessage(chatId, "Bugün henüz manuel yatırım yok.");
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
