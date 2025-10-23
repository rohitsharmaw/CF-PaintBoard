# PaintBoard

A collaborative pixel drawing board with token-based authentication and real-time updates.

## Features

- 🎨 Draw pixels on a shared canvas with custom HEX colors
- � View the live canvas without signing in; tokens are only required to draw
- �🔐 Token-based authentication using invitation codes
- ⏱️ Configurable cooldown system (default: 30 seconds)
- 🔄 Real-time canvas updates via WebSocket
- 👨‍💼 Admin panel for managing invitation codes and settings (protected with Basic Auth)
- 📝 Configuration file for easy customization

## Installation

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

## Configuration

Edit `config.json` to customize:

- `canvasWidth`: Width of the canvas in pixels
- `canvasHeight`: Height of the canvas in pixels
- `cooldownSeconds`: Time in seconds between each draw action
- `port`: Server port (default: 3000)
- `adminUsername`: Username for the admin area (Basic Auth)
- `adminPassword`: Password for the admin area (Basic Auth)
- `invitationCodes`: Array of valid invitation codes

```json
{
  "canvasWidth": 100,
  "canvasHeight": 100,
  "cooldownSeconds": 30,
  "port": 3000,
  "adminUsername": "admin",
  "adminPassword": "paintboard123",
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

Open `http://localhost:3000/admin` and authenticate with the configured username and password to access these features.

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
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'pixel') {
    // New pixel drawn: message.x, message.y, message.color
  }
};
```

## License

MIT