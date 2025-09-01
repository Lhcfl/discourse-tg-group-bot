type RelatedUser = {
  id: number;
  chat_id: number;
};

const NonceMap = new Map<string, RelatedUser>();
const ChatIdMap = new Map<number, RelatedUser>();

export function registerNonce(nonce: string, user: RelatedUser) {
  NonceMap.set(nonce, user);
  setTimeout(() => {
    NonceMap.delete(nonce);
  }, 10 * 60 * 1000); // 10 minutes
}

export function registerChatId(chatId: number, user: RelatedUser) {
  ChatIdMap.set(chatId, user);
  setTimeout(() => {
    ChatIdMap.delete(chatId);
  }, 10 * 60 * 1000); // 10 minutes
}

export function getUserByNonce(nonce: string): RelatedUser | undefined {
  return NonceMap.get(nonce);
}

export function getUserByChatId(chatId: number): RelatedUser | undefined {
  return ChatIdMap.get(chatId);
}