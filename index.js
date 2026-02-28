const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

let pendingDeposits = {};

bot.onText(/\/ekle (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    const amount = match[2];

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

bot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;

    const data = pendingDeposits[chatId];
    if (!data) return;

    const provider = callbackQuery.data;

    bot.sendMessage(
        chatId,
        `${data.username} ${data.amount} TRY ${provider} sahasına eklendi ✅`
    );

    delete pendingDeposits[chatId];
});
