export enum LdapConnectionStatus {
  ACTIVE = 'active',
  DISCONNECTED = 'disconnected',
  INVALID_CONFIG = 'invalid_config',
  AUTH_FAILED = 'auth_failed',
  TIMEOUT = 'timeout',
  ERROR = 'error',
  UNCHECKED = 'unchecked',
  CHECKING = 'checking',
}

export interface LdapHealthCheckResult {
  status: LdapConnectionStatus;
  message?: string;
  lastCheckedAt: Date;
  details?: {
    ldapUrl?: string;
    baseDn?: string;
    bindDn?: string;
    responseTime?: number;
  };
}

