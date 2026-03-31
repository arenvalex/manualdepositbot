const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.TOKEN;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbyHaSKcRznP6KsjUVmuSaYnQxlYzyk7FgBvqJxn43ImlmhK2JLhabubHNYcpVzVpS0c/exec";

const bot = new TelegramBot(token);

bot.deleteWebHook().then(() => {
  bot.startPolling();
});

let waitingForInput = {};
let waitingForDelete = {};
let dailyData = {};
let dailyTransactions = {};

const FINANS_GRUP_ID = -5035282347;

const allowedUsers = [
8467771210,5340962409,6855450336,1382439300,
8217946285,8153108008,649401002,8139153707,
1409197362,1617214857,5236903171,8473156805
];

function normalizeText(text) {
return text.toLowerCase()
.replace(/ı/g,"i").replace(/ğ/g,"g")
.replace(/ü/g,"u").replace(/ş/g,"s")
.replace(/ö/g,"o").replace(/ç/g,"c");
}

const providerMap = {
"sahin":"Şahin","jorpay":"Jorpay","master":"Master",
"karahan":"Karahan","kartal":"Kartal","ezel":"Ezel",
"bizans":"Bizans","garanti":"Garanti QR","cryptobox":"Cryptobox",
"easy":"Easy","dream":"Dream","atlas":"Atlas",
"evapay":"Evapay","manuel":"Manuel Test"
};

function getDateTime() {
const now = new Date();
return {
date: now.toLocaleDateString("tr-TR",{timeZone:"Europe/Istanbul"}),
time: now.toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"})
};
}

/* ================= SHEET ================= */

async function getNextId(date) {
try {
const res = await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({action:"GET_NEXT_ID",date})
});
const data = await res.json();
return (!data.id || isNaN(data.id)) ? 1 : data.id;
} catch {
return 1;
}
}

async function sendToSheet(data) {
try {
await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(data)
});
} catch(e){
console.log("Sheet error:",e);
}
}

/* ================= LOAD RAM ================= */

async function loadTodayData() {
const { date } = getDateTime();

try {
const res = await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({action:"GET_TODAY",date})
});

const data = await res.json();

dailyTransactions[date] = [];
dailyData[date] = {};

data.forEach(t=>{
dailyTransactions[date].push(t);

if(!dailyData[date][t.provider])
dailyData[date][t.provider]=0;

dailyData[date][t.provider]+=Number(t.amount);
});

console.log("✅ RAM'e yüklendi:", date);

} catch(e){
console.log("LOAD ERROR:",e);
}
}

/* 🔥 BOT AÇILIRKEN ÇALIŞIR */
loadTodayData();

/* ================= MENU ================= */

async function showMenu(chatId) {
return bot.sendMessage(chatId,"📌 Manuel Deposit Panel",{
reply_markup:{
inline_keyboard:[
[{text:"➕ Ekle",callback_data:"ekle"},
{text:"📊 Özet",callback_data:"ozet"}],
[{text:"❌ Sil",callback_data:"sil"}]
]
}
});
}

/* ================= START ================= */

bot.onText(/\/start/, async (msg)=>{
if(!allowedUsers.includes(msg.from.id)) return;

const panel = await showMenu(msg.chat.id);

waitingForInput[msg.chat.id]={
panelMsgId:panel.message_id,
active:false
};
});

/* ================= CALLBACK ================= */

bot.on("callback_query", async (q)=>{
const chatId=q.message.chat.id;
const data=q.data;

if(!allowedUsers.includes(q.from.id)) return;

if(data==="ekle"){
waitingForInput[chatId].active=true;
bot.sendMessage(chatId,"kullanıcı tutar yaz");
}

else if(data==="ozet"){

const {date}=getDateTime();

const groupName=normalizeText(q.message.chat.title||"");

let provider=null;
for(let key in providerMap){
if(groupName.includes(key)){
provider=providerMap[key]; break;
}
}

if(!provider) return bot.sendMessage(chatId,"eşleşme yok");

if(!dailyData[date]) await loadTodayData();

let total=dailyData[date][provider]||0;

let txt=`📊 ${provider}\nToplam: ${total}\n\n`;

(dailyTransactions[date]||[])
.filter(t=>t.provider===provider)
.forEach(t=>{
txt+=`#${t.id} ${t.username} ${t.amount}\n`;
});

bot.sendMessage(chatId,txt);
}

else if(data==="sil"){
waitingForDelete[chatId]=true;
bot.sendMessage(chatId,"ID gir");
}

bot.answerCallbackQuery(q.id);
});

/* ================= RAPOR ================= */

bot.onText(/\/rapor/, async (msg)=>{

if(!allowedUsers.includes(msg.from.id)) return;
if(msg.chat.id!==FINANS_GRUP_ID) return;

const {date}=getDateTime();

if(!dailyData[date]) await loadTodayData();

let total=0;
let txt=`📊 ${date}\n\n`;

Object.values(providerMap).forEach(p=>{
let val=dailyData[date]?.[p]||0;
total+=val;
txt+=`${p}: ${val}\n`;
});

txt+=`\nTOPLAM: ${total}`;

bot.sendMessage(msg.chat.id,txt);
});

/* ================= MESSAGE ================= */

bot.on("message", async (msg)=>{

if(!msg.text) return;
if(!allowedUsers.includes(msg.from.id)) return;

const chatId=msg.chat.id;

/* DELETE */
if(waitingForDelete[chatId]){
const id=parseInt(msg.text);
if(isNaN(id)) return;

const {date}=getDateTime();

await sendToSheet({action:"DELETE",id,date});

dailyTransactions[date]=
(dailyTransactions[date]||[]).filter(t=>t.id!==id);

bot.sendMessage(chatId,"silindi");

waitingForDelete[chatId]=false;
return;
}

/* ADD */
if(waitingForInput[chatId]?.active){

const parts=msg.text.split(" ");
if(parts.length!==2 || isNaN(parts[1])){
return bot.sendMessage(chatId,"hatalı");
}

const username=parts[0];
const amount=parseFloat(parts[1]);

const groupName=normalizeText(msg.chat.title||"");

let provider=null;
for(let key in providerMap){
if(groupName.includes(key)){
provider=providerMap[key]; break;
}
}

if(!provider) return bot.sendMessage(chatId,"eşleşme yok");

const {date,time}=getDateTime();
const id=await getNextId(date);

if(!dailyData[date]){
dailyData[date]={};
dailyTransactions[date]=[];
}

dailyData[date][provider]=(dailyData[date][provider]||0)+amount;

dailyTransactions[date].push({
id,username,amount,provider
});

await sendToSheet({
id,date,time,username,amount,provider,type:"EKLE"
});

bot.sendMessage(chatId,`#${id} eklendi`);

waitingForInput[chatId]=null;
}
});

/* ================= GÜN SONU ================= */

function sendDailyFinanceReport(){
const {date}=getDateTime();

let total=0;
let txt=`📊 GÜN SONU ${date}\n\n`;

Object.values(providerMap).forEach(p=>{
let val=dailyData[date]?.[p]||0;
total+=val;
txt+=`${p}: ${val}\n`;
});

txt+=`\nTOPLAM: ${total}`;

bot.sendMessage(FINANS_GRUP_ID,txt);
}

setInterval(()=>{
const now=new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit"});
if(now==="23:50") sendDailyFinanceReport();
},60000);
