import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Client } from 'ldapts';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { LdapLoginDto, LdapTestDto } from '../dto/ldap.dto';
export { LdapLoginDto, LdapTestDto };
import { AuthProvider, User } from '@docmost/db/types/entity.types';
import { SignupService } from './signup.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateRandomPassword } from '../../../common/helpers/utils';
import { TokenService } from '../services/token.service';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { LdapConnectionStatus, LdapHealthCheckResult } from '../types/ldap-status.enum';

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(
    private authProviderRepo: AuthProviderRepo,
    private userRepo: UserRepo,
    private signupService: SignupService,
    private tokenService: TokenService,
    private groupRepo: GroupRepo,
    private workspaceRepo: WorkspaceRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async login(ldapLoginDto: LdapLoginDto, workspaceId: string) {
    const provider = await this.authProviderRepo.findById(
      ldapLoginDto.providerId,
      workspaceId,
    );

    if (!provider) {
      throw new UnauthorizedException('LDAP provider not found');
    }
    
    if (provider.type !== 'ldap') {
      throw new UnauthorizedException('Provider is not an LDAP provider');
    }
    
    if (!provider.isEnabled) {
      throw new UnauthorizedException('LDAP provider is disabled');
    }
    
    this.logger.debug(`LDAP login attempt for user: ${ldapLoginDto.username}`);
    
    const ldapUser = await this.authenticateLdap(
      provider,
      ldapLoginDto.username,
      ldapLoginDto.password,
      workspaceId,
    );
    

    if (!ldapUser) {
      this.logger.error('LDAP authentication failed - no user returned');
      throw new UnauthorizedException('Invalid LDAP credentials');
    }
    
    this.logger.debug(`LDAP user authenticated: ${ldapUser.email}`);
    this.logger.log(`LDAP groups returned: ${ldapUser.groups?.length || 0}`);

    // Find or create user
    let user = await this.userRepo.findByEmail(ldapUser.email, workspaceId);

    if (!user) {
      this.logger.debug(`Creating new user ${ldapUser.email} from LDAP authentication`);
      
      // IMPORTANT: LDAP authenticated users should ALWAYS be provisioned in Docmost
      // This is NOT signup/registration - this is just syncing authenticated LDAP users to the local DB
      // The "allowSignup" setting should only apply to self-registration, not LDAP authentication
      
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
    } else {
      // Check if this is a local-only user (not created via SSO/LDAP)
      const authAccount = await this.db
        .selectFrom('authAccounts')
        .where('authAccounts.userId', '=', user.id)
        .executeTakeFirst();

      // If user exists but has no auth account and was not created with generated password,
      // they are a local-only user and should not authenticate via LDAP
      if (!authAccount && !user.hasGeneratedPassword) {
        this.logger.warn(`User ${ldapUser.email} is a local-only user, denying LDAP authentication`);
        throw new UnauthorizedException('Please use local database authentication to login');
      }
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepo.updateLastLogin(user.id, workspaceId);

    // Create or update auth account
    await this.createOrUpdateAuthAccount(user.id, (provider.id as unknown) as string, workspaceId);

    // Sync groups if enabled
    
    if (provider.groupSync && ldapUser.groups && ldapUser.groups.length > 0) {
      this.logger.debug(`Syncing ${ldapUser.groups.length} groups for user ${user.email}`);
      await this.syncUserGroups(user.id, ldapUser.groups, workspaceId);
    } else {
      if (!provider.groupSync) {
        this.logger.debug(`Group sync disabled for provider`);
      } else if (!ldapUser.groups || ldapUser.groups.length === 0) {
        this.logger.debug(`No groups found for user ${user.email}`);
      }
    }
    
    const token = await this.tokenService.generateAccessToken(user);
    return token;
  }

  private async authenticateLdap(
    provider: any,
    username: string,
    password: string,
    workspaceId?: string,
  ): Promise<{ email: string; name: string; groups?: string[] } | null> {
    
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

      // Search for user - try multiple formats if email was provided
      let searchEntries: any[] = [];
      const usernameFormats = [username];
      
      // If username looks like an email, also try just the username part
      if (username.includes('@')) {
        const usernameOnly = username.split('@')[0];
        usernameFormats.push(usernameOnly);
      }
      
      for (const usernameToTry of usernameFormats) {
        const searchFilter = (provider.ldapUserSearchFilter || '(mail={{username}})').replaceAll(
          '{{username}}',
          usernameToTry,
        );
        
        this.logger.debug(`Searching for user: ${usernameToTry} with filter: ${searchFilter}`);

        const searchResults: any = await client.search(provider.ldapBaseDn!, {
          filter: searchFilter,
          scope: 'sub',
          attributes: ['dn', 'mail', 'email', 'cn', 'displayName', 'givenName', 'sn', 'uid', 'memberOf'],
        });
        
        searchEntries = searchResults.searchEntries || [];
        
        if (searchEntries.length > 0) {
          break; // Found the user, stop trying
        }
      }

      if (searchEntries.length === 0) {
        this.logger.debug(`LDAP user not found. Tried usernames: ${usernameFormats.join(', ')}`);
        return null;
      }

      const userEntry = searchEntries[0];
      const userDn = userEntry.dn;
      this.logger.debug(`Found user DN: ${userDn}`);

      // Try to bind with user's credentials
      await client.unbind();
      await client.bind(userDn, password);

      // Extract user information
      // Get workspace email domains if available
      let defaultDomain = 'ldap.local';
      if (workspaceId) {
        const workspace = await this.workspaceRepo.findById(workspaceId);
        if (workspace?.emailDomains?.length > 0) {
          defaultDomain = workspace.emailDomains[0];
        }
      }
      
      const email = 
        userEntry.mail?.toString() || 
        userEntry.email?.toString() || 
        (username.includes('@') ? username : `${username}@${defaultDomain}`);
      
      const name = 
        userEntry.displayName?.toString() || 
        userEntry.cn?.toString() || 
        `${userEntry.givenName || ''} ${userEntry.sn || ''}`.trim() ||
        username;

      // Extract groups from memberOf attribute
      let groups: string[] = [];
      
      if (userEntry.memberOf) {
        this.logger.debug(`Found memberOf attribute for user ${username}`);
        const memberOfArray = Array.isArray(userEntry.memberOf) 
          ? userEntry.memberOf 
          : [userEntry.memberOf];
        
        groups = memberOfArray.map((groupDn: any) => {
          // Extract CN from DN (e.g., "CN=GroupName,OU=Groups,DC=example,DC=com" -> "GroupName")
          const match = groupDn.toString().match(/^CN=([^,]+)/i);
          const groupName = match ? match[1] : groupDn.toString();
          return groupName;
        });
        this.logger.debug(`Extracted ${groups.length} groups from memberOf`);
      } else {
        // Alternative: Search for groups that contain this user
        try {
          // Try Active Directory style groups first
          let groupSearchResult = await client.search(provider.ldapBaseDn!, {
            filter: `(&(objectClass=group)(member=${userDn}))`,
            scope: 'sub',
            attributes: ['cn', 'dn'],
          });
          
          // If no results, try POSIX style groups
          if (!groupSearchResult.searchEntries || groupSearchResult.searchEntries.length === 0) {
            const uid = userEntry.uid?.toString() || username;
            groupSearchResult = await client.search(provider.ldapBaseDn!, {
              filter: `(&(objectClass=posixGroup)(memberUid=${uid}))`,
              scope: 'sub',
              attributes: ['cn', 'dn'],
            });
          }
          
          // If still no results, try groupOfNames/groupOfUniqueNames
          if (!groupSearchResult.searchEntries || groupSearchResult.searchEntries.length === 0) {
            groupSearchResult = await client.search(provider.ldapBaseDn!, {
              filter: `(&(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames))(|(member=${userDn})(uniqueMember=${userDn})))`,
              scope: 'sub',
              attributes: ['cn', 'dn'],
            });
          }
          
          if (groupSearchResult.searchEntries && groupSearchResult.searchEntries.length > 0) {
            groups = groupSearchResult.searchEntries.map((groupEntry: any) => {
              return groupEntry.cn?.toString() || groupEntry.dn?.toString() || '';
            }).filter(g => g);
            this.logger.debug(`Found ${groups.length} groups by searching`);
          } else {
            this.logger.debug('No groups found for user by searching');
          }
        } catch (groupError: any) {
          this.logger.error(`Failed to search for user groups: ${groupError.message}`);
        }
      }
      
      await client.unbind();
      this.logger.debug(`LDAP authentication successful for ${email}, groups: ${groups.length}`);
      return { email, name, groups };
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

  async checkConnectionHealth(providerId: string, workspaceId: string): Promise<LdapHealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const provider = await this.authProviderRepo.findById(providerId, workspaceId);
      
      if (!provider || provider.type !== 'ldap') {
        return {
          status: LdapConnectionStatus.ERROR,
          message: 'LDAP provider not found',
          lastCheckedAt: new Date(),
        };
      }

      // Check if required configuration exists
      if (!provider.ldapUrl || !provider.ldapBindDn || !provider.ldapBindPassword || !provider.ldapBaseDn) {
        await this.updateProviderStatus(providerId, LdapConnectionStatus.INVALID_CONFIG, 'Missing required configuration');
        return {
          status: LdapConnectionStatus.INVALID_CONFIG,
          message: 'Missing required LDAP configuration',
          lastCheckedAt: new Date(),
        };
      }

      const client = new Client({
        url: provider.ldapUrl,
        timeout: 5000,
        connectTimeout: 5000,
        tlsOptions: provider.ldapTlsEnabled
          ? {
              ca: provider.ldapTlsCaCert || undefined,
              rejectUnauthorized: !!provider.ldapTlsCaCert,
            }
          : undefined,
      });

      try {
        // Attempt to bind with service account
        await client.bind(provider.ldapBindDn, provider.ldapBindPassword);
        
        // Try a simple search to verify base DN is accessible
        await client.search(provider.ldapBaseDn, {
          filter: '(objectClass=*)',
          scope: 'base',
          sizeLimit: 1,
        });
        
        await client.unbind();
        
        const responseTime = Date.now() - startTime;
        await this.updateProviderStatus(providerId, LdapConnectionStatus.ACTIVE, null);
        
        return {
          status: LdapConnectionStatus.ACTIVE,
          message: 'LDAP connection successful',
          lastCheckedAt: new Date(),
          details: {
            ldapUrl: provider.ldapUrl,
            baseDn: provider.ldapBaseDn,
            bindDn: provider.ldapBindDn,
            responseTime,
          },
        };
      } catch (error: any) {
        await client.unbind().catch(() => {});
        
        let status: LdapConnectionStatus;
        let message: string;
        
        if (error.message?.includes('ETIMEDOUT') || error.message?.includes('timeout')) {
          status = LdapConnectionStatus.TIMEOUT;
          message = 'Connection timeout - LDAP server not reachable';
        } else if (error.message?.includes('Invalid credentials') || error.message?.includes('Invalid DN syntax')) {
          status = LdapConnectionStatus.AUTH_FAILED;
          message = 'Authentication failed - Invalid bind credentials';
        } else if (error.message?.includes('ECONNREFUSED') || error.message?.includes('EHOSTUNREACH')) {
          status = LdapConnectionStatus.DISCONNECTED;
          message = 'Cannot connect to LDAP server';
        } else {
          status = LdapConnectionStatus.ERROR;
          message = error.message || 'Unknown error occurred';
        }
        
        await this.updateProviderStatus(providerId, status, message);
        
        return {
          status,
          message,
          lastCheckedAt: new Date(),
        };
      }
    } catch (error: any) {
      await this.updateProviderStatus(providerId, LdapConnectionStatus.ERROR, error.message);
      return {
        status: LdapConnectionStatus.ERROR,
        message: error.message || 'Failed to check LDAP connection',
        lastCheckedAt: new Date(),
      };
    }
  }

  private async updateProviderStatus(
    providerId: string,
    status: LdapConnectionStatus,
    error?: string | null,
  ): Promise<void> {
    try {
      console.log(`Updating LDAP provider status: ${providerId} -> ${status}`);
      const result = await this.db
        .updateTable('authProviders')
        .set({
          connectionStatus: status,
          lastCheckedAt: new Date(),
          lastError: error,
        })
        .where('id', '=', providerId)
        .execute();
      console.log(`Update completed for provider ${providerId}`);
    } catch (e) {
      this.logger.error(`Failed to update provider status: ${e}`);
      console.error(`Failed to update provider status:`, e);
    }
  }

  async testConnection(testDto: LdapTestDto): Promise<{ success: boolean; message?: string; userFound?: boolean; groups?: string[] }> {

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

      // Test group search if filter provided
      if (testDto.ldapGroupSearchFilter) {
        try {
          const groupFilter = testDto.ldapGroupSearchFilter;
          const groupResult: any = await withTimeout(
            client.search(testDto.ldapBaseDn, {
              filter: groupFilter,
              scope: 'sub',
              attributes: ['cn', 'dn'],
              sizeLimit: 10,
            }),
            5000,
            'Group search'
          );
          
          if (groupResult.searchEntries && groupResult.searchEntries.length > 0) {
            console.log(`Found ${groupResult.searchEntries.length} groups with filter: ${groupFilter}`);
          }
        } catch (e: any) {
          console.log(`Group search test failed: ${e.message}`);
        }
      }

      // If test username and password provided, try to authenticate
      if (testDto.testUsername && testDto.testPassword) {
        const searchFilter = (testDto.ldapUserSearchFilter || '(mail={{username}})').replaceAll(
          '{{username}}',
          testDto.testUsername,
        );
        
        const searchResult: any = await withTimeout(
          client.search(testDto.ldapBaseDn, {
            filter: searchFilter,
            scope: 'sub',
            attributes: ['dn', 'mail', 'email', 'cn', 'displayName', 'givenName', 'sn', 'memberOf'],
            sizeLimit: 1,
          }),
          5000,
          'LDAP search'
        );

        // Check if user was found
        const userFound = searchResult.searchEntries && searchResult.searchEntries.length > 0;
        
        if (userFound) {
          const userEntry = searchResult.searchEntries[0];
          const userDn = userEntry.dn;
          
          // Extract groups for the test user
          let groups: string[] = [];
          if (userEntry.memberOf) {
            const memberOfArray = Array.isArray(userEntry.memberOf) 
              ? userEntry.memberOf 
              : [userEntry.memberOf];
            
            groups = memberOfArray.map((groupDn: any) => {
              const match = groupDn.toString().match(/^CN=([^,]+)/i);
              return match ? match[1] : groupDn.toString();
            });
          }

          // Try to bind with user's credentials
          await client.unbind();
          
          try {
            await withTimeout(
              client.bind(userDn, testDto.testPassword),
              5000,
              'User authentication'
            );
            await client.unbind();
            return { 
              success: true, 
              message: 'Connection successful and user authenticated',
              userFound: true,
              groups: groups.length > 0 ? groups : undefined
            };
          } catch (userBindError: any) {
            return { 
              success: false, 
              message: `User found but authentication failed: ${userBindError.message}`,
              userFound: true 
            };
          }
        } else {
          return { 
            success: false, 
            message: 'Connection successful but user not found',
            userFound: false 
          };
        }
      }

      // Just test connection without user auth
      await client.unbind();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        const details = [];
        details.push(`URL: ${testDto.ldapUrl}`);
        details.push(`Base DN: ${testDto.ldapBaseDn}`);
        details.push(`Bind DN: ${testDto.ldapBindDn}`);
        
        return { 
          success: false, 
          message: `Connection timeout - Unable to reach LDAP server. Please verify:\n- LDAP server is accessible from Docker container\n- URL format is correct (ldap://hostname:port)\n- Firewall rules allow connection\n\nConnection details:\n${details.join('\n')}`
        };
      }
      
      if (error.message?.includes('Invalid credentials') || error.code === 49) {
        return { 
          success: false, 
          message: 'Invalid bind credentials - Please check your Bind DN and password' 
        };
      }
      
      if (error.message?.includes('ECONNREFUSED')) {
        return { 
          success: false, 
          message: 'Connection refused - LDAP server is not accepting connections on the specified port' 
        };
      }
      
      if (error.message?.includes('EHOSTUNREACH') || error.message?.includes('ENETUNREACH')) {
        return { 
          success: false, 
          message: 'Network unreachable - Cannot reach the LDAP server from Docker container' 
        };
      }
      
      return { 
        success: false, 
        message: `Connection failed: ${error.message}` 
      };
    } finally {
      try {
        await client.unbind();
      } catch (e) {
        // Ignore unbind errors in cleanup
      }
    }
  }

  async syncAllLdapGroups(workspaceId: string): Promise<void> {
    const providers = await this.authProviderRepo.findEnabledByWorkspace(workspaceId);
    const provider = providers.find(p => p.type === 'ldap');
    
    if (!provider || !provider.isEnabled || !provider.groupSync) {
      this.logger.debug('LDAP not enabled or group sync disabled');
      return;
    }
    
    const client = new Client({
      url: provider.ldapUrl!,
      timeout: 5000,
      connectTimeout: 5000,
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
      
      // Search for groups in LDAP using configurable filter
      let allGroups: Set<string> = new Set();
      let groupDetails: Map<string, any> = new Map();
      
      // Use configured group filter or default to groupOfNames
      const groupFilter = provider.ldapGroupSearchFilter || '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames))';
      this.logger.debug(`Searching for LDAP groups with filter: ${groupFilter}`);
      
      try {
        const searchResult: any = await client.search(provider.ldapBaseDn!, {
          filter: groupFilter,
          scope: 'sub',
          attributes: ['cn', 'dn', 'member', 'uniqueMember', 'memberUid', 'name'],
        });
        
        if (searchResult.searchEntries && searchResult.searchEntries.length > 0) {
          this.logger.debug(`Found ${searchResult.searchEntries.length} LDAP groups`);
          searchResult.searchEntries.forEach((entry: any) => {
            const groupName = entry.cn?.toString() || entry.name?.toString();
            if (groupName) {
              allGroups.add(groupName);
              groupDetails.set(groupName, entry);
            }
          });
        } else {
          this.logger.debug('No groups found with the configured filter');
        }
      } catch (e: any) {
        this.logger.error(`LDAP group search failed: ${e.message}`);
      }
      
      const uniqueGroups = Array.from(allGroups);
      
      this.logger.debug(`Found ${uniqueGroups.length} unique LDAP groups to sync`);
      
      // First, remove LDAP groups that no longer exist in LDAP
      const existingLdapGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('isDefault', '=', false)
        .where('deletedAt', 'is', null)
        .execute();
      
      for (const group of existingLdapGroups) {
        if (!allGroups.has(group.name)) {
          this.logger.debug(`Removing obsolete LDAP group: "${group.name}"`);
          
          // First remove all group memberships
          await this.db
            .deleteFrom('groupUsers')
            .where('groupId', '=', group.id)
            .execute();
          
          // Then soft delete the group
          await this.db
            .updateTable('groups')
            .set({ deletedAt: new Date() })
            .where('id', '=', group.id)
            .execute();
        }
      }
      
      if (uniqueGroups.length > 0) {
        // Sync groups to database
        for (const groupName of uniqueGroups) {
          // Check if group already exists
          const existingGroup = await this.groupRepo.findByName(groupName, workspaceId);
          
          if (!existingGroup) {
            try {
              const newGroup = await this.groupRepo.insertGroup({
                name: groupName,
                description: `LDAP synchronized group`,
                isDefault: false,
                workspaceId: workspaceId,
                creatorId: null, // System-created group
              });
              this.logger.debug(`Created LDAP group: "${groupName}"`);
            } catch (error: any) {
              this.logger.error(`Failed to create group "${groupName}": ${error.message}`);
            }
          } else {
            this.logger.debug(`Group "${groupName}" already exists`);
          }
        }
        
        // Optionally sync group memberships
        await this.syncAllGroupMemberships(workspaceId, provider, client);
      } else {
        this.logger.debug('No LDAP groups found');
      }
      
      await client.unbind();
    } catch (error: any) {
      this.logger.error(`Failed to sync all LDAP groups: ${error.message}`);
    } finally {
      try {
        await client.unbind();
      } catch (e) {
        // Ignore unbind errors
      }
    }
  }

  private async syncAllGroupMemberships(
    workspaceId: string,
    provider: any,
    client: any,
  ): Promise<void> {
    try {
      // First, clear existing LDAP group memberships (keep local groups intact)
      const ldapGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('isDefault', '=', false)
        .where('deletedAt', 'is', null)
        .execute();
      
      for (const group of ldapGroups) {
        await this.db
          .deleteFrom('groupUsers')
          .where('groupId', '=', group.id)
          .execute();
      }
      
      // Get all groups from database
      const dbGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .execute();
      
      const groupMap = new Map<string, string>();
      dbGroups.forEach(g => {
        groupMap.set(g.name.toLowerCase(), g.id);
      });
      
      // Get all users from database
      const dbUsers = await this.db
        .selectFrom('users')
        .select(['id', 'email'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .execute();
      
      const userEmailMap = new Map<string, string>();
      const userDnMap = new Map<string, string>();
      
      dbUsers.forEach(u => {
        userEmailMap.set(u.email.toLowerCase(), u.id);
        // Also map without domain for matching
        const username = u.email.split('@')[0].toLowerCase();
        if (!userEmailMap.has(username)) {
          userEmailMap.set(username, u.id);
        }
      });
      
      this.logger.debug(`Syncing group memberships for ${dbUsers.length} users`);
      
      // Search for groups with members in LDAP
      // Use configured group filter or default
      const groupFilter = provider.ldapGroupSearchFilter || '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames))';
      
      // 1. Search for groups with member attributes
      try {
        const groupsWithMembers: any = await client.search(provider.ldapBaseDn!, {
          filter: groupFilter,
          scope: 'sub',
          attributes: ['cn', 'member', 'uniqueMember', 'memberUid', 'objectClass'],
        });
        
        if (groupsWithMembers.searchEntries && groupsWithMembers.searchEntries.length > 0) {
          this.logger.debug(`Found ${groupsWithMembers.searchEntries.length} groups in LDAP`);
          
          for (const groupEntry of groupsWithMembers.searchEntries) {
            const groupName = groupEntry.cn?.toString();
            if (!groupName) {
              continue;
            }
            
            const groupId = groupMap.get(groupName.toLowerCase());
            if (!groupId) {
              continue;
            }
            
            // Process member DNs (groupOfNames/groupOfUniqueNames)
            const memberDns = [];
            if (groupEntry.member) {
              const memberArray = Array.isArray(groupEntry.member) ? groupEntry.member : [groupEntry.member];
              memberDns.push(...memberArray);
            }
            if (groupEntry.uniqueMember) {
              const uniqueMemberArray = Array.isArray(groupEntry.uniqueMember) ? groupEntry.uniqueMember : [groupEntry.uniqueMember];
              memberDns.push(...uniqueMemberArray);
            }
            
            // Process each member DN
            for (const memberDn of memberDns) {
              const dnString = memberDn.toString();
              
              // Extract username from DN (e.g., "cn=jianweiz,ou=people,dc=minilab,dc=top" -> "jianweiz")
              const cnMatch = dnString.match(/cn=([^,]+)/i);
              if (!cnMatch) {
                continue;
              }
              
              const cnValue = cnMatch[1];
              
              // Look up the actual user entry to get their uid/email
              let actualUsername = cnValue.toLowerCase();
              let ldapEmail: string | null = null;
              try {
                const userSearch: any = await client.search(dnString, {
                  scope: 'base',
                  attributes: ['uid', 'mail', 'email', 'cn', 'sAMAccountName'],
                });
                
                if (userSearch.searchEntries && userSearch.searchEntries.length > 0) {
                  const userEntry = userSearch.searchEntries[0];
                  // Prefer uid over cn for username
                  actualUsername = (userEntry.uid || userEntry.sAMAccountName || userEntry.cn || cnValue).toString().toLowerCase();
                  ldapEmail = (userEntry.mail || userEntry.email)?.toString().toLowerCase() || null;
                }
              } catch (e) {
                // Could not look up user entry, use CN as username
              }
              
              // Try to find user in database by username or email
              // First try with LDAP email if available
              let userId: string | undefined;
              if (ldapEmail) {
                userId = userEmailMap.get(ldapEmail);
              }
              
              // Then try with username
              if (!userId) {
                userId = userEmailMap.get(actualUsername);
              }
              
              if (!userId) {
                // Try with workspace email domains
                const workspace = await this.workspaceRepo.findById(workspaceId);
                const defaultDomain = workspace?.emailDomains?.[0] || 'ldap.local';
                const possibleEmails = [
                  `${actualUsername}@${defaultDomain}`,
                  actualUsername
                ];
                
                for (const email of possibleEmails) {
                  userId = userEmailMap.get(email.toLowerCase());
                  if (userId) {
                    break;
                  }
                }
              }
              
              if (userId) {
                // Add user to group
                try {
                  await this.db
                    .insertInto('groupUsers')
                    .values({
                      userId: userId,
                      groupId: groupId,
                    })
                    .onConflict((oc) => oc.columns(['userId', 'groupId']).doNothing())
                    .execute();
                  this.logger.debug(`Added user ${actualUsername} to group ${groupName}`);
                } catch (e) {
                  this.logger.error(`Failed to add user ${actualUsername} to group: ${e}`);
                }
              } else {
                // User not found - check if we should auto-provision
                if (provider.autoProvisionUsers && ldapEmail) {
                  this.logger.debug(`User ${actualUsername} not found - attempting to auto-provision`);
                  try {
                    // Get user's full name from LDAP
                    const userSearch: any = await client.search(dnString, {
                      scope: 'base',
                      attributes: ['cn', 'displayName', 'givenName', 'sn'],
                    });
                    
                    let displayName = actualUsername;
                    if (userSearch.searchEntries && userSearch.searchEntries.length > 0) {
                      const entry = userSearch.searchEntries[0];
                      displayName = entry.displayName?.toString() || 
                                  entry.cn?.toString() || 
                                  `${entry.givenName || ''} ${entry.sn || ''}`.trim() ||
                                  actualUsername;
                    }
                    
                    // Create the user
                    const newUser = await this.signupService.signup(
                      {
                        email: ldapEmail,
                        name: displayName,
                        password: generateRandomPassword(),
                      },
                      workspaceId,
                      undefined, // role
                      true, // hasGeneratedPassword
                      undefined, // trx
                    );
                    
                    this.logger.debug(`Auto-provisioned user: ${ldapEmail}`);
                    
                    // Add to group
                    await this.db
                      .insertInto('groupUsers')
                      .values({
                        userId: newUser.id,
                        groupId: groupId,
                      })
                      .execute();
                  } catch (error: any) {
                    this.logger.error(`Failed to auto-provision user: ${error.message}`);
                  }
                } else {
                  this.logger.debug(`User ${actualUsername} not found in database`);
                }
              }
            }
            
            // Process memberUid attributes (POSIX groups)
            if (groupEntry.memberUid) {
              const memberUids = Array.isArray(groupEntry.memberUid) ? groupEntry.memberUid : [groupEntry.memberUid];
              
              for (const uid of memberUids) {
                const username = uid.toString().toLowerCase();
                const workspace = await this.workspaceRepo.findById(workspaceId);
                const defaultDomain = workspace?.emailDomains?.[0] || 'ldap.local';
                let userId = userEmailMap.get(username) || userEmailMap.get(`${username}@${defaultDomain}`);
                
                if (userId) {
                  try {
                    await this.db
                      .insertInto('groupUsers')
                      .values({
                        userId: userId,
                        groupId: groupId,
                      })
                      .onConflict((oc) => oc.columns(['userId', 'groupId']).doNothing())
                      .execute();
                    this.logger.debug(`Added user ${username} to group ${groupName}`);
                  } catch (e) {
                    this.logger.error(`Failed to add user ${username} to group: ${e}`);
                  }
                } else {
                  this.logger.debug(`User ${username} not found in database`);
                }
              }
            }
          }
        }
      } catch (e) {
        this.logger.error('Failed to search for groups with members');
      }
    } catch (error: any) {
      this.logger.error(`Error syncing group memberships: ${error.message}`);
    }
  }

  private async syncUserGroups(
    userId: string,
    ldapGroups: string[],
    workspaceId: string,
  ): Promise<void> {
    this.logger.debug(`Syncing user groups: ${ldapGroups.length} groups for user ${userId}`);
    
    try {
      // Get all existing groups in the workspace
      const existingGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .execute();
      
      // Create a map of group names to group IDs for quick lookup
      const groupMap = new Map<string, string>();
      existingGroups.forEach(group => {
        groupMap.set(group.name.toLowerCase(), group.id);
        this.logger.log(`Existing group: ${group.name} (${group.id})`);
      });

      // Get current group memberships for the user
      const currentGroupMemberships = await this.db
        .selectFrom('groupUsers')
        .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
        .select(['groups.id', 'groups.name'])
        .where('groupUsers.userId', '=', userId)
        .where('groups.workspaceId', '=', workspaceId)
        .execute();

      const currentGroupIds = new Set(currentGroupMemberships.map(g => g.id));
      const ldapGroupIds = new Set<string>();

      // Process each LDAP group
      console.log(`\nProcessing ${ldapGroups.length} LDAP groups...`);
      this.logger.log(`=== Processing ${ldapGroups.length} LDAP groups ===`);
      for (const ldapGroupName of ldapGroups) {
        console.log(`\n  Processing LDAP group: "${ldapGroupName}"`);
        this.logger.log(`Processing group: "${ldapGroupName}"`);
        const normalizedName = ldapGroupName.toLowerCase();
        let groupId = groupMap.get(normalizedName);
        console.log(`    Normalized name: "${normalizedName}"`);
        console.log(`    Found in map: ${groupId ? 'YES' : 'NO'}`);

        // Only sync membership for groups that already exist
        // Groups should be created by syncAllLdapGroups based on the LDAP filter
        if (!groupId) {
          console.log(`    ✗ Group "${ldapGroupName}" does not exist in database - skipping`);
          console.log(`      (Groups must match the LDAP filter to be created)`);
          this.logger.log(`  Group "${ldapGroupName}" not found in database - skipping (not in LDAP filter results)`);
          continue;
        } else {
          this.logger.log(`  Group "${ldapGroupName}" already exists with ID: ${groupId}`);
        }

        ldapGroupIds.add(groupId);

        // Add user to group if not already a member
        if (!currentGroupIds.has(groupId)) {
          this.logger.log(`  User NOT in group "${ldapGroupName}" (${groupId}), adding...`);
          try {
            const result = await this.db
              .insertInto('groupUsers')
              .values({
                userId: userId,
                groupId: groupId,
              })
              .onConflict((oc) => oc.columns(['userId', 'groupId']).doNothing())
              .execute();
            this.logger.log(`  ✓ Added user ${userId} to group "${ldapGroupName}" (${groupId})`);
            
            // Verify the membership was created
            const verifyMembership = await this.db
              .selectFrom('groupUsers')
              .select(['userId', 'groupId'])
              .where('userId', '=', userId)
              .where('groupId', '=', groupId)
              .executeTakeFirst();
            
            if (verifyMembership) {
              this.logger.log(`  ✓ Verified: User is now member of group ${groupId}`);
            } else {
              this.logger.error(`  ✗ Warning: Membership verification failed for group ${groupId}`);
            }
          } catch (memberError: any) {
            this.logger.error(`  ✗ Failed to add user to group: ${memberError.message}`);
          }
        } else {
          this.logger.log(`  User already member of group: "${ldapGroupName}" (${groupId})`);
        }
      }

      // Remove user from groups that are no longer in LDAP (optional - can be configured)
      // This is commented out by default to avoid removing manual group assignments
      // Uncomment if you want strict LDAP group sync
      /*
      for (const currentGroup of currentGroupMemberships) {
        if (!ldapGroupIds.has(currentGroup.id) && !currentGroup.isDefault) {
          this.logger.log(`Removing user from group: ${currentGroup.name} (${currentGroup.id})`);
          await this.db
            .deleteFrom('groupUsers')
            .where('userId', '=', userId)
            .where('groupId', '=', currentGroup.id)
            .execute();
        }
      }
      */

      console.log('\n========== GROUP SYNC COMPLETED ==========');
      console.log(`Total LDAP groups processed: ${ldapGroups.length}`);
      console.log(`Groups user is now member of: ${ldapGroupIds.size}`);
      console.log('==========================================\n');
      
      this.logger.log(`=== Group sync completed ===`);
      this.logger.log(`Total LDAP groups processed: ${ldapGroups.length}`);
      this.logger.log(`Groups user is now member of: ${ldapGroupIds.size}`);
      
    } catch (error: any) {
      console.log(`\n✗✗✗ GROUP SYNC FAILED: ${error.message} ✗✗✗\n`);
      this.logger.error(`Failed to sync user groups: ${error.message}`);
      throw error;
    }
  }

  private async createOrUpdateAuthAccount(
    userId: string,
    providerId: string,
    workspaceId: string,
  ): Promise<void> {
      await this.db
        .insertInto('authAccounts')
        .values({
        userId: userId,
          authProviderId: providerId,
        providerUserId: userId, // Use userId as provider user ID for LDAP
        workspaceId: workspaceId,
      })
      .onConflict((oc) => 
        oc.columns(['userId', 'authProviderId']).doUpdateSet({
          updatedAt: new Date(),
        })
      )
        .execute();
    }

  async validateRecoveryCode(
    workspaceId: string,
    userId: string,
    code: string,
  ): Promise<boolean> {
    // LDAP doesn't use recovery codes, this is just a placeholder
    return false;
  }
}
