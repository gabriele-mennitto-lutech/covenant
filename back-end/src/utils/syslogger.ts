import winston from 'winston';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        errors({ stack: true }),
        timestamp(),
        isDevelopment
            ? combine(colorize(), printf(({ level, message, timestamp, stack }) => {
                return `${timestamp} ${level}: ${stack || message}`;
            }))
            : json()
    ),
    transports: [
        new winston.transports.Console()
    ],
});
