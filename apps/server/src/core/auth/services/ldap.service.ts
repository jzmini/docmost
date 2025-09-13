import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { AuthProviders } from '@docmost/db/types/db';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { SignupService } from './signup.service';
import { TokenService } from './token.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateRandomPassword } from '../../../common/helpers';

export interface LdapLoginDto {
  username: string;
  password: string;
  providerId: string;
}

export interface LdapTestDto {
  ldapUrl: string;
  ldapBindDn: string;
  ldapBindPassword: string;
  ldapBaseDn: string;
  ldapUserSearchFilter?: string;
  ldapTlsEnabled?: boolean;
  ldapTlsCaCert?: string;
  testUsername?: string;
  testPassword?: string;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(
    private userRepo: UserRepo,
    private authProviderRepo: AuthProviderRepo,
    private signupService: SignupService,
    private tokenService: TokenService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async login(ldapLoginDto: LdapLoginDto, workspaceId: string) {
    const provider = await this.authProviderRepo.findById(
      ldapLoginDto.providerId,
      workspaceId,
    );

    if (!provider || provider.type !== 'ldap' || !provider.isEnabled) {
      throw new UnauthorizedException('LDAP provider not found or disabled');
    }

    const ldapUser = await this.authenticateLdap(
      provider,
      ldapLoginDto.username,
      ldapLoginDto.password,
    );

    if (!ldapUser) {
      throw new UnauthorizedException('Invalid LDAP credentials');
    }

    // Find or create user
    let user = await this.userRepo.findByEmail(ldapUser.email, workspaceId);

    if (!user) {
      if (!provider.allowSignup) {
        throw new UnauthorizedException('User signup is not allowed');
      }

      // Create new user
      user = await this.signupService.signup(
        {
          email: ldapUser.email,
          name: ldapUser.name,
          password: generateRandomPassword(), // Generate random password for LDAP users
        },
        workspaceId,
        undefined, // role
        true, // hasGeneratedPassword
        undefined, // trx
      );
    } else if (user.deletedAt) {
      throw new UnauthorizedException('User account has been deleted');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepo.updateLastLogin(user.id, workspaceId);

    // Create or update auth account
    await this.createOrUpdateAuthAccount(user.id, (provider.id as unknown) as string, workspaceId);

    return this.tokenService.generateAccessToken(user);
  }

  private async authenticateLdap(
    provider: AuthProviders,
    username: string,
    password: string,
  ): Promise<{ email: string; name: string } | null> {
    const client = new Client({
      url: provider.ldapUrl!,
      timeout: 5000, // 5 second timeout for consistency
      connectTimeout: 5000, // 5 second connection timeout  
      tlsOptions: provider.ldapTlsEnabled
        ? {
            ca: provider.ldapTlsCaCert || undefined,
            rejectUnauthorized: !!provider.ldapTlsCaCert,
          }
        : undefined,
    });

    try {
      // Bind with service account
      await client.bind(provider.ldapBindDn!, provider.ldapBindPassword!);

      // Search for user
      const searchFilter = (provider.ldapUserSearchFilter || '(mail={{username}})').replace(
        '{{username}}',
        username,
      );

      const { searchEntries } = await client.search(provider.ldapBaseDn!, {
        filter: searchFilter,
        scope: 'sub',
        attributes: ['dn', 'mail', 'email', 'cn', 'displayName', 'givenName', 'sn', 'uid'],
      });

      if (searchEntries.length === 0) {
        return null;
      }

      const userEntry = searchEntries[0];
      const userDn = userEntry.dn;

      // Try to bind with user's credentials
      await client.unbind();
      await client.bind(userDn, password);

      // Extract user information
      const email = 
        userEntry.mail?.toString() || 
        userEntry.email?.toString() || 
        (username.includes('@') ? username : `${username}@ldap.local`);
      
      const name = 
        userEntry.displayName?.toString() || 
        userEntry.cn?.toString() || 
        `${userEntry.givenName || ''} ${userEntry.sn || ''}`.trim() ||
        username;

      await client.unbind();
      return { email, name };
    } catch (error: any) {
      this.logger.error(`LDAP authentication failed: ${error.message}`);
      return null;
    } finally {
      try {
        await client.unbind();
      } catch (e) {
        // Ignore unbind errors
      }
    }
  }

  async testConnection(testDto: LdapTestDto): Promise<{ success: boolean; message?: string; userFound?: boolean }> {

    const client = new Client({
      url: testDto.ldapUrl,
      timeout: 5000, // 5 second timeout
      connectTimeout: 5000, // 5 second connection timeout
      tlsOptions: testDto.ldapTlsEnabled
        ? {
            ca: testDto.ldapTlsCaCert || undefined,
            rejectUnauthorized: !!testDto.ldapTlsCaCert,
          }
        : undefined,
    });

    // Helper function to add timeout to async operations
    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> => {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
      );
      return Promise.race([promise, timeoutPromise]);
    };

    try {
      // Test bind with service account
      try {
        await withTimeout(
          client.bind(testDto.ldapBindDn, testDto.ldapBindPassword),
          5000,
          'LDAP bind'
        );
      } catch (bindError: any) {
        this.logger.error('Bind operation failed:', bindError.message);
        throw bindError;
      }

      // If test username and password provided, try to authenticate
      if (testDto.testUsername && testDto.testPassword) {
        const searchFilter = (testDto.ldapUserSearchFilter || '(mail={{username}})').replace(
          '{{username}}',
          testDto.testUsername,
        );

        const searchResult = await withTimeout(
          client.search(testDto.ldapBaseDn, {
            filter: searchFilter,
            scope: 'sub',
            attributes: ['dn'],
          }),
          5000,
          'LDAP search'
        );
        const { searchEntries } = searchResult;

        if (searchEntries.length === 0) {
          return { 
            success: true, 
            message: 'LDAP connection successful, but test user not found',
            userFound: false 
          };
        }

        const userDn = searchEntries[0].dn;
        
        // Try to bind with test user's credentials
        await withTimeout(client.unbind(), 5000, 'LDAP unbind');
        
        await withTimeout(
          client.bind(userDn, testDto.testPassword),
          5000,
          'User LDAP bind'
        );
        
        await withTimeout(client.unbind(), 5000, 'LDAP unbind');
        return { 
          success: true, 
          message: 'LDAP connection and user authentication successful',
          userFound: true 
        };
      }

      await withTimeout(client.unbind(), 5000, 'LDAP unbind');
      return { success: true, message: 'LDAP connection successful' };
    } catch (error: any) {
      this.logger.error('LDAP test connection error:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });
      
      // Provide more specific error messages based on error type
      let errorMessage = 'LDAP connection failed';
      if (error.message?.includes('timed out')) {
        errorMessage = `Connection timeout - ${error.message}. Check if LDAP server is reachable at ${testDto.ldapUrl}`;
      } else if (error.message?.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused - Check LDAP server URL and port';
      } else if (error.message?.includes('ENOTFOUND')) {
        errorMessage = 'Server not found - Check LDAP server hostname';
      } else if (error.message?.includes('ETIMEDOUT')) {
        errorMessage = 'Connection timeout - LDAP server is not responding';
      } else if (error.message?.includes('Invalid credentials') || error.code === 49) {
        errorMessage = 'Invalid bind credentials - Check Bind DN and password';
      } else if (error.message?.includes('EHOSTUNREACH')) {
        errorMessage = 'Host unreachable - Check network connectivity to LDAP server';
      } else if (error.message) {
        errorMessage = `LDAP error: ${error.message}`;
      }
      
      return { 
        success: false, 
        message: errorMessage
      };
    } finally {
      try {
        // Use a shorter timeout for cleanup
        await Promise.race([
          client.unbind(),
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
      } catch (e) {
        // Ignore unbind errors in cleanup
      }
    }
  }

  private async createOrUpdateAuthAccount(
    userId: string,
    providerId: string,
    workspaceId: string,
  ): Promise<void> {
    const existingAccount = await this.db
      .selectFrom('authAccounts')
      .selectAll()
      .where('userId', '=', userId)
      .where('authProviderId', '=', providerId)
      .executeTakeFirst();

    if (!existingAccount) {
      await this.db
        .insertInto('authAccounts')
        .values({
          userId,
          authProviderId: providerId,
          workspaceId,
        })
        .execute();
    } else {
      await this.db
        .updateTable('authAccounts')
        .set({
          updatedAt: new Date(),
        })
        .where('id', '=', existingAccount.id)
        .execute();
    }
  }
}
