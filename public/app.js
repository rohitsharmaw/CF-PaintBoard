// Global variables
let canvas, ctx;
let ws;
let currentToken = localStorage.getItem('paintboardToken');
let config = { cooldownSeconds: 30, canvasWidth: 100, canvasHeight: 100 };
let cooldownEnd = 0;
let cooldownInterval;

// Initialize on page load
window.onload = async () => {
    setupColorSync();
    updateTokenDisplay();

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

    if (currentToken) {
        tokenValueElement.textContent = currentToken;
        tokenDisplayElement.classList.remove('hidden');
    } else {
        tokenValueElement.textContent = '';
        tokenDisplayElement.classList.add('hidden');
    }
}

// Token generation
async function generateToken() {
    const invitationCode = document.getElementById('invitationCode').value.trim();
    
    if (!invitationCode) {
        alert('Please enter an invitation code');
        return;
    }
    
    try {
        const response = await fetch('/api/generate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invitationCode })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentToken = data.token;
            localStorage.setItem('paintboardToken', currentToken);
            updateTokenDisplay();
        } else {
            alert(data.error || 'Failed to generate token');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to generate token');
    }
}

function copyToken() {
    const tokenValue = document.getElementById('tokenValue').textContent;
    if (!tokenValue) {
        alert('No token available. Generate one first.');
        return;
    }
    navigator.clipboard.writeText(tokenValue).then(() => {
        alert('Token copied to clipboard!');
    });
}

async function validateToken() {
    if (!currentToken) {
        return false;
    }

    try {
        const response = await fetch('/api/validate-token', {
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
        const configResponse = await fetch('/api/config');
        config = await configResponse.json();
        
        document.getElementById('cooldownTime').textContent = config.cooldownSeconds;
        document.getElementById('canvasSize').textContent = 
            `${config.canvasWidth}x${config.canvasHeight}`;
        
        // Load canvas
        const canvasResponse = await fetch('/api/canvas');
        const canvasData = await canvasResponse.json();
        
        setupCanvas(canvasData.width, canvasData.height);
        drawAllPixels(canvasData.pixels);
        
        // Connect WebSocket
        connectWebSocket();
    } catch (error) {
        console.error('Error loading canvas:', error);
        alert('Failed to load canvas');
    }
}

function setupCanvas(width, height) {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    const pixelSize = 5;
    canvas.width = width * pixelSize;
    canvas.height = height * pixelSize;
    
    canvas.onclick = handleCanvasClick;
}

function drawAllPixels(pixels) {
    const pixelSize = canvas.width / config.canvasWidth;
    
    for (let key in pixels) {
        const [x, y] = key.split(',').map(Number);
        const color = pixels[key];
        
        ctx.fillStyle = color;
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
}

function drawPixel(x, y, color) {
    const pixelSize = canvas.width / config.canvasWidth;
    ctx.fillStyle = color;
    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
}

async function handleCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();
    const pixelSize = canvas.width / config.canvasWidth;
    
    const x = Math.floor((event.clientX - rect.left) / pixelSize);
    const y = Math.floor((event.clientY - rect.top) / pixelSize);
    
    const color = document.getElementById('colorHex').value;
    
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        alert('Invalid color format. Please use HEX format like #FF0000');
        return;
    }

    if (!currentToken) {
        alert('You need a valid token to draw. Generate one using an invitation code above.');
        return;
    }
    
    try {
        const response = await fetch('/api/draw', {
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
            alert(`Cooldown active. Wait ${data.remainingSeconds} seconds.`);
            startCooldown(data.remainingSeconds);
        } else if (response.status === 403) {
            alert((data && data.error) || 'Token is invalid. Please generate a new one.');
            localStorage.removeItem('paintboardToken');
            currentToken = null;
            updateTokenDisplay();
        } else {
            alert(data.error || 'Failed to draw pixel');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to draw pixel');
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
            `Cooldown: ${remaining}s`;
    } else {
        document.getElementById('cooldownStatus').textContent = '';
        if (cooldownInterval) {
            clearInterval(cooldownInterval);
        }
    }
}

// WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
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
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Logout
function logout() {
    localStorage.removeItem('paintboardToken');
    currentToken = null;
    updateTokenDisplay();
}

