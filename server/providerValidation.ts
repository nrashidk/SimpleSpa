import twilio from "twilio";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Validate Twilio credentials by attempting to fetch account info
 */
export async function validateTwilioCredentials(
  accountSid: string,
  authToken: string
): Promise<ValidationResult> {
  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.accounts(accountSid).fetch();
    
    return {
      valid: true,
      details: {
        accountSid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
      },
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || "Invalid Twilio credentials",
    };
  }
}

/**
 * Validate MSG91 credentials by checking account balance
 */
export async function validateMsg91Credentials(
  authKey: string
): Promise<ValidationResult> {
  try {
    const response = await fetch(
      `https://api.msg91.com/api/v5/user/getBalance`,
      {
        headers: {
          'authkey': authKey,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: errorData.message || "Invalid MSG91 credentials",
      };
    }
    
    const data = await response.json();
    
    return {
      valid: true,
      details: {
        balance: data.balance || data,
        currency: data.currency || 'USD',
      },
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || "Invalid MSG91 credentials",
    };
  }
}

/**
 * Validate email provider credentials
 */
export async function validateEmailCredentials(
  provider: 'sendgrid' | 'resend',
  apiKey: string
): Promise<ValidationResult> {
  try {
    if (provider === 'sendgrid') {
      // SendGrid validation
      const response = await fetch(
        'https://api.sendgrid.com/v3/user/account',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          valid: false,
          error: errorData.errors?.[0]?.message || "Invalid SendGrid credentials",
        };
      }
      
      const data = await response.json();
      
      return {
        valid: true,
        details: {
          email: data.email,
          type: data.type,
        },
      };
    } else if (provider === 'resend') {
      // Resend validation - check API key format
      const response = await fetch(
        'https://api.resend.com/api-keys',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        return {
          valid: false,
          error: "Invalid Resend credentials",
        };
      }
      
      return {
        valid: true,
        details: {
          provider: 'resend',
        },
      };
    }
    
    return {
      valid: false,
      error: "Unsupported email provider",
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || "Invalid email credentials",
    };
  }
}
