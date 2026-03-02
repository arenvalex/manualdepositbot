const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwwVLVDH4VJruc5d2gxZ9Z37E3bFBPIJ1_SSd6IbllgaxdrRodsI2mIJMPsh3GwHTI6/exec";

const bot = new TelegramBot(token, { polling: true });

let waitingForInput = {};
let waitingForDelete = {};
let pendingDeposits = {};
let dailyData = {};
let transactions = {};
let transactionId = 1;
let errorCount = {};

/* ✅ SADECE BU 2 KİŞİ KULLANABİLİR */
const allowedUsers = [
    8467771210,
    5340962409
];

/* ✅ GRUP ADINDAN OTOMATİK SAHA EŞLEŞME */
const providerMap = {
    "şahin": "Şahin",
    "jorpay": "Jorpay",
    "master": "Master",
    "karahan": "Karahan",
    "tiktak": "Tiktak",
    "ezel": "Ezel",
    "bizans": "Bizans",
    "garanti": "Garanti QR",
    "cryptobox": "Cryptobox",
    "easy": "Easy",
    "manuel yatırım excel bot": "Manuel Test"
};

/* ================= DELETE AFTER ================= */

function deleteAfter(chatId, messageId, seconds = 60) {
    setTimeout(() => {
        bot.deleteMessage(chatId, messageId).catch(() => {});
    }, seconds * 1000);
}

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
            resize_keyboard: true,
            one_time_keyboard: false
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
    if (!allowedUsers.includes(msg.from.id)) {
        bot.sendMessage(msg.chat.id, "Yetkisiz işlem.");
        return;
    }
    showMenu(msg.chat.id);
});

/* ================= MESSAGE HANDLER ================= */

bot.on("message", async (msg) => {

    if (!allowedUsers.includes(msg.from.id)) {
        bot.sendMessage(msg.chat.id, "Yetkisiz işlem.");
        return;
    }

    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    /* ===== MENU ===== */

    if (text === "➕ Ekle") {

        deleteAfter(chatId, msg.message_id);

        waitingForInput[chatId] = true;
        waitingForDelete[chatId] = false;
        errorCount[chatId] = 0;

        const sent = await bot.sendMessage(chatId,
            "Kullanıcı ve tutar yaz:\nÖrnek: test1 1500"
        );

        deleteAfter(chatId, sent.message_id);
        return;
    }

    if (text === "📊 Özet") {

        deleteAfter(chatId, msg.message_id);

        const today = getDateTime().date;

        if (!dailyData[today]) {
            const sent = await bot.sendMessage(chatId, "Bugün işlem yok.");
            deleteAfter(chatId, sent.message_id);
            return;
        }

        let textMsg = `${today} Özeti:\n\n`;
        let total = 0;

        for (let provider in dailyData[today]) {
            const amount = dailyData[today][provider];
            total += amount;
            textMsg += `${provider}: ${amount} TRY\n`;
        }

        textMsg += `\nToplam: ${total} TRY`;

        const sent = await bot.sendMessage(chatId, textMsg);
        deleteAfter(chatId, sent.message_id);
        return;
    }

    if (text === "❌ Sil") {

        deleteAfter(chatId, msg.message_id);

        waitingForDelete[chatId] = true;
        waitingForInput[chatId] = false;

        const sent = await bot.sendMessage(chatId, "Silmek için ID yaz:");
        deleteAfter(chatId, sent.message_id);
        return;
    }

    /* ===== DEPOSIT INPUT ===== */

    if (waitingForInput[chatId]) {

        deleteAfter(chatId, msg.message_id);

        const parts = text.trim().split(" ");

        if (parts.length !== 2 || isNaN(parts[1])) {

            if (!errorCount[chatId]) {

                errorCount[chatId] = 1;

                const sent = await bot.sendMessage(chatId,
                    "Lan napıyon :D\nFormat yanlış.\n\nörnek: test1 1500\n\nBir de iki işlem yapıcaksın onu da yanlış girme ya :D"
                );

                deleteAfter(chatId, sent.message_id);
                return;

            } else {

                const sent = await bot.sendMessage(chatId,
                    "İşlem iptal edildi. Baştan başla."
                );

                deleteAfter(chatId, sent.message_id);

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
            : msg.from.first_name;

        /* ✅ OTOMATİK SAHA ALGILAMA */
        const groupName = (msg.chat.title || "").toLowerCase();

        let provider = null;

        for (let key in providerMap) {
            if (groupName.includes(key)) {
                provider = providerMap[key];
                break;
            }
        }

        if (!provider) {
            const sent = await bot.sendMessage(chatId, "Bu grup için saha eşleşmesi bulunamadı.");
            deleteAfter(chatId, sent.message_id);
            return;
        }

        const { date, time } = getDateTime();

        if (!dailyData[date]) dailyData[date] = {};
        if (!dailyData[date][provider]) dailyData[date][provider] = 0;

        dailyData[date][provider] += amount;

        const id = transactionId++;

        transactions[id] = {
            date,
            provider,
            amount
        };

        await sendToSheet({
            id,
            date,
            time,
            username,
            amount,
            provider,
            type: "EKLE",
            operator
        });

        const sent = await bot.sendMessage(
            chatId,
            `#${id} | ${username} ${amount} TRY ${provider} eklendi ✅\nEkleyen: ${operator}`
        );

        deleteAfter(chatId, sent.message_id);

        waitingForInput[chatId] = false;
        return;
    }

    /* ===== DELETE INPUT ===== */

    if (waitingForDelete[chatId]) {

        deleteAfter(chatId, msg.message_id);

        const id = parseInt(text);

        if (!transactions[id]) {
            const sent = await bot.sendMessage(chatId, "İşlem bulunamadı.");
            deleteAfter(chatId, sent.message_id);
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

        const sent = await bot.sendMessage(
            chatId,
            `#${id} silindi ❌\nEkleyen: ${operator}`
        );

        deleteAfter(chatId, sent.message_id);
        return;
    }

});
