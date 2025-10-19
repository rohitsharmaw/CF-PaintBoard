const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

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
    console.log('Configuration reloaded');
    return true;
  } catch (error) {
    console.error('Error reloading config:', error);
    return false;
  }
}

// Helper function to save config
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
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
app.post('/api/generate-token', (req, res) => {
  const { invitationCode } = req.body;
  
  if (!invitationCode) {
    return res.status(400).json({ error: 'Invitation code is required' });
  }
  
  // Reload config to get latest invitation codes
  reloadConfig();
  
  if (!config.invitationCodes.includes(invitationCode)) {
    return res.status(403).json({ error: 'Invalid invitation code' });
  }
  
  const token = uuidv4();
  tokens.set(token, {
    inviteCode: invitationCode,
    createdAt: Date.now()
  });
  
  res.json({ token });
});

// API: Validate token
app.post('/api/validate-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  if (!tokens.has(token)) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  res.json({ valid: true });
});

// API: Draw pixel
app.post('/api/draw', (req, res) => {
  const { token, x, y, color } = req.body;
  
  // Validate token
  if (!token || !tokens.has(token)) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  // Validate coordinates
  if (x < 0 || x >= config.canvasWidth || y < 0 || y >= config.canvasHeight) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  
  // Validate color (HEX format)
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Invalid color format. Use HEX format like #FF0000' });
  }
  
  // Check cooldown
  const now = Date.now();
  const lastDraw = cooldowns.get(token);
  const cooldownMs = config.cooldownSeconds * 1000;
  
  if (lastDraw && (now - lastDraw) < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - (now - lastDraw)) / 1000);
    return res.status(429).json({ 
      error: 'Cooldown active',
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

// Admin API: Get all invitation codes
app.get('/api/admin/invitation-codes', (req, res) => {
  reloadConfig();
  res.json({ invitationCodes: config.invitationCodes });
});

// Admin API: Add invitation code
app.post('/api/admin/invitation-codes', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  
  reloadConfig();
  
  if (config.invitationCodes.includes(code)) {
    return res.status(400).json({ error: 'Code already exists' });
  }
  
  config.invitationCodes.push(code);
  
  if (saveConfig()) {
    res.json({ success: true, invitationCodes: config.invitationCodes });
  } else {
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Admin API: Delete invitation code
app.delete('/api/admin/invitation-codes/:code', (req, res) => {
  const { code } = req.params;
  
  reloadConfig();
  
  const index = config.invitationCodes.indexOf(code);
  if (index === -1) {
    return res.status(404).json({ error: 'Code not found' });
  }
  
  config.invitationCodes.splice(index, 1);
  
  if (saveConfig()) {
    res.json({ success: true, invitationCodes: config.invitationCodes });
  } else {
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Admin API: Update cooldown
app.put('/api/admin/cooldown', (req, res) => {
  const { cooldownSeconds } = req.body;
  
  if (typeof cooldownSeconds !== 'number' || cooldownSeconds < 0) {
    return res.status(400).json({ error: 'Invalid cooldown value' });
  }
  
  reloadConfig();
  config.cooldownSeconds = cooldownSeconds;
  
  if (saveConfig()) {
    res.json({ success: true, cooldownSeconds: config.cooldownSeconds });
  } else {
    res.status(500).json({ error: 'Failed to save configuration' });
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
    console.log('WebSocket connection closed');
  });
});

// Start server
const PORT = process.env.PORT || config.port;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
