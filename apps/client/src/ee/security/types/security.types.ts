import { SSO_PROVIDER } from "@/ee/security/contants.ts";

export interface IAuthProvider {
  id: string;
  name: string;
  type: SSO_PROVIDER;
  samlUrl: string;
  samlCertificate: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  ldapUrl: string;
  ldapBindDn: string;
  ldapBindPassword: string;
  ldapBaseDn: string;
  ldapUserSearchFilter: string;
  ldapGroupSearchFilter: string;
  ldapUserAttributes: any;
  ldapTlsEnabled: boolean;
  ldapTlsCaCert: string;
  ldapReadonly: boolean;
  autoProvisionUsers: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
  connectionStatus?: string;
  lastCheckedAt?: Date;
  lastError?: string;
  creatorId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  providerId: string;
}
