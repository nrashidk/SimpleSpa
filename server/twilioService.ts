import twilio from 'twilio';
import { logger } from './logger';
import { db } from './db';
import { spaNotificationCredentials, whatsappMessages } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { decryptJSON } from './encryptionService';

export interface TwilioAccountInfo {
  accountSid: string;
  accountName: string;
  status: string;
  balance: string;
  currency: string;
}

export interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  smsUrl?: string;
  smsMethod?: string;
}

export interface PreflightCheckResult {
  valid: boolean;
  checks: {
    credentialsFormat: { passed: boolean; message: string };
    accountActive: { passed: boolean; message: string };
    sufficientBalance: { passed: boolean; message: string; balance?: string };
    phoneNumberFormat: { passed: boolean; message: string };
    whatsAppEnabled: { passed: boolean; message: string };
  };
  overallMessage: string;
}

export interface WebhookHealthCheck {
  configured: boolean;
  url?: string;
  lastMessageAt?: Date;
  messageCount24h: number;
  status: 'healthy' | 'warning' | 'error' | 'not_configured';
  statusMessage: string;
}

export interface DiagnosticEntry {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
}

const COMMON_ERRORS: Record<string, { solution: string; link?: string }> = {
  '20003': {
    solution: 'Your Twilio account credentials are invalid. Please verify your Account SID and Auth Token from the Twilio Console.',
    link: 'https://console.twilio.com/us1/account/keys-credentials/api-keys'
  },
  '20404': {
    solution: 'The phone number was not found in your Twilio account. Make sure you own this number.',
    link: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming'
  },
  '21211': {
    solution: 'Invalid phone number format. Use E.164 format (e.g., +14155551234).',
  },
  '21408': {
    solution: 'Permission denied. Your Twilio account may have geographic restrictions.',
    link: 'https://console.twilio.com/us1/develop/sms/settings/geo-permissions'
  },
  '21610': {
    solution: 'The recipient has opted out of receiving messages from this number.',
  },
  '21614': {
    solution: 'This number is not WhatsApp-enabled. You need to configure WhatsApp for this number in Twilio.',
    link: 'https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox'
  },
  '21656': {
    solution: 'WhatsApp template not approved. For business-initiated messages outside 24-hour window, use an approved template.',
  },
  '63001': {
    solution: 'WhatsApp channel not found. Ensure your number is registered with WhatsApp Business API.',
    link: 'https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox'
  },
  '63003': {
    solution: 'WhatsApp conversation expired. Customer must message first to open a new 24-hour window.',
  },
  '63007': {
    solution: 'Insufficient Twilio account balance. Please add funds to your account.',
    link: 'https://console.twilio.com/us1/billing/manage-billing/add-funds'
  },
};

export class TwilioAPIService {
  async validateCredentials(
    accountSid: string,
    authToken: string
  ): Promise<{
    valid: boolean;
    accountInfo?: TwilioAccountInfo;
    error?: string;
    errorCode?: string;
    solution?: string;
  }> {
    try {
      if (!accountSid || !authToken) {
        return { valid: false, error: 'Account SID and Auth Token are required' };
      }

      if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
        return {
          valid: false,
          error: 'Invalid Account SID format. It should start with "AC" and be 34 characters long.',
        };
      }

      const client = twilio(accountSid, authToken);
      const account = await client.api.accounts(accountSid).fetch();

      let balance = 'N/A';
      try {
        const balanceData = await client.balance.fetch();
        balance = balanceData.balance || 'N/A';
      } catch {
        logger.debug('Could not fetch balance - may be subaccount');
      }

      return {
        valid: true,
        accountInfo: {
          accountSid: account.sid,
          accountName: account.friendlyName,
          status: account.status,
          balance,
          currency: 'USD',
        },
      };
    } catch (error: any) {
      const errorCode = error.code?.toString() || '';
      const errorInfo = COMMON_ERRORS[errorCode];

      logger.error('Twilio validation failed', { 
        error: error.message,
        code: errorCode,
      });

      return {
        valid: false,
        error: error.message || 'Invalid Twilio credentials',
        errorCode,
        solution: errorInfo?.solution,
      };
    }
  }

  async getPhoneNumbers(
    accountSid: string,
    authToken: string
  ): Promise<{ numbers: TwilioPhoneNumber[]; error?: string }> {
    try {
      const client = twilio(accountSid, authToken);
      const numbers = await client.incomingPhoneNumbers.list();

      return {
        numbers: numbers.map((n) => ({
          sid: n.sid,
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          capabilities: {
            voice: n.capabilities?.voice || false,
            sms: n.capabilities?.sms || false,
            mms: n.capabilities?.mms || false,
          },
          smsUrl: n.smsUrl?.toString(),
          smsMethod: n.smsMethod,
        })),
      };
    } catch (error: any) {
      logger.error('Failed to fetch phone numbers', { error: error.message });
      return {
        numbers: [],
        error: error.message,
      };
    }
  }

  async getWhatsAppNumbers(
    accountSid: string,
    authToken: string
  ): Promise<{ numbers: TwilioPhoneNumber[]; error?: string }> {
    const result = await this.getPhoneNumbers(accountSid, authToken);

    if (result.error) {
      return result;
    }

    const whatsappCandidates = result.numbers.filter((n) => n.capabilities.sms);

    return {
      numbers: whatsappCandidates,
      error: undefined,
    };
  }

  async configureWebhook(
    accountSid: string,
    authToken: string,
    phoneNumberSid: string,
    webhookUrl: string
  ): Promise<{ success: boolean; error?: string; solution?: string }> {
    try {
      const client = twilio(accountSid, authToken);

      await client.incomingPhoneNumbers(phoneNumberSid).update({
        smsUrl: webhookUrl,
        smsMethod: 'POST',
      });

      logger.info('Webhook configured successfully', {
        phoneNumberSid,
        webhookUrl,
      });

      return { success: true };
    } catch (error: any) {
      const errorCode = error.code?.toString() || '';
      const errorInfo = COMMON_ERRORS[errorCode];

      logger.error('Failed to configure webhook', {
        error: error.message,
        phoneNumberSid,
        webhookUrl,
      });

      return {
        success: false,
        error: error.message || 'Failed to configure webhook',
        solution: errorInfo?.solution || 'Try configuring the webhook manually in the Twilio Console.',
      };
    }
  }

  async testWebhook(
    accountSid: string,
    authToken: string,
    fromNumber: string,
    toNumber: string,
    testMessage: string = 'WhatsApp Test from Serene Spa'
  ): Promise<{ success: boolean; messageSid?: string; error?: string; solution?: string }> {
    try {
      const client = twilio(accountSid, authToken);

      const message = await client.messages.create({
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${toNumber}`,
        body: testMessage,
      });

      return {
        success: true,
        messageSid: message.sid,
      };
    } catch (error: any) {
      const errorCode = error.code?.toString() || '';
      const errorInfo = COMMON_ERRORS[errorCode];

      logger.error('Test message failed', { 
        error: error.message,
        code: errorCode,
      });

      return {
        success: false,
        error: error.message,
        solution: errorInfo?.solution || 'Check that the recipient has joined your WhatsApp sandbox (if using sandbox) and the number format is correct.',
      };
    }
  }

  async runPreflightChecks(
    accountSid: string,
    authToken: string,
    fromPhone: string
  ): Promise<PreflightCheckResult> {
    const checks: PreflightCheckResult['checks'] = {
      credentialsFormat: { passed: false, message: '' },
      accountActive: { passed: false, message: '' },
      sufficientBalance: { passed: false, message: '' },
      phoneNumberFormat: { passed: false, message: '' },
      whatsAppEnabled: { passed: false, message: '' },
    };

    if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
      checks.credentialsFormat = {
        passed: false,
        message: 'Account SID should start with "AC" and be 34 characters',
      };
    } else if (!authToken || authToken.length < 32) {
      checks.credentialsFormat = {
        passed: false,
        message: 'Auth Token appears to be incomplete',
      };
    } else {
      checks.credentialsFormat = { passed: true, message: 'Credentials format is valid' };
    }

    const validation = await this.validateCredentials(accountSid, authToken);
    if (validation.valid && validation.accountInfo) {
      checks.accountActive = {
        passed: validation.accountInfo.status === 'active',
        message: validation.accountInfo.status === 'active'
          ? 'Account is active'
          : `Account status: ${validation.accountInfo.status}`,
      };

      const balance = parseFloat(validation.accountInfo.balance) || 0;
      checks.sufficientBalance = {
        passed: balance > 1,
        message: balance > 1
          ? `Balance: $${balance.toFixed(2)}`
          : `Low balance: $${balance.toFixed(2)} - Consider adding funds`,
        balance: validation.accountInfo.balance,
      };
    } else {
      checks.accountActive = { passed: false, message: validation.error || 'Could not verify account' };
      checks.sufficientBalance = { passed: false, message: 'Could not check balance' };
    }

    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!fromPhone) {
      checks.phoneNumberFormat = { passed: false, message: 'Phone number is required' };
    } else if (!phoneRegex.test(fromPhone)) {
      checks.phoneNumberFormat = {
        passed: false,
        message: 'Use E.164 format (e.g., +14155551234)',
      };
    } else {
      checks.phoneNumberFormat = { passed: true, message: 'Phone number format is valid' };
    }

    if (validation.valid) {
      const numbers = await this.getPhoneNumbers(accountSid, authToken);
      const matchingNumber = numbers.numbers.find((n) => n.phoneNumber === fromPhone);
      if (matchingNumber) {
        checks.whatsAppEnabled = {
          passed: matchingNumber.capabilities.sms,
          message: matchingNumber.capabilities.sms
            ? 'Number has SMS/WhatsApp capability'
            : 'Number does not have SMS capability',
        };
      } else {
        checks.whatsAppEnabled = {
          passed: false,
          message: 'Number not found in your Twilio account - may be a sandbox number',
        };
      }
    } else {
      checks.whatsAppEnabled = { passed: false, message: 'Could not verify WhatsApp capability' };
    }

    const allPassed = Object.values(checks).every((c) => c.passed);
    const criticalFailed = !checks.credentialsFormat.passed || !checks.accountActive.passed;

    return {
      valid: allPassed || (!criticalFailed && checks.phoneNumberFormat.passed),
      checks,
      overallMessage: allPassed
        ? 'All checks passed! Ready to configure WhatsApp.'
        : criticalFailed
          ? 'Critical checks failed. Please fix the issues above.'
          : 'Some optional checks failed. You can still proceed, but review the warnings.',
    };
  }

  async getWebhookHealthCheck(spaId: number): Promise<WebhookHealthCheck> {
    try {
      const [credentials] = await db
        .select()
        .from(spaNotificationCredentials)
        .where(
          and(
            eq(spaNotificationCredentials.spaId, spaId),
            eq(spaNotificationCredentials.channel, 'whatsapp'),
            eq(spaNotificationCredentials.status, 'active')
          )
        )
        .limit(1);

      if (!credentials) {
        return {
          configured: false,
          status: 'not_configured',
          statusMessage: 'WhatsApp is not configured for this spa.',
          messageCount24h: 0,
        };
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recentMessages = await db
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.direction, 'inbound'))
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(100);

      const messagesIn24h = recentMessages.filter(
        (m) => m.createdAt && new Date(m.createdAt) > twentyFourHoursAgo
      ).length;

      const lastMessage = recentMessages[0];
      const lastMessageAt = lastMessage?.createdAt ? new Date(lastMessage.createdAt) : undefined;

      let status: WebhookHealthCheck['status'] = 'healthy';
      let statusMessage = 'WhatsApp is working correctly.';

      if (!lastMessageAt) {
        status = 'warning';
        statusMessage = 'No messages received yet. Send a test message to verify setup.';
      } else {
        const hoursSinceLastMessage = (Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastMessage > 24) {
          status = 'warning';
          statusMessage = `No messages in the last 24 hours. Last message: ${lastMessageAt.toLocaleString()}`;
        }
      }

      return {
        configured: true,
        url: credentials.fromPhone ? `Configured for ${credentials.fromPhone}` : undefined,
        lastMessageAt,
        messageCount24h: messagesIn24h,
        status,
        statusMessage,
      };
    } catch (error: any) {
      logger.error('Failed to get webhook health check', { error: error.message, spaId });
      return {
        configured: false,
        status: 'error',
        statusMessage: 'Failed to check WhatsApp status.',
        messageCount24h: 0,
      };
    }
  }

  async getDiagnostics(spaId: number): Promise<DiagnosticEntry[]> {
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const [credentials] = await db
        .select()
        .from(spaNotificationCredentials)
        .where(
          and(
            eq(spaNotificationCredentials.spaId, spaId),
            eq(spaNotificationCredentials.channel, 'whatsapp')
          )
        )
        .limit(1);

      if (!credentials) {
        diagnostics.push({
          timestamp: new Date(),
          level: 'warning',
          message: 'WhatsApp credentials not configured',
          details: { action: 'Configure WhatsApp in Settings → Notifications' },
        });
        return diagnostics;
      }

      if (credentials.status !== 'active') {
        diagnostics.push({
          timestamp: new Date(),
          level: 'warning',
          message: `WhatsApp provider status: ${credentials.status}`,
          details: { action: 'Activate the provider or check for errors' },
        });
      }

      if (credentials.status === 'active') {
        diagnostics.push({
          timestamp: new Date(),
          level: 'info',
          message: 'WhatsApp credentials are active',
          details: { fromPhone: credentials.fromPhone },
        });
      }

      const healthCheck = await this.getWebhookHealthCheck(spaId);
      if (healthCheck.status === 'warning') {
        diagnostics.push({
          timestamp: new Date(),
          level: 'warning',
          message: healthCheck.statusMessage,
        });
      } else if (healthCheck.status === 'healthy') {
        diagnostics.push({
          timestamp: new Date(),
          level: 'info',
          message: `${healthCheck.messageCount24h} messages processed in last 24 hours`,
        });
      }

    } catch (error: any) {
      diagnostics.push({
        timestamp: new Date(),
        level: 'error',
        message: 'Failed to run diagnostics',
        details: { error: error.message },
      });
    }

    return diagnostics;
  }

  getErrorSolution(errorCode: string): { solution: string; link?: string } | null {
    return COMMON_ERRORS[errorCode] || null;
  }
}

export const twilioAPIService = new TwilioAPIService();
