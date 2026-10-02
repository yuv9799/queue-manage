import { io } from 'socket.io-client';
import { api } from './api.js';

let socket = null;

export function getSocket() {
  // No socket when the API base isn't configured (e.g. production without
  // VITE_API_URL): real-time falls back to the REST polling already in pages.
  if (!api.BASE) return null;
  if (!socket) {
    socket = io(api.BASE, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function subscribeAll(cb) {
  const s = getSocket();
  if (!s) return () => {};
  s.emit('subscribe:all');
  s.on('token:updated', cb);
  s.on('queue:updated', cb);
  return () => {
    s.off('token:updated', cb);
    s.off('queue:updated', cb);
  };
}

// Staff Control Center real-time subscription.
export function subscribeStaff(cb) {
  const s = getSocket();
  if (!s) return () => {};
  s.emit('subscribe:staff');
  s.on('staff:update', cb);
  s.on('staff:activity', cb);
  s.on('token:updated', cb);
  s.on('queue:updated', cb);
  return () => {
    s.off('staff:update', cb);
    s.off('staff:activity', cb);
    s.off('token:updated', cb);
    s.off('queue:updated', cb);
  };
}

export default getSocket;