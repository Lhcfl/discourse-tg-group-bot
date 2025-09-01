import TelegramBot from "node-telegram-bot-api";
import { getConfig } from "./config";
import { listenChatJoinRequest } from "./group";

const config = getConfig();
console.log(config);
const bot = new TelegramBot(config.bot_token, { polling: true });
listenChatJoinRequest(bot);
console.log("bot 已经启动");
// startServer(8083, bot);