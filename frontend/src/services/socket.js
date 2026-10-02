import { io } from 'socket.io-client';
import { api } from './api.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(api.BASE, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function subscribeAll(cb) {
  const s = getSocket();
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