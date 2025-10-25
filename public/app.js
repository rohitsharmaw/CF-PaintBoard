// Global variables
// 策略切换
function switchTokenStrategy(strategy) {
    const inviteGroup = document.getElementById('inviteGroup');
    const inputTokenGroup = document.getElementById('inputTokenGroup');
    if (strategy === 'invite') {
        inviteGroup.classList.remove('hidden');
        inputTokenGroup.classList.add('hidden');
    } else {
        inviteGroup.classList.add('hidden');
        inputTokenGroup.classList.remove('hidden');
    }
}

// 提交已有 token 并鉴权
async function submitToken() {
    const inputToken = document.getElementById('inputToken').value.trim();
    if (!inputToken) {
        alert('请输入 token');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/validate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inputToken })
        });
        const data = await response.json();
        if (response.ok && data.valid) {
            currentToken = inputToken;
            lastTokenSource = 'input';
            localStorage.setItem('paintboardToken', currentToken);
            updateTokenDisplay();
            alert('Token 验证成功，可以开始绘画！');
        } else {
            alert(data.error || 'Token 无效');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Token 验证失败');
    }
}
let canvas, ctx;
let ws;
let currentToken = localStorage.getItem('paintboardToken');
let config = { cooldownSeconds: 30, canvasWidth: 100, canvasHeight: 100 };
let cooldownEnd = 0;
let cooldownInterval;
let lastTokenSource = null; // 'invite' | 'input'

// API base URL - change this to your Workers URL if static files are served separately
const API_BASE = 'https://pb.ed-builder.top';  // e.g., 'https://your-worker.your-account.workers.dev'

// Initialize on page load
window.onload = async () => {
    setupColorSync();
    updateTokenDisplay();

    // 默认显示邀请码方式
    switchTokenStrategy('invite');

    await loadCanvas();

    if (currentToken) {
        await validateToken();
    }
};

function setupColorSync() {
    const colorPicker = document.getElementById('colorPicker');
    const colorHex = document.getElementById('colorHex');

    colorPicker.addEventListener('input', (e) => {
        colorHex.value = e.target.value.toUpperCase();
    });

    colorHex.addEventListener('input', (e) => {
        let value = e.target.value;
        if (!value.startsWith('#')) {
            value = '#' + value;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            colorPicker.value = value;
        }
        colorHex.value = value.toUpperCase();
    });
}

function updateTokenDisplay() {
    const tokenValueElement = document.getElementById('tokenValue');
    const tokenDisplayElement = document.getElementById('tokenDisplay');

    if (!tokenValueElement || !tokenDisplayElement) {
        return;
    }

    if (currentToken && lastTokenSource === 'invite') {
        tokenValueElement.textContent = currentToken;
        tokenDisplayElement.classList.remove('hidden');
    } else {
        tokenValueElement.textContent = '';
        tokenDisplayElement.classList.add('hidden');
        // 清除 token 时，回到策略选择界面
        switchTokenStrategy(document.querySelector('input[name="tokenStrategy"]:checked').value);
    }
}

function logout() {
    localStorage.removeItem('paintboardToken');
    currentToken = null;
    updateTokenDisplay();
    alert('已清除 token，可以重新选择获取方式。');
}

// Token generation
async function generateToken() {
    const invitationCode = document.getElementById('invitationCode').value.trim();
    if (!invitationCode) {
        alert('请输入邀请码');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/generate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invitationCode })
        });
        const data = await response.json();
        if (response.ok) {
            currentToken = data.token;
            lastTokenSource = 'invite';
            localStorage.setItem('paintboardToken', currentToken);
            updateTokenDisplay();
            // token-box显示后再赋值T/X，确保渲染
            setTimeout(() => {
                // 如果 leftCount 已经 <= 0，表示该邀请码不能再生成，显示为 0
                if (typeof data.leftCount !== 'undefined' && data.leftCount <= 0) {
                    // 保证后面的 data.leftCount-1 能得到 0
                    data.leftCount = 1;
                    document.getElementById('resetSeconds').textContent = '0';
                } else {
                    document.getElementById('resetSeconds').textContent =
                        (typeof data.resetIn !== 'undefined') ? Math.max(0, data.resetIn - 1) : 'T';
                }
                document.getElementById('remainingGenerations').textContent = data.leftCount-1 ?? 'X';
            }, 50);
        } else {
            if (typeof data.resetIn !== 'undefined' && typeof data.leftCount !== 'undefined') {
                document.getElementById('resetSeconds').textContent = data.resetIn-1;
                document.getElementById('remainingGenerations').textContent = data.leftCount-1;
            }
            alert(data.error || '生成 token 失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('生成 token 失败');
    }
}

function copyToken() {
    const tokenValue = document.getElementById('tokenValue').textContent;
    if (!tokenValue) {
        alert('没有可用的 token。请先生成一个。');
        return;
    }
    navigator.clipboard.writeText(tokenValue).then(() => {
        alert('Token 已复制到剪贴板！');
    });
}

async function validateToken() {
    if (!currentToken) {
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/api/validate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentToken })
        });

        if (response.ok) {
            updateTokenDisplay();
            return true;
        }

        localStorage.removeItem('paintboardToken');
        currentToken = null;
        updateTokenDisplay();
        return false;
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
}

// Canvas functions
async function loadCanvas() {
    try {
        // Load config
        const configResponse = await fetch(`${API_BASE}/api/config`);
        config = await configResponse.json();
        
        document.getElementById('cooldownTime').textContent = config.cooldownSeconds;
        document.getElementById('canvasSize').textContent = 
            `${config.canvasWidth}x${config.canvasHeight}`;
        
        // Load canvas
        const canvasResponse = await fetch(`${API_BASE}/api/canvas`);
        const canvasData = await canvasResponse.json();
        
        setupCanvas(canvasData.width, canvasData.height);
        drawAllPixels(canvasData.pixels);
        
        // Connect WebSocket
        connectWebSocket();
    } catch (error) {
        console.error('加载 Canvas 时发生错误：', error);
        alert('加载 Canvas 失败！');
    }
}

function setupCanvas(width, height) {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    const pixelSize = 5;
    canvas.width = width * pixelSize;
    canvas.height = height * pixelSize;
    
    canvas.onclick = handleCanvasClick;
    
    // Resize canvas to fit container
    resizeCanvas();
    
    // Add resize listener
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    if (!canvas) return;
    
    const container = document.querySelector('.canvas-container');
    const containerRect = container.getBoundingClientRect();
    
    const scaleX = containerRect.width / canvas.width;
    const scaleY = containerRect.height / canvas.height;
    const scale = Math.min(scaleX, scaleY);
    
    canvas.style.width = (canvas.width * scale) + 'px';
    canvas.style.height = (canvas.height * scale) + 'px';
}

function drawAllPixels(pixels) {
    const pixelSize = 5; // Internal pixel size
    
    for (let key in pixels) {
        const [x, y] = key.split(',').map(Number);
        const color = pixels[key];
        
        ctx.fillStyle = color;
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
}

function drawPixel(x, y, color) {
    const pixelSize = 5; // Internal pixel size
    ctx.fillStyle = color;
    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
}

async function handleCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();
    const displayPixelSize = rect.width / config.canvasWidth;
    
    const x = Math.floor((event.clientX - rect.left) / displayPixelSize);
    const y = Math.floor((event.clientY - rect.top) / displayPixelSize);
    
    const color = document.getElementById('colorHex').value;
    
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        alert('颜色格式错误，请使用 HEX 十六进制颜色格式');
        return;
    }

    if (!currentToken) {
        alert('您需要一个有效的 token 才能绘画。请使用上面的邀请码生成一个。');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/draw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: currentToken,
                x,
                y,
                color
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            startCooldown(data.nextDrawIn);
        } else if (response.status === 429) {
            alert(`绘画冷却中……请等待 ${data.remainingSeconds} 秒。`);
            startCooldown(data.remainingSeconds);
        } else if (response.status === 403) {
            alert((data && data.error) || 'Token 无效。请生成一个新的。');
            localStorage.removeItem('paintboardToken');
            currentToken = null;
            updateTokenDisplay();
        } else {
            alert(data.error || '绘制像素失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('绘制像素失败！');
    }
}

function startCooldown(seconds) {
    cooldownEnd = Date.now() + (seconds * 1000);
    
    if (cooldownInterval) {
        clearInterval(cooldownInterval);
    }
    
    updateCooldownDisplay();
    cooldownInterval = setInterval(updateCooldownDisplay, 1000);
}

function updateCooldownDisplay() {
    const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
    
    if (remaining > 0) {
        document.getElementById('cooldownStatus').textContent = 
            `剩余冷却时间: ${remaining}s`;
    } else {
        document.getElementById('cooldownStatus').textContent = '在绘板上选择一个点吧！';
        if (cooldownInterval) {
            clearInterval(cooldownInterval);
        }
    }
}

// WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = API_BASE ? new URL(API_BASE).host : window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws`);
    
    ws.onopen = () => {
        console.log('WebSocket 已连接');
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'init') {
            // Initial canvas state already loaded via HTTP
        } else if (message.type === 'pixel') {
            drawPixel(message.x, message.y, message.color);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket 已断连！3秒后重连……');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket 错误：', error);
    };
}

// Logout
function logout() {
    localStorage.removeItem('paintboardToken');
    currentToken = null;
    updateTokenDisplay();
}