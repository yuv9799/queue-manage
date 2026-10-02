import http from 'node:http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { initSocket } from './sockets/queueSocket.js';

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.set('io', io);
initSocket(io);

server.listen(PORT, () => {
  console.log(`\n  KIMS Queue backend running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health\n`);
});

export { app, server, io };