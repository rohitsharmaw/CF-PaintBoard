// src/websocket.js
import { DurableObject } from 'cloudflare:workers';

export class WebSocketHandler extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    this.clients = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    this.clients.push(server);

    // Send initial canvas
    const config = await this.getConfig();
    const canvas = await this.env.ED_PB_KV.get('canvas', { type: 'json' }) || {};
    server.send(JSON.stringify({
      type: 'init',
      width: config.canvasWidth,
      height: config.canvasHeight,
      pixels: canvas
    }));

    server.addEventListener('close', () => {
      this.clients = this.clients.filter(ws => ws !== server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async broadcast(message) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  async getConfig() {
    let config = await this.env.ED_PB_KV.get('config', { type: 'json' });
    if (!config) {
      config = {
        canvasWidth: 960,
        canvasHeight: 540,
        cooldownSeconds: 0,
        adminUsername: 'ED_Builder',
        adminPassword: '38e1e42867ab1f8a4d61a82da3b318703b4e6d93eb503e4e3ce994637fa1d19041c6ce332278f0655a060e043aed24163a0c26ce0d4546dbc092c6b4ae0f0dff',
        invitationCodes: ['INVITE2024', 'DEMO1234', 'TEST5678']
      };
      await this.env.ED_PB_KV.put('config', JSON.stringify(config));
    }
    return config;
  }
}
