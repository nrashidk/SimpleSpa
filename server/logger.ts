import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie', 'sessionid', 'apikey', 'authtoken', 'accesstoken', 'refreshtoken', 'credential', 'key'];

const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const embeddedPhonePattern = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

const redactEmail = (_email: string): string => '[REDACTED_EMAIL]';

const redactPhone = (_phone: string): string => '[REDACTED_PHONE]';

const redactStringValue = (value: string, keyLower: string): string => {
  if (keyLower.includes('email')) {
    return '[REDACTED_EMAIL]';
  }
  if (keyLower.includes('phone') || keyLower.includes('mobile')) {
    return '[REDACTED_PHONE]';
  }
  
  let redacted = value
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .replace(embeddedPhonePattern, '[REDACTED_PHONE]');
  
  return redacted;
};

const redactObject = (obj: Record<string, unknown>, fields: string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    if (fields.some(field => keyLower.includes(field))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactStringValue(value, keyLower);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, fields);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (item && typeof item === 'object') {
          return redactObject(item as Record<string, unknown>, fields);
        }
        if (typeof item === 'string') {
          return redactStringValue(item, keyLower);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

const redactSensitiveData = (info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo => {
  const preserveFields = ['level', 'message', 'timestamp', 'service'];
  const result: winston.Logform.TransformableInfo = { level: info.level, message: info.message };
  
  for (const [key, value] of Object.entries(info)) {
    const keyLower = key.toLowerCase();
    
    if (preserveFields.includes(key)) {
      result[key] = value;
    } else if (sensitiveFields.some(field => keyLower.includes(field))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactStringValue(value, keyLower);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, sensitiveFields);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (item && typeof item === 'object') {
          return redactObject(item as Record<string, unknown>, sensitiveFields);
        }
        if (typeof item === 'string') {
          return redactStringValue(item, keyLower);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

const customFormat = isProduction 
  ? winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format((info) => redactSensitiveData(info))(),
      winston.format.json()
    )
  : winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.colorize({ all: true }),
      winston.format((info) => redactSensitiveData(info))(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    );

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: customFormat,
  defaultMeta: { service: 'simplespa' },
  transports: [
    new winston.transports.Console(),
  ],
});

export { logger, redactEmail, redactPhone };

export const securityLogger = {
  loginAttempt: (email: string, success: boolean, ip?: string) => {
    logger.info('Authentication attempt', {
      event: 'login_attempt',
      email: redactEmail(email),
      success,
      ip: ip || 'unknown',
    });
  },
  
  loginFailed: (email: string, reason: string, ip?: string) => {
    logger.warn('Authentication failed', {
      event: 'login_failed',
      email: redactEmail(email),
      reason,
      ip: ip || 'unknown',
    });
  },
  
  sessionCreated: (userId: string, ip?: string) => {
    logger.info('Session created', {
      event: 'session_created',
      userId,
      ip: ip || 'unknown',
    });
  },
  
  sessionDestroyed: (userId: string, ip?: string) => {
    logger.info('Session destroyed', {
      event: 'session_destroyed',
      userId,
      ip: ip || 'unknown',
    });
  },
  
  suspiciousActivity: (description: string, details: Record<string, unknown>) => {
    logger.warn('Suspicious activity detected', {
      event: 'suspicious_activity',
      description,
      ...details,
    });
  },
};

export default logger;
