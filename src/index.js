// src/index.js
import { WebSocketHandler } from './websocket.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes first (before assets to avoid body consumption)
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
    }

    // WebSocket
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }

      const id = env.WEBSOCKET_HANDLER.idFromName('main');
      const stub = env.WEBSOCKET_HANDLER.get(id);

      return stub.fetch(request);
    }

    // Try to serve static assets
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch (e) {
      // Assets not available, continue
    }

    return new Response('Not found', { status: 404 });
  }
};

export { WebSocketHandler };

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'POST' && url.pathname === '/api/generate-token') {
    return generateToken(request, env);
  }
  if (method === 'POST' && url.pathname === '/api/validate-token') {
    return validateToken(request, env);
  }
  if (method === 'POST' && url.pathname === '/api/draw') {
    return drawPixel(request, env);
  }
  if (method === 'GET' && url.pathname === '/api/canvas') {
    return getCanvas(request, env);
  }
  if (method === 'GET' && url.pathname === '/api/config') {
    return getConfig(request, env);
  }
  // 新增：邀请码剩余次数
  if (method === 'GET' && url.pathname.match(/^\/api\/admin\/invitation-code-usage\/(.+)$/)) {
    const code = url.pathname.match(/^\/api\/admin\/invitation-code-usage\/(.+)$/)[1];
    return getInvitationCodeUsage(request, env, code);
  }

  // Admin routes
  if (url.pathname.startsWith('/api/admin/')) {
    const auth = request.headers.get('Authorization');
    if (!auth || !await checkAdminAuth(auth, env)) {
      return new Response('401 - 需要身份验证', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="PaintBoard Admin"' }
      });
    }

    if (method === 'GET' && url.pathname === '/api/admin/invitation-codes') {
      return getInvitationCodes(request, env);
    }
    if (method === 'POST' && url.pathname === '/api/admin/invitation-codes') {
      return addInvitationCode(request, env);
    }
    if (method === 'DELETE' && url.pathname.match(/^\/api\/admin\/invitation-codes\/(.+)$/)) {
      const code = url.pathname.match(/^\/api\/admin\/invitation-codes\/(.+)$/)[1];
      return deleteInvitationCode(request, env, code);
    }
    if (method === 'PUT' && url.pathname === '/api/admin/cooldown') {
      return updateCooldown(request, env);
    }
  }

  return new Response('API not found', { status: 404 });
}

async function generateToken(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { invitationCode } = body;

  if (!invitationCode) {
    return Response.json({ error: '请填写邀请码' }, { status: 400 });
  }

  // 移除 includes 校验，统一用 inviteObj 查找
  // const config = await getConfigFromKV(env);
  // if (!config.invitationCodes.includes(invitationCode)) {
  //   return Response.json({ error: '邀请码无效！' }, { status: 403 });
  // }

  const config = await getConfigFromKV(env);
  // 兼容字符串数组和对象数组
  let inviteObj = null;
  if (Array.isArray(config.invitationCodes)) {
    for (const item of config.invitationCodes) {
      if (typeof item === 'string' && item === invitationCode) {
        inviteObj = { code: item, timeWindow: 3600, maxCount: 1 };
        break;
      } else if (item && typeof item === 'object' && item.code === invitationCode) {
        inviteObj = item;
        break;
      }
    }
  }
  if (!inviteObj) {
    return Response.json({ error: '邀请码无效！' }, { status: 403 });
  }
  const { timeWindow = 3600, maxCount = 1 } = inviteObj;

  // 获取当前邀请码的限流状态
  const tokens = await env.ED_PB_KV.get('tokens', { type: 'json' }) || {};
  const now = Date.now();
  let count = 0;
  let windowStart = now;
  for (const [token, data] of Object.entries(tokens)) {
    if (data.inviteCode === invitationCode) {
      // 判断是否在当前时间窗口
      if (now - data.createdAt < (inviteObj.timeWindow ?? timeWindow) * 1000) {
        count++;
        if (data.createdAt < windowStart) windowStart = data.createdAt;
      }
    }
  }
  const leftCount = Math.max((inviteObj.maxCount ?? maxCount) - count, 0);
  const resetIn = Math.ceil((windowStart + (inviteObj.timeWindow ?? timeWindow) * 1000 - now) / 1000);
  if (leftCount <= 0) {
    return Response.json({ error: `此邀请码在本时段已达最大使用次数，请${resetIn}秒后再试。`, resetIn, leftCount: 0 }, { status: 429 });
  }

  // 生成 token时也用leftCount
  const token = crypto.randomUUID();
  tokens[token] = { inviteCode: invitationCode, createdAt: now };
  await env.ED_PB_KV.put('tokens', JSON.stringify(tokens));

  return Response.json({ token, resetIn, leftCount });
}

async function validateToken(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { token } = body;

  if (!token) {
    return Response.json({ error: '请填写 token' }, { status: 400 });
  }

  const tokens = await env.ED_PB_KV.get('tokens', { type: 'json' }) || {};
  if (!tokens[token]) {
    return Response.json({ error: '此 token 无效！' }, { status: 403 });
  }

  return Response.json({ valid: true });
}

async function drawPixel(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { token, x, y, color } = body;

  const tokens = await env.ED_PB_KV.get('tokens', { type: 'json' }) || {};
  if (!tokens[token]) {
    return Response.json({ error: '此 token 无效！' }, { status: 403 });
  }

  const config = await getConfigFromKV(env);
  if (x < 0 || x >= config.canvasWidth || y < 0 || y >= config.canvasHeight) {
    return Response.json({ error: '绘画位置无效！' }, { status: 400 });
  }

  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return Response.json({ error: '颜色格式错误，请使用 HEX 十六进制颜色格式' }, { status: 400 });
  }

  const cooldowns = await env.ED_PB_KV.get('cooldowns', { type: 'json' }) || {};
  const now = Date.now();
  const lastDraw = cooldowns[token];
  const cooldownMs = config.cooldownSeconds * 1000;

  if (lastDraw && (now - lastDraw) < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - (now - lastDraw)) / 1000);
    return Response.json({ error: '绘画冷却中……', remainingSeconds }, { status: 429 });
  }

  const canvas = await env.ED_PB_KV.get('canvas', { type: 'json' }) || {};
  const key = `${x},${y}`;
  canvas[key] = color.toUpperCase();
  await env.ED_PB_KV.put('canvas', JSON.stringify(canvas));

  cooldowns[token] = now;
  await env.ED_PB_KV.put('cooldowns', JSON.stringify(cooldowns));

  // Broadcast
  const id = env.WEBSOCKET_HANDLER.idFromName('main');
  const stub = env.WEBSOCKET_HANDLER.get(id);
  await stub.broadcast({ type: 'pixel', x, y, color: color.toUpperCase() });

  return Response.json({ success: true, nextDrawIn: config.cooldownSeconds });
}

async function getCanvas(request, env) {
  const config = await getConfigFromKV(env);
  const canvas = await env.ED_PB_KV.get('canvas', { type: 'json' }) || {};

  return Response.json({
    width: config.canvasWidth,
    height: config.canvasHeight,
    pixels: canvas
  });
}

async function getConfig(request, env) {
  const config = await getConfigFromKV(env);
  return Response.json({
    canvasWidth: config.canvasWidth,
    canvasHeight: config.canvasHeight,
    cooldownSeconds: config.cooldownSeconds
  });
}

async function getInvitationCodes(request, env) {
  const config = await getConfigFromKV(env);
  return Response.json({ invitationCodes: config.invitationCodes });
}

async function addInvitationCode(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { code, timeWindow, maxCount } = body;

  if (!code) {
    return Response.json({ error: '请填写邀请码' }, { status: 400 });
  }

  const config = await getConfigFromKV(env);
  // 判断是否已存在
  let exists = false;
  for (const item of config.invitationCodes) {
    if ((typeof item === 'string' && item === code) || (item && typeof item === 'object' && item.code === code)) {
      exists = true;
      break;
    }
  }
  if (exists) {
    return Response.json({ error: '该邀请码已存在' }, { status: 400 });
  }

  // 保存为对象数组
  config.invitationCodes.push({ code, timeWindow: timeWindow ?? 3600, maxCount: maxCount ?? 1 });
  await env.ED_PB_KV.put('config', JSON.stringify(config));

  return Response.json({ success: true, invitationCodes: config.invitationCodes });
}

async function deleteInvitationCode(request, env, code) {
  const config = await getConfigFromKV(env);
  // 支持对象数组和字符串数组
  const index = config.invitationCodes.findIndex(item => (typeof item === 'string' && item === code) || (item && typeof item === 'object' && item.code === code));
  if (index === -1) {
    return Response.json({ error: '未找到该邀请码' }, { status: 404 });
  }

  config.invitationCodes.splice(index, 1);
  await env.ED_PB_KV.put('config', JSON.stringify(config));

  return Response.json({ success: true, invitationCodes: config.invitationCodes });
}

async function updateCooldown(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { cooldownSeconds } = body;

  if (typeof cooldownSeconds !== 'number' || cooldownSeconds < 0) {
    return Response.json({ error: '无效的冷却时间' }, { status: 400 });
  }

  const config = await getConfigFromKV(env);
  config.cooldownSeconds = cooldownSeconds;
  await env.ED_PB_KV.put('config', JSON.stringify(config));

  return Response.json({ success: true, cooldownSeconds });
}

async function checkAdminAuth(auth, env) {
  if (!auth.startsWith('Basic ')) return false;

  const encoded = auth.split(' ')[1];
  const decoded = atob(encoded);
  const [username, password] = decoded.split(':');

  const config = await getConfigFromKV(env);
  const hashedPassword = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(password));
  const hashHex = Array.from(new Uint8Array(hashedPassword)).map(b => b.toString(16).padStart(2, '0')).join('');

  return username === config.adminUsername && hashHex === config.adminPassword;
}

async function getConfigFromKV(env) {
  let config = await env.ED_PB_KV.get('config', { type: 'json' });
  if (!config) {
    // Initialize default config
    config = {
      canvasWidth: 960,
      canvasHeight: 540,
      cooldownSeconds: 0,
      adminUsername: 'PaintBoard',
      adminPassword: '26d37903166ba855278d8029878e9053923aa77eeba1943589d4b4774f1b14482c7233ab3f459ff86e99db9f1288447234ee80cfcb3f26330b94efa4267cea1a',
      invitationCodes: ['INVITE2024', 'DEMO1234', 'TEST5678']
    };
    await env.ED_PB_KV.put('config', JSON.stringify(config));
  }
  return config;
}

// 新增 API 路由：获取邀请码剩余可用次数
async function getInvitationCodeUsage(request, env, code) {
  const config = await getConfigFromKV(env);
  let inviteObj = null;
  if (Array.isArray(config.invitationCodes)) {
    for (const item of config.invitationCodes) {
      if ((typeof item === 'string' && item === code) || (item && typeof item === 'object' && item.code === code)) {
        inviteObj = typeof item === 'string' ? { code: item, timeWindow: 3600, maxCount: 1 } : item;
        break;
      }
    }
  }
  if (!inviteObj) {
    return Response.json({ error: '邀请码无效！' }, { status: 404 });
  }
  const { timeWindow = 3600, maxCount = 1 } = inviteObj;
  const tokens = await env.ED_PB_KV.get('tokens', { type: 'json' }) || {};
  const now = Date.now();
  let count = 0;
  let windowStart = now;
  for (const [token, data] of Object.entries(tokens)) {
    if (data.inviteCode === code) {
      if (now - data.createdAt < (inviteObj.timeWindow ?? timeWindow) * 1000) {
        count++;
        if (data.createdAt < windowStart) windowStart = data.createdAt;
      }
    }
  }
  const leftCount = Math.max((inviteObj.maxCount ?? maxCount) - count, 0);
  return Response.json({ leftCount });
}