import TelegramBot from 'node-telegram-bot-api';
import { decryptUserApiKey, generateUserApiKey, verify } from './discourse';
import { getUserByChatId, registerChatId, registerNonce } from './noncemap';
import { getConfig } from './config';

export function listenChatJoinRequest(bot: TelegramBot) {
  bot.on("message", async (msg) => {
    if (msg.text == "/start") {
      bot.sendMessage(msg.chat.id, "pwq");
    }
    const related = getUserByChatId(msg.chat.id);

    if (related && msg.text) {
      let decryptedPayload: Awaited<ReturnType<typeof decryptUserApiKey>>;
      try {
        decryptedPayload = await decryptUserApiKey(msg.text);
      } catch (decryptError) {
        console.error('Failed to decrypt payload:', decryptError);
        bot.sendMessage(msg.chat.id, "pwq 解密失败：" + (decryptError as any).message);
        return;
      }
      const err = await verify(decryptedPayload.key);
      if (err != null) {
        bot.sendMessage(msg.chat.id, "pwq 验证失败：" + (err as any).message);
        return;
      }
      await bot.approveChatJoinRequest(related.chat_id, related.id);
      bot.sendMessage(msg.chat.id, "pwq 验证成功！已加群！");
    }
  });

  bot.on("chat_join_request", async (req) => {
    const chatId = req.chat.id;
    const userId = req.from.id;
    const userFirstName = req.from.first_name;

    console.log(`收到加群申请: ${userFirstName}(${userId}) 申请加入群组 ${chatId}`);

    const config = getConfig();

    // reject
    if (config.chat_id && config.chat_id != chatId) { return; }

    const data = await generateUserApiKey(config.site_url, {
      application_name: config.application_name,
      auth_redirect: config.api_auth_url,
      client_id: config.client_id,
    });

    registerNonce(data.nonce, { id: userId, chat_id: chatId });
    registerChatId(req.user_chat_id, { id: userId, chat_id: chatId });

    // 向用户发送私信，包含登录链接
    const message = `pwq 你好 ${userFirstName}！\n\n` +
      `要加入群组，请先完成身份验证：\n` +
      `🔗 点击下方按钮登录，然后将 API 密钥复制粘贴回复给我。\n` +
      `⏰ 此链接将在 10 分钟后过期。\n` +
      `✅ 验证通过后，你的加群申请将自动被批准。`;

    await bot.sendMessage(req.user_chat_id, message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 立即验证', url: data.url }
        ]]
      }
    });

    console.log(`已向用户 ${userFirstName}(${userId}) 发送验证链接`);

    bot.sendMessage(chatId, `pwq ${userFirstName} 申请加群，已经发送了链接`);
  });
}