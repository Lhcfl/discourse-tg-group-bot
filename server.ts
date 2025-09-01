import type TelegramBot from "node-telegram-bot-api";
import { useKeyPair } from "./keypair";
import { getUserByNonce } from "./noncemap";
import { fetch } from "bun";
import { getConfig } from "./config";
import { decryptUserApiKey, verify } from "./discourse";

function escapeHtml(str: string) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function renderFailedHtml(reason: string) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>认证失败</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
        .error { color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>认证失败</h1>
      <div class="error">
        <p>${escapeHtml(reason)}</p>
      </div>
    </body>
  </html>
`
}

export function startServer(port: number, bot: TelegramBot) {
  const server = Bun.serve({
    port,
    async fetch(req: Request) {
      const url = new URL(req.url);

      // 处理 /auth/:nonce 路径的 GET 请求
      if (url.pathname.startsWith('/auth') && req.method === 'GET') {
        try {
          // 获取查询参数
          const searchParams = url.searchParams;
          const encryptedPayload = searchParams.get('payload');

          // 记录收到的请求（用于调试）
          console.log('Discourse auth callback received:', {
            timestamp: new Date().toISOString(),
            hasPayload: !!encryptedPayload,
            userAgent: req.headers.get('user-agent'),
            ip: req.headers.get('x-forwarded-for') || 'unknown'
          });

          if (!encryptedPayload) {
            return new Response(renderFailedHtml("未收到有效的认证负载"), {
              status: 400,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          console.log('Encrypted payload received:', encryptedPayload);

          let decryptedPayload: Awaited<ReturnType<typeof decryptUserApiKey>>;
          try {
            decryptedPayload = await decryptUserApiKey(encryptedPayload);
          } catch (decryptError) {
            console.error('Failed to decrypt payload:', decryptError);
            return new Response(renderFailedHtml("解密失败：" + (decryptError as any).message), {
              status: 500,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          const user = getUserByNonce(decryptedPayload.nonce);

          if (!user) {
            return new Response(renderFailedHtml(`登录超时，nonce 被清空（原 nonce: ${decryptedPayload.nonce}）`), {
              status: 403,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          const err = verify(decryptedPayload.key);
          if (err != null) {
            return new Response(renderFailedHtml(`您似乎无权访问此内容, ${err}`), {
              status: 403,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          await bot.approveChatJoinRequest(user.chat_id, user.id);

          return new Response(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>认证成功</title>
                <meta charset="UTF-8">
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
                  .success { color: #2e7d32; background: #e8f5e9; padding: 15px; border-radius: 4px; }
                  .payload { background: #f5f5f5; padding: 10px; margin: 10px 0; font-family: monospace; word-break: break-all; }
                  .note { background: #fff3e0; padding: 10px; margin: 10px 0; border-radius: 4px; }
                </style>
              </head>
              <body>
                <h1>认证回调成功!</h1>
                <div class="success">
                  <p>您已成功加群</p>
                </div>

                <details>
                  <summary>查看解密的 Payload（调试用）</summary>
                  <div class="payload"><pre><code>${JSON.stringify(decryptedPayload, null, 2)}</code></pre></div>
                </details>
                
                <details>
                  <summary>查看加密的 Payload（调试用）</summary>
                  <div class="payload">${encryptedPayload}</div>
                </details>
              </body>
            </html>
          `, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        } catch (error) {
          console.error('Auth endpoint error:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      }

      // 健康检查端点
      if (url.pathname === '/health' && req.method === 'GET') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          endpoints: ['/auth/:nonce', '/health', '/']
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 根路径
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Discourse 认证服务</title>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
              .endpoint { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 4px; }
              code { background: #e1f5fe; padding: 2px 4px; border-radius: 2px; }
            </style>
          </head>
          <body>
            <h1>🔐 Discourse 认证服务</h1>
            
            <h2>可用端点:</h2>
            <div class="endpoint">
              <strong>GET /auth/:nonce</strong><br>
              Discourse 认证重定向端点<br>
              <small>接收加密的 payload 参数</small>
            </div>
            <div class="endpoint">
              <strong>GET /health</strong><br>
              健康检查端点
            </div>
            
            <h2>使用说明:</h2>
            <p>将此 URL 设置为你的 Discourse 应用的 <code>auth_redirect</code>:</p>
            <div class="endpoint">
              <code>http://localhost:8083/auth/{your_nonce}</code>
            </div>
            
            <p><strong>注意:</strong> 确保 nonce 与生成 API key 时使用的 nonce 相匹配。</p>
          </body>
        </html>
      `, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // 404 处理
      return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>404 Not Found</title></head>
        <body>
          <h1>404 - 页面未找到</h1>
          <p>路径: ${url.pathname}</p>
          <a href="/">返回首页</a>
        </body>
      </html>
    `, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },

    error(error) {
      console.error('Server error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  console.log(`🚀 Discourse 认证服务器运行在 http://localhost:${server.port}`);
  console.log(`📍 认证端点模式: http://localhost:${server.port}/auth/`);

  // 优雅关闭处理
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务器...');
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 收到 SIGTERM，正在关闭服务器...');
    server.stop();
    process.exit(0);
  });
}