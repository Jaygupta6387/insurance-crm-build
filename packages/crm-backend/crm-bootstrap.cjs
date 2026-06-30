'use strict';

const path = require('path');

const report = (label, err) => {
  const message = err && err.stack ? err.stack : String(err);
  console.error(`[CRM ${label}] ${message}`);
};

process.on('uncaughtException', (err) => {
  report('uncaughtException', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  report('unhandledRejection', reason);
  process.exit(1);
});

try {
  require(path.join(__dirname, 'src', 'server.js'));
} catch (err) {
  report('startup', err);
  process.exit(1);
}
