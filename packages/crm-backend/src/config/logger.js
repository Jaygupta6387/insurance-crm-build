const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const { nodeEnv } = require('./env');

const { combine, timestamp, errors, printf, colorize, json } = format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
  )
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const isDesktop = process.env.CRM_MODE === 'desktop';
const logDir = process.env.CRM_LOG_DIR || (isDesktop ? null : 'logs');

const fileTransports = [];
if (logDir) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fileTransports.push(
      new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
      new transports.File({ filename: path.join(logDir, 'combined.log') })
    );
  } catch {
    // Installed app folders can be read-only — fall back to console logging only.
  }
}

const logger = createLogger({
  level: nodeEnv === 'production' ? 'warn' : 'debug',
  format: nodeEnv === 'production' ? prodFormat : devFormat,
  transports: [new transports.Console(), ...fileTransports],
  ...(fileTransports.length
    ? {
        exceptionHandlers: [new transports.File({ filename: path.join(logDir, 'exceptions.log') })],
        rejectionHandlers: [new transports.File({ filename: path.join(logDir, 'rejections.log') })],
      }
    : {}),
});

module.exports = logger;
