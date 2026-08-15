import { createServer } from 'net';

/**
 * Reserve a free TCP port.
 * If `preferred` is set and free, use it; otherwise fall back to an OS-assigned port.
 */
export default function getPort(preferred = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const server = createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (preferred > 0 && port === preferred) {
          // Preferred port busy — fall back to any free port.
          tryListen(0);
          return;
        }
        reject(err);
      });
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        const chosen = typeof addr === 'object' && addr ? addr.port : port;
        server.close(() => resolve(chosen));
      });
    };
    tryListen(preferred);
  });
}
