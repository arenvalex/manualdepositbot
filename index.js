const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbw06sdk4frd1_-2j4UmZXsrjuQ7lvdikyjR-b7MJvJ5Bs6G7DIbBvoO5rp7wV3ZlNbw/exec";

const bot = new TelegramBot(token, { polling: true });

let waitingForInput = {};
let waitingForDelete = {};
let dailyData = {};
let dailyTransactions = {};
let errorCount = {};

const FINANS_GRUP_ID = -1005035282347;

const allowedUsers = [
    8467771210,
    5340962409,
    1382439300,
    8217946285,
    8153108008,
    649401002,
    8139153707,
    1409197362,
    1617214857,
    5236903171,
    8473156805
];

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
    "dream": "Dream",
    "manuel": "Manuel Test"
};

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

async function loadTodayData() {

    const { date } = getDateTime();

    try {

        const response = await fetch(SHEET_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "GET_TODAY",
                date: date
            })
        });

        const data = await response.json();

        if (!data.length) return;

        dailyTransactions[date] = [];
        dailyData[date] = {};

        data.forEach(t => {

            dailyTransactions[date].push(t);

            if (!dailyData[date][t.provider]) {
                dailyData[date][t.provider] = 0;
            }

            dailyData[date][t.provider] += Number(t.amount);

        });

        console.log("Excel verileri RAM'e yüklendi.");

    } catch (err) {

        console.log("Excel load error:", err);

    }
}

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

bot.onText(/\/start/, (msg) => {

    if (!allowedUsers.includes(msg.from.id)) return;

    showMenu(msg.chat.id);

});

/* ================= RAPOR KOMUTU ================= */

bot.onText(/\/rapor/, (msg) => {

    if (!allowedUsers.includes(msg.from.id)) return;

    if (msg.chat.id !== FINANS_GRUP_ID) return;

    const { date } = getDateTime();

    let text = "📊 Günlük Finans Özeti - " + date + "\n\n";

    let total = 0;

    Object.values(providerMap).forEach(provider => {

        let amount = 0;

        if (dailyData[date] && dailyData[date][provider]) {
            amount = dailyData[date][provider];
        }

        total += amount;

        text += provider + ": " + amount + " TRY\n";

    });

    text += "\n💰 Genel Toplam: " + total + " TRY";

    bot.sendMessage(msg.chat.id, text);

});

bot.on("message", async (msg) => {

    if (!msg.text) return;
    if (!allowedUsers.includes(msg.from.id)) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "➕ Ekle") {

        waitingForInput[chatId] = true;
        waitingForDelete[chatId] = false;
        errorCount[chatId] = 0;

        bot.sendMessage(chatId,"Kullanıcı ve tutar yaz:\nörnek: test1 1500");
        return;
    }

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
            bot.sendMessage(chatId,"Bu grup için saha eşleşmesi bulunamadı.");
            return;
        }

        if (!dailyData[date] || !dailyData[date][provider]) {
            bot.sendMessage(chatId,"Bugün bu saha için işlem yok.");
            return;
        }

        let summary = "📊 " + date + " - " + provider + " Özeti\n\n";
        summary += "Toplam: " + dailyData[date][provider] + " TRY\n\n";
        summary += "📝 İşlemler:\n";

        dailyTransactions[date]
        .filter(t => t.provider === provider)
        .forEach(t => {
            summary += "#" + t.id + " | " + t.username + " - " + t.amount + " TRY\n";
        });

        bot.sendMessage(chatId,summary);
        return;
    }

    if (text === "❌ Sil") {

        waitingForDelete[chatId] = true;
        waitingForInput[chatId] = false;

        bot.sendMessage(chatId,"Silmek için ID yaz:");
        return;
    }

    if (waitingForDelete[chatId]) {

        const id = parseInt(text);

        if (isNaN(id)) {
            waitingForDelete[chatId] = false;
            return;
        }

        const { date } = getDateTime();

        await sendToSheet({
            action: "DELETE",
            id: id,
            date: date
        });

        if (dailyTransactions[date]) {

            const deleted = dailyTransactions[date].find(t => t.id === id);

            if (deleted && dailyData[date][deleted.provider]) {
                dailyData[date][deleted.provider] -= Number(deleted.amount);
            }

            dailyTransactions[date] =
            dailyTransactions[date].filter(t => t.id !== id);

        }

        bot.sendMessage(chatId,"#" + id + " silindi ❌");

        waitingForDelete[chatId] = false;
        return;
    }

    if (waitingForInput[chatId]) {

        const parts = text.trim().split(" ");

        if (parts.length !== 2 || isNaN(parts[1])) {

            if (!errorCount[chatId]) {
                errorCount[chatId] = 1;
                bot.sendMessage(chatId,"Hatalı işlem tekrar dene");
                return;
            } else {
                bot.sendMessage(chatId,"İşlem iptal edildi");
                waitingForInput[chatId] = false;
                errorCount[chatId] = 0;
                return;
            }
        }

        errorCount[chatId] = 0;

        const username = parts[0];
        const amount = parseFloat(parts[1]);

        const groupName = normalizeText(msg.chat.title || "");

        let provider = null;

        for (let key in providerMap) {
            if (groupName.includes(key)) {
                provider = providerMap[key];
                break;
            }
        }

        if (!provider) {
            bot.sendMessage(chatId,"Bu grup için saha eşleşmesi bulunamadı.");
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

        bot.sendMessage(chatId,
"#" + id + " | " + username + " " + amount + " TRY " + provider + " manuel eklendi ✅");

        waitingForInput[chatId] = false;
        return;
    }

});

loadTodayData();

function sendDailyFinanceReport() {

    const { date } = getDateTime();

    let text = "📊 Gün Sonu Finans Raporu - " + date + "\n\n";

    let total = 0;

    Object.values(providerMap).forEach(provider => {

        let amount = 0;

        if (dailyData[date] && dailyData[date][provider]) {
            amount = dailyData[date][provider];
        }

        total += amount;

        text += provider + ": " + amount + " TRY\n";

    });

    text += "\n💰 Genel Toplam: " + total + " TRY";

    bot.sendMessage(FINANS_GRUP_ID,text);

}

setInterval(() => {

    const now = new Date().toLocaleTimeString("tr-TR", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit"
    });

    if (now === "23:50") {
        sendDailyFinanceReport();
    }

},60000);
