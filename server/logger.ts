import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

const redactSensitiveData = (info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo => {
  const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie', 'sessionId'];
  const result = { ...info };
  
  if (result.meta && typeof result.meta === 'object') {
    result.meta = redactObject(result.meta as Record<string, unknown>, sensitiveFields);
  }
  
  return result;
};

const redactObject = (obj: Record<string, unknown>, sensitiveFields: string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, sensitiveFields);
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

const redactEmail = (email: string): string => {
  if (!email || typeof email !== 'string') return email;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const redactedLocal = local.length > 2 
    ? local.slice(0, 2) + '*'.repeat(Math.min(local.length - 2, 5))
    : local;
  return `${redactedLocal}@${domain}`;
};

const redactPhone = (phone: string): string => {
  if (!phone || typeof phone !== 'string') return phone;
  if (phone.length < 6) return phone;
  return phone.slice(0, 3) + '*'.repeat(phone.length - 6) + phone.slice(-3);
};

const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => redactSensitiveData(info))(),
  isProduction 
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      )
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
  
  sessionDestroyed: (userId: string) => {
    logger.info('Session destroyed', {
      event: 'session_destroyed',
      userId,
    });
  },
  
  csrfViolation: (ip: string, path: string) => {
    logger.warn('CSRF violation detected', {
      event: 'csrf_violation',
      ip,
      path,
    });
  },
  
  rateLimitExceeded: (ip: string, endpoint: string) => {
    logger.warn('Rate limit exceeded', {
      event: 'rate_limit_exceeded',
      ip,
      endpoint,
    });
  },
  
  unauthorizedAccess: (userId: string | undefined, resource: string) => {
    logger.warn('Unauthorized access attempt', {
      event: 'unauthorized_access',
      userId: userId || 'anonymous',
      resource,
    });
  },
  
  dataExport: (userId: string, exportType: string, recordCount: number) => {
    logger.info('Data export performed', {
      event: 'data_export',
      userId,
      exportType,
      recordCount,
    });
  },
  
  configChange: (userId: string, configType: string, spaId?: number) => {
    logger.info('Configuration changed', {
      event: 'config_change',
      userId,
      configType,
      spaId,
    });
  },
};

export default logger;
