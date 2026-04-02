const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbzcpUafU7zAewaz1_PitM8wOKacFsXA1yDkBc6h8O6SIoTE2CVdUz_dxr-aiUMflk9_/exec";

const bot = new TelegramBot(token);

bot.deleteWebHook().then(() => {
  console.log("✅ Bot başlatıldı");
  bot.startPolling();
});

/* ================= GLOBAL ================= */

let waitingForInput = {};
let waitingForDelete = {};
let dailyData = {};
let dailyTransactions = {};

const FINANS_GRUP_ID = -1003717216804;

const allowedUsers = [
  8467771210,
  5340962409,
  6855450336,
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

/* ================= UTILS ================= */

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
  sahin: "Şahin",
  jorpay: "Jorpay",
  master: "Master",
  karahan: "Karahan",
  kartal: "Kartal",
  ezel: "Ezel",
  bizans: "Bizans",
  garanti: "Garanti QR",
  cryptobox: "Cryptobox",
  easy: "Easy",
  dream: "Dream",
  atlas: "Atlas",
  evapay: "Evapay",
  manuel: "Manuel Test"
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

/* ================= SHEET ================= */

async function getNextId(date) {
  try {
    console.log("📥 ID çekiliyor...");

    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "GET_NEXT_ID",
        date: date
      })
    });

    const data = await response.json();

    console.log("✅ ID:", data);

    if (!data.id || isNaN(data.id)) return 1;

    return data.id;
  } catch (err) {
    console.log("❌ ID error:", err);
    return 1;
  }
}

async function sendToSheet(data) {
  try {
    console.log("📤 Sheet gönder:", data);

    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.log("❌ Sheet error:", err);
  }
}

/* ================= RAM LOAD ================= */

async function loadTodayData() {
  const { date } = getDateTime();

  try {
    console.log("📥 RAM yükleniyor...");

    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "GET_TODAY",
        date: date
      })
    });

    const data = await response.json();

    dailyTransactions[date] = [];
    dailyData[date] = {};

    data.forEach((t) => {
      dailyTransactions[date].push(t);

      if (!dailyData[date][t.provider]) {
        dailyData[date][t.provider] = 0;
      }

      dailyData[date][t.provider] += Number(t.amount);
    });

    console.log("✅ RAM yüklendi:", data.length);
  } catch (err) {
    console.log("❌ RAM error:", err);
  }
}

/* 🔥 STARTUP */
setTimeout(() => {
  loadTodayData();
}, 2000);

/* ================= MENU ================= */

async function showMenu(chatId) {
  return bot.sendMessage(chatId, "📌 Manuel Deposit Panel", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Ekle", callback_data: "ekle" },
          { text: "📊 Özet", callback_data: "ozet" }
        ],
        [{ text: "❌ Sil", callback_data: "sil" }]
      ]
    }
  });
}

/* ================= START ================= */

bot.onText(/\/start/, async (msg) => {
  if (!allowedUsers.includes(msg.from.id)) return;

  const chatId = msg.chat.id;

  // 🔥 KLAVYEYİ KALDIR
  await bot.sendMessage(chatId, ".", {
  reply_markup: {
    remove_keyboard: true
    }
  });

  const panelMsg = await showMenu(chatId);

  waitingForInput[chatId] = {
    startMsgId: msg.message_id,
    panelMsgId: panelMsg.message_id,
    inputMsgId: null,
    active: false
  };
});

/* ================= CALLBACK ================= */

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!allowedUsers.includes(query.from.id)) return;

  /* ===== EKLE ===== */
  if (data === "ekle") {

  waitingForInput[chatId] = {
  active: true,
  inputMsgId: null,
  errorCount: 0
};

  const inputMsg = await bot.sendMessage(
    chatId,
    "Kullanıcı ve tutar yaz:\nörnek: test1 1500"
  );

  waitingForInput[chatId].inputMsgId = inputMsg.message_id;
}

  /* ===== OZET ===== */
  else if (data === "ozet") {
    const { date } = getDateTime();

    if (!dailyData[date]) {
      await loadTodayData();
    }

    const groupName = normalizeText(query.message.chat.title || "");

    let provider = null;

    for (let key in providerMap) {
      if (groupName.includes(key)) {
        provider = providerMap[key];
        break;
      }
    }

    if (!provider) {
      return bot.sendMessage(chatId, "eşleşme yok");
    }

    if (!dailyData[date][provider]) {
      return bot.sendMessage(chatId, "bu grup için veri yok");
    }

    let summary = `📊 ${date} - ${provider} Özeti\n\n`;
    summary += `Toplam: ${dailyData[date][provider]} TRY\n\n`;
    summary += `📝 İşlemler:\n`;

    dailyTransactions[date]
      .filter((t) => t.provider === provider)
      .forEach((t) => {
        summary += `#${t.id} | ${t.username} - ${t.amount} TRY\n`;
      });

    bot.sendMessage(chatId, summary);
  }

  /* ===== SIL ===== */
  else if (data === "sil") {
    waitingForDelete[chatId] = true;
    bot.sendMessage(chatId, "ID gir:");
  }

  bot.answerCallbackQuery(query.id);
});

/* ================= RAPOR ================= */

bot.onText(/\/rapor/, async (msg) => {

    if (!allowedUsers.includes(msg.from.id)) return;

    if (msg.chat.id !== FINANS_GRUP_ID) return;

    const { date } = getDateTime();

    /* 🔥 RAM YOKSA ÇEK */
    if (!dailyData[date]) {
        console.log("RAM boş → yükleniyor");
        await loadTodayData();
    }

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

/* ================= MESSAGE ================= */

bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!allowedUsers.includes(msg.from.id)) return;

  const chatId = msg.chat.id;
  const text = msg.text;

/* ===== RAPOR FIX ===== */
if (text.startsWith("/rapor")) {

  console.log("RAPOR ÇALIŞTI");

// if (msg.chat.id !== FINANS_GRUP_ID) return;
  
  const { date } = getDateTime();

  if (!dailyData[date]) {
    console.log("RAM boş → yükleniyor");
    await loadTodayData();
  }

  let total = 0;
  let rapor = `📊 Günlük Finans Özeti - ${date}\n\n`;

  Object.values(providerMap).forEach(p => {

    const val = dailyData[date]?.[p] || 0;

    total += val;

    rapor += `${p}: ${val} TRY\n`;
  });

  rapor += `\n💰 Genel Toplam: ${total} TRY`;

  bot.sendMessage(chatId, rapor);

  return;
}
  
  /* ===== DELETE ===== */
  if (waitingForDelete[chatId]) {

  const id = parseInt(text);
  if (isNaN(id)) return;

  const { date } = getDateTime();

  await sendToSheet({
    action: "DELETE",
    id: id,
    date: date
  });

  /* 🔥 RAM GÜNCELLEME */
  if (dailyTransactions[date]) {

    const deleted = dailyTransactions[date].find(t => t.id === id);

    if (deleted) {

      // toplamdan düş
      if (dailyData[date] && dailyData[date][deleted.provider]) {
        dailyData[date][deleted.provider] -= Number(deleted.amount);
      }

      // listeden sil
      dailyTransactions[date] =
        dailyTransactions[date].filter(t => t.id !== id);

      console.log("RAM'den silindi:", id);
    }
  }

  bot.sendMessage(chatId, "#" + id + " silindi ❌");

  waitingForDelete[chatId] = false;
  return;
}

  /* ===== ADD ===== */
  if (waitingForInput[chatId]?.active) {
    const parts = text.trim().split(" ");

   if (parts.length !== 2 || isNaN(parts[1])) {

  if (!waitingForInput[chatId]) return;

  waitingForInput[chatId].errorCount++;

  if (waitingForInput[chatId].errorCount >= 2) {

    bot.sendMessage(chatId,
      "❌ 2 kez hatalı giriş yaptın\n/start ile tekrar başlat"
    );

    waitingForInput[chatId] = null;
    return;
  }

  bot.sendMessage(chatId,
    "⚠️ Hatalı format\nörnek: test1 1500"
  );

  return;
}

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
      return bot.sendMessage(chatId, "eşleşme yok");
    }

    const { date, time } = getDateTime();
    const id = await getNextId(date);

    if (!dailyData[date]) {
      dailyData[date] = {};
      dailyTransactions[date] = [];
    }

    dailyData[date][provider] =
      (dailyData[date][provider] || 0) + amount;

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

    bot.sendMessage(
  chatId,
  "#" + id + " | " + username + " " + amount + " TRY " + provider + " manuel eklendi ✅"
);

const ids = waitingForInput[chatId];

setTimeout(() => {

  if (ids?.startMsgId)
    bot.deleteMessage(chatId, ids.startMsgId).catch(()=>{});

  if (ids?.panelMsgId)
    bot.deleteMessage(chatId, ids.panelMsgId).catch(()=>{});

  if (ids?.inputMsgId)
    bot.deleteMessage(chatId, ids.inputMsgId).catch(()=>{});

  if (ids?.userMsgId)
    bot.deleteMessage(chatId, ids.userMsgId).catch(()=>{});

}, 4500);

// 🔥 EN SON
waitingForInput[chatId] = null;
    return;
}

/* ================= GÜN SONU ================= */

let lastRunDate = null;

function sendDailyFinanceReport() {
  const { date } = getDateTime();

  let total = 0;
  let text = `📊 Gün Sonu Finans Raporu - ${date}\n\n`;

  Object.values(providerMap).forEach((provider) => {
    const amount = dailyData[date]?.[provider] || 0;

    total += amount;
    text += `${provider}: ${amount} TRY\n`;
  });

  text += `\n💰 Genel Toplam: ${total} TRY`;

  bot.sendMessage(FINANS_GRUP_ID, text);
}

setInterval(() => {
  const now = new Date().toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit"
  });

  const today = new Date().toDateString();

  if (now === "01:33" && lastRunDate !== today) {
    lastRunDate = today;
    sendDailyFinanceReport();
  }
}, 60000);
});
