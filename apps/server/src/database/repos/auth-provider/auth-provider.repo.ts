import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { AuthProviders } from '@docmost/db/types/db';
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
  ldapUserAttributes?: any;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
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
  ldapUserAttributes?: any;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
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
  ): Promise<AuthProviders> {
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
        ldapConfig: data.ldapConfig || {},
        settings: data.settings || {},
        isEnabled: data.isEnabled || false,
        allowSignup: data.allowSignup || false,
        groupSync: data.groupSync || false,
      })
      .returningAll()
      .executeTakeFirst()) as unknown as AuthProviders;
  }

  async findById(
    id: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProviders | undefined> {
    const db = dbOrTx(this.db, trx);
    
    let query = db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null);
    
    if (workspaceId) {
      query = query.where('workspaceId', '=', workspaceId);
    }
    
    return (await query.executeTakeFirst()) as unknown as AuthProviders | undefined;
  }

  async findByWorkspace(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProviders[]> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute()) as unknown as AuthProviders[];
  }

  async findEnabledByWorkspace(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthProviders[]> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute()) as unknown as AuthProviders[];
  }

  async update(
    id: string,
    workspaceId: string,
    data: UpdateAuthProviderDto,
    trx?: KyselyTransaction,
  ): Promise<AuthProviders | undefined> {
    const db = dbOrTx(this.db, trx);
    
    return (await db
      .updateTable('authProviders')
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst()) as unknown as AuthProviders | undefined;
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
}
