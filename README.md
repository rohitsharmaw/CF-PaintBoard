# PaintBoard

A collaborative pixel drawing board with token-based authentication and real-time updates.

## Features

- 🎨 Draw pixels on a shared canvas with custom HEX colors
- 👀 View the live canvas without signing in; tokens are only required to draw
- 🔐 Token-based authentication using invitation codes
- ⏱️ Configurable cooldown system (default: 30 seconds)
- 🔄 Real-time canvas updates via WebSocket
- 👨‍💼 Admin panel for managing invitation codes and settings (protected with Basic Auth)
- 📝 Configuration file for easy customization

## Installation (Local Development)

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Deployment to Cloudflare

### 1. Deploy Static Files to Cloudflare Pages

1. Push your code to GitHub/GitLab.
2. Go to Cloudflare Dashboard > Pages.
3. Create a new project and connect your repository.
4. Set build settings:
   - Build command: (leave empty)
   - Build output directory: `public`
5. Deploy the Pages site.

### 2. Deploy API and WebSocket to Cloudflare Workers

1. Install Wrangler (if not already):
```bash
npm install -g wrangler
```

2. Authenticate with Cloudflare:
```bash
wrangler auth login
```

3. Create KV namespace:
```bash
wrangler kv:namespace create "PAINTBOARD_KV"
```
   Copy the namespace ID and update `wrangler.toml`.

4. Deploy the Worker:
```bash
wrangler deploy
```

5. Update `public/app.js`:
   - Set `API_BASE` to your Workers URL, e.g., `https://your-worker.your-account.workers.dev`

### 3. Access Your App

- Static files: `https://your-pages-site.pages.dev`
- API/WebSocket: `https://your-worker.your-account.workers.dev`

## Configuration

Edit `config.json` to customize (for local dev). For production, config is stored in KV.

- `canvasWidth`: Width of the canvas in pixels
- `canvasHeight`: Height of the canvas in pixels
- `cooldownSeconds`: Time in seconds between each draw action
- `port`: Server port (default: 3000)
- `adminUsername`: Username for the admin area (Basic Auth)
- `adminPassword`: Password for the admin area (Basic Auth)
- `invitationCodes`: Array of valid invitation codes

```json
{
  "canvasWidth": 960,
  "canvasHeight": 540,
  "cooldownSeconds": 0,
  "port": 3000,
  "adminUsername": "ED_Builder",
  "adminPassword": "38e1e42867ab1f8a4d61a82da3b318703b4e6d93eb503e4e3ce994637fa1d19041c6ce332278f0655a060e043aed24163a0c26ce0d4546dbc092c6b4ae0f0dff",
  "invitationCodes": [
    "INVITE2024",
    "DEMO1234",
    "TEST5678"
  ]
}
```

## Usage

### Getting Started

1. Browse to the board to watch the canvas update in real time.
2. When you're ready to draw, enter an invitation code (default codes: `INVITE2024`, `DEMO1234`, `TEST5678`).
3. Click "Generate Token" to receive your drawing token and keep it handy for future sessions.
4. Start drawing on the canvas!

### Drawing

1. Select a color using the color picker or enter a HEX color code
2. Click on any pixel in the canvas to draw
3. Wait for the cooldown period before drawing again

### Admin Panel

The admin panel allows you to:
- View all invitation codes
- Add new invitation codes
- Delete existing invitation codes
- Update the cooldown time

Open `/admin` and authenticate with the configured username and password to access these features.

## API Endpoints

### Public Endpoints

- `POST /api/generate-token` - Generate a drawing token
  - Body: `{ "invitationCode": "string" }`
  
- `POST /api/validate-token` - Validate a token
  - Body: `{ "token": "string" }`
  
- `POST /api/draw` - Draw a pixel
  - Body: `{ "token": "string", "x": number, "y": number, "color": "#RRGGBB" }`
  
- `GET /api/canvas` - Get current canvas state
  
- `GET /api/config` - Get public configuration

### Admin Endpoints

- `GET /api/admin/invitation-codes` - Get all invitation codes
- `POST /api/admin/invitation-codes` - Add a new invitation code
  - Body: `{ "code": "string" }`
- `DELETE /api/admin/invitation-codes/:code` - Delete an invitation code
- `PUT /api/admin/cooldown` - Update cooldown time
  - Body: `{ "cooldownSeconds": number }`

## WebSocket

Connect to the WebSocket server to receive real-time canvas updates:

```javascript
const ws = new WebSocket('wss://your-worker.your-account.workers.dev/ws');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'pixel') {
    // New pixel drawn: message.x, message.y, message.color
  }
};
```

## License

MIT