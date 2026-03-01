const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwwVLVDH4VJruc5d2gxZ9Z37E3bFBPIJ1_SSd6IbllgaxdrRodsI2mIJMPsh3GwHTI6/exec";

const bot = new TelegramBot(token, { polling: true });

let waitingForInput = {};
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
                [{ text: "➕ Ekle", callback_data: "menu_ekle" }],
                [{ text: "📊 Özet", callback_data: "menu_ozet" }],
                [{ text: "❌ Sil", callback_data: "menu_sil" }]
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

/* ================= CALLBACK ================= */

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    /* ===== MENU BUTTONS ===== */

    if (data === "menu_ekle") {
        waitingForInput[chatId] = true;
        return bot.sendMessage(chatId, "Kullanıcı ve tutar yaz:\nÖrnek: test1 1500");
    }

    if (data === "menu_ozet") {

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

        return bot.sendMessage(chatId, text);
    }

    if (data === "menu_sil") {
        return bot.sendMessage(chatId, "Silmek için ID yaz:\nÖrnek: 3");
    }

    /* ===== PROVIDER SELECTION ===== */

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
Ekleyen: ${deposit.operator}`
    );

    delete pendingDeposits[chatId];
});

/* ================= MESSAGE HANDLER ================= */

bot.on("message", (msg) => {

    const chatId = msg.chat.id;

    if (!msg.text) return;

    /* Kullanıcı tutar giriş bekleniyorsa */

    if (waitingForInput[chatId]) {

        const parts = msg.text.trim().split(" ");

        if (parts.length === 2 && !isNaN(parts[1])) {

            const username = parts[0];
            const amount = parseFloat(parts[1]);

            const operator = msg.from.username
                ? "@" + msg.from.username
                : msg.from.first_name;

            pendingDeposits[chatId] = { username, amount, operator };

            waitingForInput[chatId] = false;

            return bot.sendMessage(chatId, "Saha seçin:", {
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
        }
        else {
            return bot.sendMessage(chatId, "Format yanlış.\nÖrnek: test1 1500");
        }
    }
});
