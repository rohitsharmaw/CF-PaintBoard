const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const adminStaticPath = path.join(__dirname, 'admin');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Admin auth middleware
function adminAuth(req, res, next) {
  if (!reloadConfig()) {
    return res.status(500).send('配置加载失败！');
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="PaintBoard Admin"');
    return res.status(401).send('401 - 需要身份验证');
  }

  const encoded = header.split(' ')[1];
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex === -1) {
    res.set('WWW-Authenticate', 'Basic realm="PaintBoard Admin"');
    return res.status(401).send('无效的身份验证格式');
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username === config.adminUsername && crypto.createHash('sha512').update(password).digest('hex') === config.adminPassword) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="PaintBoard Admin"');
  return res.status(401).send('用户名或密码错误');
}

// Protected admin assets
if (fs.existsSync(adminStaticPath)) {
  app.use('/admin', adminAuth, express.static(adminStaticPath));
}

// Data structures
const tokens = new Map(); // Map<token, { inviteCode, createdAt }>
const cooldowns = new Map(); // Map<token, lastDrawTime>
const canvas = {}; // { "x,y": "#hexcolor" }

// Initialize canvas with white background
for (let x = 0; x < config.canvasWidth; x++) {
  for (let y = 0; y < config.canvasHeight; y++) {
    canvas[`${x},${y}`] = '#FFFFFF';
  }
}

// Helper function to reload config
function reloadConfig() {
  try {
    const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = newConfig;
    console.log('配置已重新加载');
    return true;
  } catch (error) {
    console.error('重载配置时发生错误：', error);
    return false;
  }
}

// Helper function to save config
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('保存配置时发生错误：', error);
    return false;
  }
}

// Broadcast to all connected clients
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// API: Generate token with invitation code
// 限流缓存结构：Map<code, { windowStart, count }>
const inviteRateLimit = new Map();

app.post('/api/generate-token', (req, res) => {
  const { invitationCode } = req.body;
  if (!invitationCode) {
    return res.status(400).json({ error: '请填写邀请码' });
  }
  reloadConfig();
  // 查找邀请码对象
  const inviteObj = config.invitationCodes.find(obj => obj.code === invitationCode);
  if (!inviteObj) {
    return res.status(403).json({ error: '邀请码无效！' });
  }
  const now = Date.now();
  // 获取限流参数
  const { timeWindow, maxCount } = inviteObj;
  // 获取当前邀请码的限流状态
  let rate = inviteRateLimit.get(invitationCode);
  if (!rate || now - rate.windowStart >= timeWindow * 1000) {
    // 新窗口或首次使用，重置计数
    rate = { windowStart: now, count: 0 };
  }
  // 统计当前窗口内已生成 token 数
    const leftCount = maxCount - rate.count;
    const resetIn = Math.ceil((rate.windowStart + timeWindow * 1000 - now) / 1000);
    if (leftCount <= 0) {
      return res.status(429).json({ error: `此邀请码在本时段已达最大使用次数，请 ${resetIn} 秒后再试。`, resetIn, leftCount: 0 });
    }
  // 生成 token
  const token = uuidv4();
  tokens.set(token, {
    inviteCode: invitationCode,
    createdAt: now
  });
  // 更新计数
  rate.count++;
  inviteRateLimit.set(invitationCode, rate);
    res.json({ token, resetIn, leftCount });
});

// API: Validate token
app.post('/api/validate-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: '请填写 token' });
  }
  
  if (!tokens.has(token)) {
    return res.status(403).json({ error: '此 token 无效！' });
  }
  
  res.json({ valid: true });
});

// API: Draw pixel
app.post('/api/draw', (req, res) => {
  const { token, x, y, color } = req.body;
  
  // Validate token
  if (!token || !tokens.has(token)) {
    return res.status(403).json({ error: '此 token 无效！' });
  }
  
  // Validate coordinates
  if (x < 0 || x >= config.canvasWidth || y < 0 || y >= config.canvasHeight) {
    return res.status(400).json({ error: '绘画位置无效！' });
  }
  
  // Validate color (HEX format)
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: '颜色格式错误，请使用 HEX 十六进制颜色格式' });
  }
  
  // Check cooldown
  const now = Date.now();
  const lastDraw = cooldowns.get(token);
  const cooldownMs = config.cooldownSeconds * 1000;
  
  if (lastDraw && (now - lastDraw) < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - (now - lastDraw)) / 1000);
    return res.status(429).json({ 
      error: '绘画冷却中……',
      remainingSeconds
    });
  }
  
  // Update canvas
  const key = `${x},${y}`;
  canvas[key] = color.toUpperCase();
  cooldowns.set(token, now);
  
  // Broadcast update to all clients
  broadcast({
    type: 'pixel',
    x,
    y,
    color: color.toUpperCase()
  });
  
  res.json({ 
    success: true,
    nextDrawIn: config.cooldownSeconds
  });
});

// API: Get canvas state
app.get('/api/canvas', (req, res) => {
  res.json({
    width: config.canvasWidth,
    height: config.canvasHeight,
    pixels: canvas
  });
});

// API: Get config (public info only)
app.get('/api/config', (req, res) => {
  res.json({
    canvasWidth: config.canvasWidth,
    canvasHeight: config.canvasHeight,
    cooldownSeconds: config.cooldownSeconds
  });
});

// Admin routes require authentication
app.use('/api/admin', adminAuth);

// Admin API: Get all invitation codes
app.get('/api/admin/invitation-codes', (req, res) => {
  reloadConfig();
  res.json({ invitationCodes: config.invitationCodes });
});

// Admin API: Add invitation code
app.post('/api/admin/invitation-codes', (req, res) => {
  const { code, timeWindow, maxCount } = req.body;
  if (!code || typeof timeWindow !== 'number' || typeof maxCount !== 'number') {
    return res.status(400).json({ error: '请填写完整的邀请码参数' });
  }
  reloadConfig();
  if (config.invitationCodes.find(obj => obj.code === code)) {
    return res.status(400).json({ error: '该邀请码已存在' });
  }
  config.invitationCodes.push({ code, timeWindow, maxCount });
  if (saveConfig()) {
    res.json({ success: true, invitationCodes: config.invitationCodes });
  } else {
    res.status(500).json({ error: '保存配置时发生错误！' });
  }
});

// Admin API: Delete invitation code
app.delete('/api/admin/invitation-codes/:code', (req, res) => {
  const { code } = req.params;
  reloadConfig();
  const index = config.invitationCodes.findIndex(obj => obj.code === code);
  if (index === -1) {
    return res.status(404).json({ error: '未找到该邀请码' });
  }
  config.invitationCodes.splice(index, 1);
  if (saveConfig()) {
    res.json({ success: true, invitationCodes: config.invitationCodes });
  } else {
    res.status(500).json({ error: '保存配置时发生错误！' });
  }
});

// Admin API: Update cooldown
app.put('/api/admin/cooldown', (req, res) => {
  const { cooldownSeconds } = req.body;
  
  if (typeof cooldownSeconds !== 'number' || cooldownSeconds < 0) {
    return res.status(400).json({ error: '无效的冷却时间' });
  }
  
  reloadConfig();
  config.cooldownSeconds = cooldownSeconds;
  
  if (saveConfig()) {
    res.json({ success: true, cooldownSeconds: config.cooldownSeconds });
  } else {
    res.status(500).json({ error: '保存配置时发生错误！' });
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Send initial canvas state
  ws.send(JSON.stringify({
    type: 'init',
    width: config.canvasWidth,
    height: config.canvasHeight,
    pixels: canvas
  }));
  
  ws.on('close', () => {
    console.log('WebSocket 连接已关闭！');
  });
});

// Start server
const PORT = process.env.PORT || config.port;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
