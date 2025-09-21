import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { AuthProviders } from '@docmost/db/types/db';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { dbOrTx } from '@docmost/db/utils';

export interface CreateAuthProviderDto {
  name: string;
  type: 'ldap' | 'saml' | 'oidc' | 'google';
  workspaceId: string;
  creatorId: string;
  ldapUrl?: string;
  ldapBindDn?: string;
  ldapBindPassword?: string;
  ldapBaseDn?: string;
  ldapUserSearchFilter?: string;
  ldapGroupSearchFilter?: string;
  ldapUserAttributes?: any;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
  ldapReadonly?: boolean;
  autoProvisionUsers?: boolean;
  ldapConfig?: any;
  settings?: any;
  isEnabled?: boolean;
  allowSignup?: boolean;
  groupSync?: boolean;
}

export interface UpdateAuthProviderDto {
  name?: string;
  ldapUrl?: string;
  ldapBindDn?: string;
  ldapBindPassword?: string;
  ldapBaseDn?: string;
  ldapUserSearchFilter?: string;
  ldapGroupSearchFilter?: string;
  ldapUserAttributes?: any;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
  ldapReadonly?: boolean;
  autoProvisionUsers?: boolean;
  ldapConfig?: any;
  settings?: any;
  isEnabled?: boolean;
  allowSignup?: boolean;
  groupSync?: boolean;
}

@Injectable()
export class AuthProviderRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: CreateAuthProviderDto,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .insertInto('authProviders')
      .values({
        name: data.name,
        type: data.type,
        workspaceId: data.workspaceId,
        creatorId: data.creatorId,
        ldapUrl: data.ldapUrl,
        ldapBindDn: data.ldapBindDn,
        ldapBindPassword: data.ldapBindPassword,
        ldapBaseDn: data.ldapBaseDn,
        ldapUserSearchFilter: data.ldapUserSearchFilter || '(mail={{username}})',
        ldapUserAttributes: data.ldapUserAttributes || {},
        ldapTlsEnabled: data.ldapTlsEnabled || false,
        ldapTlsCaCert: data.ldapTlsCaCert,
        ldapReadonly: data.ldapReadonly !== undefined ? data.ldapReadonly : true,  // Default to true (read-only)
        autoProvisionUsers: data.autoProvisionUsers !== undefined ? data.autoProvisionUsers : false,  // Default to false for security
        ldapConfig: data.ldapConfig || {},
        settings: data.settings || {},
        isEnabled: data.isEnabled !== undefined ? data.isEnabled : false,  // Default to false until properly configured
        allowSignup: data.allowSignup !== undefined ? data.allowSignup : false,  // Default to false for security
        groupSync: data.groupSync !== undefined ? data.groupSync : false,  // Default to false until configured
      })
      .returningAll()
      .executeTakeFirst()) as unknown as AuthProvider;
  }

  async findById(
    id: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, trx);
    
    let query = db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null);
    
    if (workspaceId) {
      query = query.where('workspaceId', '=', workspaceId);
    }
    
    return (await query.executeTakeFirst()) as unknown as AuthProvider | undefined;
  }

  async findByWorkspace(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider[]> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute()) as unknown as AuthProvider[];
  }

  async findEnabledByWorkspace(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider[]> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute()) as unknown as AuthProvider[];
  }

  async update(
    id: string,
    workspaceId: string,
    data: UpdateAuthProviderDto,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, trx);
    
    // Remove undefined fields to avoid overwriting existing values
    const updateData: any = { ...data };
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    // Don't overwrite password if not provided
    if (updateData.ldapBindPassword === '' || updateData.ldapBindPassword === null) {
      delete updateData.ldapBindPassword;
    }
    
    return (await db
      .updateTable('authProviders')
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst()) as unknown as AuthProvider | undefined;
  }

  async delete(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    
    await db
      .updateTable('authProviders')
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
  
  async cleanupOldDeletedProviders(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    
    // Immediately delete all soft-deleted providers
    // This provides a cleaner user experience as deleted providers won't linger
    await db
      .deleteFrom('authProviders')
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is not', null)
      .execute();
  }
}
