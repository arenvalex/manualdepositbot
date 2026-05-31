const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbzcpUafU7zAewaz1_PitM8wOKacFsXA1yDkBc6h8O6SIoTE2CVdUz_dxr-aiUMflk9_/exec";

const bot = new TelegramBot(token);

bot.deleteWebHook().then(async () => {
  console.log("✅ Bot başlatıldı");

  await loadTodayData(); // 🔥 RAM BURADA YÜKLENİR

  bot.startPolling();
});

/* ================= GLOBAL ================= */

let waitingForInput = {};
let waitingForDelete = {};
let dailyData = {};
let dailyTransactions = {};

const FINANS_GRUP_ID = -1003717216804;

const allowedUsers = [
  8467771210,8270202578,5340962409,7415823776,8398980065,6855450336,8239177154,1382439300,8217946285,
  8153108008,649401002,7499162176,8139153707,1409197362,1617214857,7572237466,
  5236903171,8473156805
];

/* ================= MAP ================= */

const providerMap = {
  sahin: "Şahin",
  jorpay: "Jorpay",
  master: "Master",
  karahan: "Karahan",
  kartal: "Kartal",
  ezel: "Ezel",
  ultrapay: "Ultrapay",
  bizans: "Bizans",
  fastpay: "Fastpay",
  garanti: "Garanti QR",
  cryptobox: "Cryptobox",
  easy: "Easy",
  dream: "Dream",
  atlas: "Atlas",
  evapay: "Evapay",
  infinitypay: "Infinity Pay",
  manuel: "Manuel Test"
};

const providerExcelMap = {
  fastpay: "Fast Pay",
  easy: "Easy Pay 2",
  evapay: "EvaPay Banka",
  jorpay: "JorPay Banka Havalesi",
  kartal: "Kartal Banka Havalesi",
  dream: "Dream Banka Havalesi",
  sahin: "Şahin",
  ezel: "Ezel Havale",
  atlas: "Atlas Banka Havalesi",
  infinitypay: "Infinity Pay",
  garanti: "Güvenli Qr"
};

/* 🔥 REVERSE MAP (eski data fix) */
const reverseExcelMap = Object.fromEntries(
  Object.entries(providerExcelMap).map(([k,v]) => [v,k])
);

/* ================= UTILS ================= */

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/ı/g,"i").replace(/ğ/g,"g")
    .replace(/ü/g,"u").replace(/ş/g,"s")
    .replace(/ö/g,"o").replace(/ç/g,"c");
}

function getProviders(groupName){
  for (let key in providerMap) {
    if (groupName.includes(key)) {
      return {
        short: providerMap[key],
        excel: providerExcelMap[key] || providerMap[key],
        key
      };
    }
  }
  return null;
}

function getDateTime() {
  const now = new Date();

  return {
    date: now.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }),
    time: now.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul" })
  };
}

/* ================= SHEET ================= */

// 🔥 BURAYA EKLE
async function getNextId(date) {
  try {
    const res = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "GET_NEXT_ID",
        date
      })
    });

    const data = await res.json();
    return data.id || 1;

  } catch (err) {
    console.log("❌ ID error:", err.message);
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
    console.log("❌ Sheet error:", err.message);
  }
}

async function loadTodayData() {
  console.log("🚀 loadTodayData çalıştı");

  const { date } = getDateTime();

  try {
    console.log("📥 RAM yükleme başladı...");

    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "GET_TODAY",
        date: date
      })
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      console.log("❌ JSON parse hatası:", text.substring(0, 80));
      return;
    }

    dailyTransactions[date] = [];
    dailyData[date] = {};

    data.forEach((t) => {
      dailyTransactions[date].push(t);

      if (!dailyData[date][t.provider]) {
        dailyData[date][t.provider] = 0;
      }

      dailyData[date][t.provider] += Number(t.amount);
    });

    console.log(`✅ RAM yüklendi | Kayıt: ${data.length}`);
    console.log("📊 Provider dağılımı:", dailyData[date]);

  } catch (err) {
    console.log("❌ RAM load hatası:", err.message);
  }
}

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

  await bot.sendMessage(chatId, ".", {
    reply_markup: { remove_keyboard: true }
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

  if (data === "ekle") {
    waitingForInput[chatId] = { active:true, inputMsgId:null, errorCount:0 };

    const msg = await bot.sendMessage(chatId,
      "Kullanıcı ve tutar yaz:\nörnek: test1 1500"
    );

    waitingForInput[chatId].inputMsgId = msg.message_id;
  }

  else if (data === "ozet") {
    const { date } = getDateTime();
    if (!dailyData[date]) await loadTodayData();

    const groupName = normalizeText(query.message.chat.title || "");
    const providers = getProviders(groupName);

    if (!providers) return bot.sendMessage(chatId,"eşleşme yok");

    const provider = providers.excel;

    if (!dailyData[date][provider]) {
      return bot.sendMessage(chatId,"bu grup için veri yok");
    }

    let summary = `📊 ${date} - ${provider} Özeti\n\n`;
    summary += `Toplam: ${dailyData[date][provider]} TRY\n\n`;

    dailyTransactions[date]
      .filter(t => t.provider === provider)
      .forEach(t => {
        summary += `#${t.id} | ${t.username} - ${t.amount} TRY\n`;
      });

    bot.sendMessage(chatId, summary);
  }

  else if (data === "sil") {
    waitingForDelete[chatId] = true;
    bot.sendMessage(chatId, "ID gir:");
  }

  bot.answerCallbackQuery(query.id);
});

/* ================= RAPOR ================= */

bot.onText(/\/rapor(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const { date } = getDateTime();

  if (!dailyData[date]) await loadTodayData();

  let total = 0;
  let text = `📊 Günlük Finans Özeti - ${date}\n\n`;

  Object.keys(providerMap).forEach(key => {
    const name = providerExcelMap[key] || providerMap[key];
    const val = dailyData[date]?.[name] || 0;

    total += val;
    text += `${name}: ${val} TRY\n`;
  });

  text += `\n💰 Genel Toplam: ${total} TRY`;

  bot.sendMessage(chatId, text);
});

/* ================= ADD / DELETE ================= */

bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!allowedUsers.includes(msg.from.id)) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (waitingForDelete[chatId]) {
    const id = parseInt(text);
    if (isNaN(id)) return;

    const { date } = getDateTime();

    await sendToSheet({ action:"DELETE", id, date });

    if (dailyTransactions[date]) {
      const deleted = dailyTransactions[date].find(t => t.id === id);

      if (deleted) {
        if (dailyData[date][deleted.provider]) {
          dailyData[date][deleted.provider] -= Number(deleted.amount);
        }

        dailyTransactions[date] =
          dailyTransactions[date].filter(t => t.id !== id);
      }
    }

    bot.sendMessage(chatId, "#" + id + " silindi ❌");
    waitingForDelete[chatId] = false;
    return;
  }

  if (waitingForInput[chatId]?.active) {

    const parts = text.trim().split(" ");

    if (parts.length !== 2 || isNaN(parts[1])) {
      return bot.sendMessage(chatId,"⚠️ Format: test1 1000");
    }

    const username = parts[0];
    const amount = parseFloat(parts[1]);

    const groupName = normalizeText(msg.chat.title || "");
    const providers = getProviders(groupName);

    if (!providers) return bot.sendMessage(chatId,"eşleşme yok");

    const { date, time } = getDateTime();
    const id = await getNextId(date);

    if (!dailyData[date]) {
      dailyData[date] = {};
      dailyTransactions[date] = [];
    }

    dailyData[date][providers.excel] =
      (dailyData[date][providers.excel] || 0) + amount;

    dailyTransactions[date].push({
      id,
      username,
      amount,
      provider: providers.excel
    });

    await sendToSheet({
      id,
      date,
      time,
      username,
      amount,
      provider: providers.excel,
      type:"EKLE"
    });

    bot.sendMessage(
  chatId,
  `#${id} | ${username} ${amount} TRY ${providers.short} manuel eklendi ✅`
);

// 🔥 SADECE INPUT MESAJINI SİL
const ids = waitingForInput[chatId];

setTimeout(() => {
  if (ids?.inputMsgId)
    bot.deleteMessage(chatId, ids.inputMsgId).catch(()=>{});
}, 4000);

// 🔥 STATE TEMİZLE
delete waitingForInput[chatId];

  } //
});
    
/* ================= GÜN SONU ================= */

let lastRunDate = null;

function sendDailyFinanceReport() {
  const { date } = getDateTime();

  let total = 0;
  let text = `📊 Gün Sonu Finans Raporu - ${date}\n\n`;

  Object.keys(providerMap).forEach(key => {
    const name = providerExcelMap[key] || providerMap[key];
    const val = dailyData[date]?.[name] || 0;

    total += val;
    text += `${name}: ${val} TRY\n`;
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

  if (now === "23:55" && lastRunDate !== today) {
    lastRunDate = today;
    sendDailyFinanceReport();
  }
}, 60000);
