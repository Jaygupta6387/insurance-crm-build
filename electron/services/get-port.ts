import { createServer } from 'net';

export default function getPort(preferred = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(preferred, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : preferred;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}
