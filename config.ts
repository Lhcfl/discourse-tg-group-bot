export function getConfig() {
  return {
    bot_token: process.env.BOT_TOKEN || "telegram bot token here",
    chat_id: process.env.ONLY_ALLOW_CHAT_ID || 0,
    application_name: "Telegram 群验证 Bot",
    site_url: process.env.SITE_URL || "https://example.com",
    api_auth_url: process.env.API_AUTH_URL,
    client_id: process.env.CLIENT_ID || "skyland_group_verify",
    check_topic_id: parseInt(process.env.CHECK_TOPIC_ID || "10", 10),
  };
}