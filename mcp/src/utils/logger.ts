import fs from 'fs';
import os from 'os';
import path from 'path';
import winston from 'winston';
import { isCloudMode } from './cloud-mode.js';
// Use require for winston-daily-rotate-file to avoid webpack bundling issues
// Handle both CommonJS and ES module exports
const DailyRotateFileModule = require('winston-daily-rotate-file');
const DailyRotateFile = DailyRotateFileModule.default || DailyRotateFileModule;

// Get log directory from environment variable or use default
const getLogDir = (): string => {
  const envLogDir = process.env.CLOUDBASE_LOG_DIR;
  if (envLogDir) {
    return envLogDir;
  }
  return path.join(os.homedir(), '.cloudbase-mcp', 'logs');
};

// Ensure log directory exists
const logDir = getLogDir();
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Determine log level from environment
const getLogLevel = (): string => {
  const envDebug = process.env.MCP_DEBUG;
  if (envDebug === 'false') {
    return 'info';
  }
  return 'debug';
};

// Determine if console logging should be enabled
const shouldUseConsole = (): boolean => {
  return (
    process.env.MCP_CONSOLE_LOG === 'true'
  );
};

// Custom format for log messages
const logFormat = winston.format.printf(({ timestamp, level, message, ...metadata }) => {
  let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  // Append metadata if present
  if (Object.keys(metadata).length > 0) {
    // Remove winston internal fields
    const { [Symbol.for('level')]: _, [Symbol.for('message')]: __, ...data } = metadata;
    if (Object.keys(data).length > 0) {
      logMessage += ` ${JSON.stringify(data, null, 2)}`;
    }
  }

  return logMessage;
});

// Create transports array
const transports: winston.transport[] = [];

// Console transport (only in development or when explicitly enabled)
if (shouldUseConsole()) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        logFormat
      ),
      stderrLevels: ['error', 'warn', 'info', 'debug'], // All logs go to stderr
    })
  );
}

if (!isCloudMode() && process.env.CLOUDBASE_MCP_DISABLE_LOG_FILE !== 'true') {
  // File transport with daily rotation
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'cloudbase-mcp-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        logFormat
      ),
      maxFiles: '30d', // Keep logs for 30 days
      maxSize: '20m', // Max file size before rotation
      zippedArchive: false, // Don't compress old logs
    })
  );

}

// Create winston logger instance
const logger = winston.createLogger({
  level: getLogLevel(),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  transports,
  // Handle exceptions and rejections
  exceptionHandlers: transports,
  rejectionHandlers: transports,
});

// Helper function to log with optional data
const logWithData = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: object | Error
) => {
  if (data !== undefined) {
    // Convert Error to object format for winston
    if (data instanceof Error) {
      logger.log(level, message, {
        error: {
          name: data.name,
          message: data.message,
          stack: data.stack,
        },
      });
    } else {
      logger.log(level, message, data);
    }
  } else {
    logger.log(level, message);
  }
};

// Export convenience functions
export const debug = (message: string, data?: object | Error) => {
  logWithData('debug', message, data);
};

export const info = (message: string, data?: object | Error) => {
  logWithData('info', message, data);
};

export const warn = (message: string, data?: object | Error) => {
  logWithData('warn', message, data);
};

export const error = (message: string, data?: object | Error) => {
  logWithData('error', message, data);
};

// Export logger instance for advanced usage
export { logger };
