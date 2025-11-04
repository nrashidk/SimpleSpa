import { encryptJSON, decryptJSON } from "./encryptionService";

// OAuth token structure
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix timestamp
  scope?: string;
}

// OAuth configuration for different providers
interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Google OAuth configuration
export function getGoogleOAuthConfig(integrationType: string): OAuthConfig {
  const baseScopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  // Add specific scopes based on integration type
  const integrationScopes: Record<string, string[]> = {
    google_calendar: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    google_my_business: [
      'https://www.googleapis.com/auth/business.manage',
    ],
    google_analytics: [
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
    google_meet: [
      'https://www.googleapis.com/auth/calendar',
    ],
  };

  const scopes = [...baseScopes, ...(integrationScopes[integrationType] || [])];
  const redirectUri = (process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000') + '/api/oauth/google/callback';

  return {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri,
    scopes,
  };
}

// HubSpot OAuth configuration
export function getHubSpotOAuthConfig(): OAuthConfig {
  const redirectUri = (process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000') + '/api/oauth/hubspot/callback';
  
  return {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    clientId: process.env.HUBSPOT_CLIENT_ID || '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    redirectUri,
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read'],
  };
}

// Mailchimp OAuth configuration
export function getMailchimpOAuthConfig(): OAuthConfig {
  const mailchimpRedirectUri = (process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000') + '/api/oauth/mailchimp/callback';
  
  return {
    authUrl: 'https://login.mailchimp.com/oauth2/authorize',
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    clientId: process.env.MAILCHIMP_CLIENT_ID || '',
    clientSecret: process.env.MAILCHIMP_CLIENT_SECRET || '',
    redirectUri: mailchimpRedirectUri,
    scopes: [],
  };
}

// Generate OAuth authorization URL
export function generateAuthUrl(
  provider: 'google' | 'hubspot' | 'mailchimp',
  integrationType: string,
  state: string
): string {
  let config: OAuthConfig;

  switch (provider) {
    case 'google':
      config = getGoogleOAuthConfig(integrationType);
      break;
    case 'hubspot':
      config = getHubSpotOAuthConfig();
      break;
    case 'mailchimp':
      config = getMailchimpOAuthConfig();
      break;
    default:
      throw new Error('Unsupported OAuth provider: ' + provider);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline', // For Google to get refresh token
    prompt: 'consent', // Force consent to always get refresh token
  });

  return config.authUrl + '?' + params.toString();
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  provider: 'google' | 'hubspot' | 'mailchimp',
  integrationType: string,
  code: string
): Promise<OAuthTokens> {
  let config: OAuthConfig;

  switch (provider) {
    case 'google':
      config = getGoogleOAuthConfig(integrationType);
      break;
    case 'hubspot':
      config = getHubSpotOAuthConfig();
      break;
    case 'mailchimp':
      config = getMailchimpOAuthConfig();
      break;
    default:
      throw new Error('Unsupported OAuth provider: ' + provider);
  }

  const params = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error('OAuth token exchange failed: ' + error);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope,
  };
}

// Refresh access token
export async function refreshAccessToken(
  provider: 'google' | 'hubspot' | 'mailchimp',
  integrationType: string,
  refreshToken: string
): Promise<OAuthTokens> {
  let config: OAuthConfig;

  switch (provider) {
    case 'google':
      config = getGoogleOAuthConfig(integrationType);
      break;
    case 'hubspot':
      config = getHubSpotOAuthConfig();
      break;
    case 'mailchimp':
      config = getMailchimpOAuthConfig();
      break;
    default:
      throw new Error('Unsupported OAuth provider: ' + provider);
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error('OAuth token refresh failed: ' + error);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Some providers don't return new refresh token
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope,
  };
}

// Get valid access token (refresh if expired)
export async function getValidAccessToken(
  provider: 'google' | 'hubspot' | 'mailchimp',
  integrationType: string,
  encryptedTokens: string
): Promise<string> {
  const tokens: OAuthTokens = decryptJSON(encryptedTokens);

  // Check if token is expired or about to expire (5 min buffer)
  const isExpired = tokens.expiresAt && tokens.expiresAt < Date.now() + 5 * 60 * 1000;

  if (isExpired && tokens.refreshToken) {
    // Refresh the token
    const newTokens = await refreshAccessToken(provider, integrationType, tokens.refreshToken);
    
    // Note: Caller should save the new encrypted tokens back to database
    return newTokens.accessToken;
  }

  return tokens.accessToken;
}

// Encrypt and prepare tokens for storage
export function encryptTokensForStorage(tokens: OAuthTokens): {
  encryptedTokens: string;
  tokenMetadata: Record<string, any>;
} {
  return {
    encryptedTokens: encryptJSON(tokens),
    tokenMetadata: {
      algorithm: 'AES-256-GCM',
      version: 1,
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
      hasRefreshToken: !!tokens.refreshToken,
    },
  };
}
