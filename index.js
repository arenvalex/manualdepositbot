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
8467771210,5340962409,6855450336,1382439300,8217946285,
8153108008,649401002,8139153707,1409197362,1617214857,
5236903171,8473156805
];

function normalizeText(text) {
return text.toLowerCase()
.replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
.replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c");
}

const providerMap = {
"sahin":"Şahin","jorpay":"Jorpay","master":"Master","karahan":"Karahan",
"kartal":"Kartal","ezel":"Ezel","bizans":"Bizans","garanti":"Garanti QR",
"cryptobox":"Cryptobox","easy":"Easy","dream":"Dream","atlas":"Atlas",
"evapay":"Evapay","manuel":"Manuel Test"
};

function getDateTime(){
const now=new Date();

const date=now.toLocaleDateString("tr-TR",{
timeZone:"Europe/Istanbul",
day:"2-digit",
month:"2-digit",
year:"numeric"
});

const time=now.toLocaleTimeString("tr-TR",{
timeZone:"Europe/Istanbul",
hour:"2-digit",
minute:"2-digit",
second:"2-digit"
});

return {date,time};
}

/* ================= RAM LOAD ================= */

async function loadTodayData(){

const {date}=getDateTime();

try{

const response=await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({action:"GET_TODAY",date})
});

const data=await response.json();

dailyTransactions[date]=[];
dailyData[date]={};

if(!data || !data.length){
console.log("Sheet boş ⚠️");
return;
}

data.forEach(t=>{
dailyTransactions[date].push(t);

if(!dailyData[date][t.provider]){
dailyData[date][t.provider]=0;
}

dailyData[date][t.provider]+=Number(t.amount);
});

console.log("RAM YÜKLENDİ ✅");

}catch(err){
console.log("RAM load error:",err);
}
}

/* ================= START ================= */

bot.onText(//start/, async (msg)=>{

if(!allowedUsers.includes(msg.from.id)) return;

const chatId=msg.chat.id;

await loadTodayData(); // 🔥 KRİTİK

const panelMsg=await bot.sendMessage(chatId,"📌 Manuel Deposit Panel",{
reply_markup:{
inline_keyboard:[
[
{text:"➕ Ekle",callback_data:"ekle"},
{text:"📊 Özet",callback_data:"ozet"}
],
[
{text:"❌ Sil",callback_data:"sil"}
]
]
}
});

waitingForInput[chatId]={
startMsgId:msg.message_id,
panelMsgId:panelMsg.message_id,
inputMsgId:null,
active:false
};

});

/* ================= CALLBACK ================= */

bot.on("callback_query",async(query)=>{

const chatId=query.message.chat.id;
const data=query.data;

if(!allowedUsers.includes(query.from.id)) return;

if(data==="ekle"){

waitingForInput[chatId].active=true;

const inputMsg=await bot.sendMessage(chatId,"Kullanıcı ve tutar yaz:\nörnek: test1 1500");

waitingForInput[chatId].inputMsgId=inputMsg.message_id;
}

else if(data==="ozet"){

const {date}=getDateTime();
const groupName=normalizeText(query.message.chat.title||"");

let provider=null;

for(let key in providerMap){
if(groupName.includes(key)){
provider=providerMap[key];
break;
}
}

if(!provider){
bot.sendMessage(chatId,"Bu grup için saha eşleşmesi bulunamadı.");
return;
}

if(!dailyData[date] || !dailyData[date][provider]){
bot.sendMessage(chatId,"Bugün bu saha için işlem yok.");
return;
}

let summary="📊 "+date+" - "+provider+" Özeti\n\n";
summary+="Toplam: "+dailyData[date][provider]+" TRY\n\n";
summary+="📝 İşlemler:\n";

dailyTransactions[date]
.filter(t=>t.provider===provider)
.forEach(t=>{
summary+="#"+t.id+" | "+t.username+" - "+t.amount+" TRY\n";
});

bot.sendMessage(chatId,summary);
}

else if(data==="sil"){
waitingForDelete[chatId]=true;
bot.sendMessage(chatId,"Silmek için ID yaz:");
}

bot.answerCallbackQuery(query.id);

});

/* ================= RAPOR ================= */

bot.onText(//rapor/, async (msg)=>{

if(!allowedUsers.includes(msg.from.id)) return;
if(msg.chat.id !== FINANS_GRUP_ID) return;

await loadTodayData(); // 🔥 KRİTİK

const {date}=getDateTime();

let text="📊 Günlük Finans Özeti - "+date+"\n\n";
let total=0;

Object.values(providerMap).forEach(provider=>{

let amount=0;

if(dailyData[date] && dailyData[date][provider]){
amount=dailyData[date][provider];
}

total+=amount;
text+=provider+": "+amount+" TRY\n";
});

text+="\n💰 Genel Toplam: "+total+" TRY";

bot.sendMessage(msg.chat.id,text);

});

/* ================= MESSAGE ================= */

bot.on("message",async(msg)=>{

if(!msg.text) return;
if(!allowedUsers.includes(msg.from.id)) return;

const chatId=msg.chat.id;
const text=msg.text;

if(waitingForDelete[chatId]){

const id=parseInt(text);
if(isNaN(id)) return;

const {date}=getDateTime();

await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({action:"DELETE",id,date})
});

bot.sendMessage(chatId,"#"+id+" silindi ❌");

waitingForDelete[chatId]=false;
return;
}

if(waitingForInput[chatId]?.active){

const parts=text.trim().split(" ");

if(parts.length!==2 || isNaN(parts[1])){
bot.sendMessage(chatId,"Hatalı işlem tekrar dene");
return;
}

const username=parts[0];
const amount=parseFloat(parts[1]);

const groupName=normalizeText(msg.chat.title||"");

let provider=null;

for(let key in providerMap){
if(groupName.includes(key)){
provider=providerMap[key];
break;
}
}

const {date,time}=getDateTime();

const id=Date.now(); // 🔥 basit id

await fetch(SHEET_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({id,date,time,username,amount,provider,type:"EKLE"})
});

bot.sendMessage(chatId,
"#"+id+" | "+username+" "+amount+" TRY "+provider+" manuel eklendi ✅"
);

waitingForInput[chatId]=null;
return;
}

});
