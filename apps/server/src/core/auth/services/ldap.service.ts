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
    console.log('\n\n========== LDAP LOGIN ATTEMPT ==========');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Username: ${ldapLoginDto.username}`);
    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`Provider ID: ${ldapLoginDto.providerId}`);
    
    const provider = await this.authProviderRepo.findById(
      ldapLoginDto.providerId,
      workspaceId,
    );

    if (!provider) {
      console.log('LOGIN FAILED: Provider not found');
      console.log(`Provider ID ${ldapLoginDto.providerId} does not exist`);
      console.log('=========================================\n\n');
      throw new UnauthorizedException('LDAP provider not found');
    }
    
    if (provider.type !== 'ldap') {
      console.log('LOGIN FAILED: Provider is not LDAP type');
      console.log(`Provider type is: ${provider.type}`);
      console.log('=========================================\n\n');
      throw new UnauthorizedException('Provider is not an LDAP provider');
    }
    
    if (!provider.isEnabled) {
      console.log('LOGIN FAILED: Provider is disabled');
      console.log('=========================================\n\n');
      throw new UnauthorizedException('LDAP provider is disabled');
    }

    console.log(`Provider found - Type: ${provider.type}, Enabled: ${provider.isEnabled}`);
    console.log(`Provider Name: ${provider.name}`);
    console.log(`LDAP URL: ${provider.ldapUrl}`);
    console.log(`LDAP Base DN: ${provider.ldapBaseDn}`);
    console.log(`LDAP User Search Filter: ${provider.ldapUserSearchFilter}`);
    console.log(`Provider groupSync: ${provider.groupSync}`);
    
    this.logger.log(`=== LDAP Login Started ===`);
    this.logger.log(`Provider ID: ${provider.id}, Type: ${provider.type}`);
    this.logger.log(`Provider groupSync setting: ${provider.groupSync}`);
    
    console.log('Calling authenticateLdap...');
    const ldapUser = await this.authenticateLdap(
      provider,
      ldapLoginDto.username,
      ldapLoginDto.password,
      workspaceId,
    );
    
    console.log('LDAP authentication result:');
    console.log(`  - Email: ${ldapUser?.email || 'N/A'}`);
    console.log(`  - Name: ${ldapUser?.name || 'N/A'}`);
    console.log(`  - Groups found: ${ldapUser?.groups?.length || 0}`);
    if (ldapUser?.groups && ldapUser.groups.length > 0) {
      console.log(`  - Group list: [${ldapUser.groups.join(', ')}]`);
    }

    if (!ldapUser) {
      console.log('LOGIN FAILED: authenticateLdap returned null');
      console.log('This means the user was not found or password was incorrect');
      console.log('=========================================\n\n');
      this.logger.error('LDAP authentication failed - no user returned');
      throw new UnauthorizedException('Invalid LDAP credentials');
    }
    
    this.logger.log(`LDAP user authenticated: ${ldapUser.email}`);
    this.logger.log(`LDAP groups returned: ${ldapUser.groups?.length || 0}`);

    // Find or create user
    let user = await this.userRepo.findByEmail(ldapUser.email, workspaceId);

    if (!user) {
      console.log(`User ${ldapUser.email} not found in database`);
      console.log('Creating user in Docmost database (LDAP users are always provisioned on successful authentication)');
      
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
      
      console.log(`✓ Successfully created user ${ldapUser.email} in Docmost database`);
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
        console.log(`User ${ldapUser.email} is a local-only user, denying LDAP authentication`);
        throw new UnauthorizedException('Please use local database authentication to login');
      }
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepo.updateLastLogin(user.id, workspaceId);

    // Create or update auth account
    await this.createOrUpdateAuthAccount(user.id, (provider.id as unknown) as string, workspaceId);

    // Sync groups if enabled
    console.log('\n=== GROUP SYNC CHECK ===');
    console.log(`Provider groupSync: ${provider.groupSync}`);
    console.log(`User groups available: ${ldapUser.groups?.length || 0}`);
    
    this.logger.log(`=== LDAP Group Sync Debug ===`);
    this.logger.log(`Provider settings - groupSync: ${provider.groupSync}, isEnabled: ${provider.isEnabled}`);
    this.logger.log(`LDAP user groups found: ${ldapUser.groups?.length || 0}`);
    if (ldapUser.groups && ldapUser.groups.length > 0) {
      this.logger.log(`Groups list: ${ldapUser.groups.join(', ')}`);
    }
    
    if (provider.groupSync && ldapUser.groups && ldapUser.groups.length > 0) {
      console.log(`STARTING GROUP SYNC for ${user.email}`);
      console.log(`Groups to sync: [${ldapUser.groups.join(', ')}]`);
      
      this.logger.log(`Starting group sync for user ${user.email} with ${ldapUser.groups.length} groups`);
      await this.syncUserGroups(user.id, ldapUser.groups, workspaceId);
      
      console.log('GROUP SYNC COMPLETED');
      this.logger.log(`Group sync completed for user ${user.email}`);
    } else {
      if (!provider.groupSync) {
        console.log('GROUP SYNC SKIPPED: Disabled in settings');
        this.logger.log(`Group sync is DISABLED for this provider`);
      } else if (!ldapUser.groups || ldapUser.groups.length === 0) {
        console.log('GROUP SYNC SKIPPED: No groups found for user');
        this.logger.log(`Group sync enabled but NO GROUPS found for user ${user.email}`);
      }
    }
    
    console.log('LDAP LOGIN SUCCESSFUL');
    console.log('=========================================\n\n');

    const token = await this.tokenService.generateAccessToken(user);
    console.log(`Token generated for user: ${user.email}`);
    return token;
  }

  private async authenticateLdap(
    provider: any,
    username: string,
    password: string,
    workspaceId?: string,
  ): Promise<{ email: string; name: string; groups?: string[] } | null> {
    console.log('\n=== LDAP AUTHENTICATION ATTEMPT ===');
    console.log(`Username: ${username}`);
    console.log(`Provider: ${provider.name}`);
    console.log(`LDAP URL: ${provider.ldapUrl}`);
    console.log(`Base DN: ${provider.ldapBaseDn}`);
    
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
      console.log(`Binding with service account: ${provider.ldapBindDn}`);
      await client.bind(provider.ldapBindDn!, provider.ldapBindPassword!);
      console.log('Service account bind successful');

      // Search for user - try multiple formats if email was provided
      let searchEntries: any[] = [];
      const usernameFormats = [username];
      
      // If username looks like an email, also try just the username part
      if (username.includes('@')) {
        const usernameOnly = username.split('@')[0];
        usernameFormats.push(usernameOnly);
        console.log(`Username appears to be an email, will also try: ${usernameOnly}`);
      }
      
      for (const usernameToTry of usernameFormats) {
        const searchFilter = (provider.ldapUserSearchFilter || '(mail={{username}})').replaceAll(
          '{{username}}',
          usernameToTry,
        );
        
        console.log(`\nAttempt with username: ${usernameToTry}`);
        console.log(`User search filter BEFORE replacement: ${provider.ldapUserSearchFilter}`);
        console.log(`User search filter AFTER replacement: ${searchFilter}`);
        console.log(`Searching in base DN: ${provider.ldapBaseDn}`);

        const searchResults: any = await client.search(provider.ldapBaseDn!, {
          filter: searchFilter,
          scope: 'sub',
          attributes: ['dn', 'mail', 'email', 'cn', 'displayName', 'givenName', 'sn', 'uid', 'memberOf'],
        });
        
        searchEntries = searchResults.searchEntries || [];
        console.log(`Search returned ${searchEntries.length} entries`);
        
        if (searchEntries.length > 0) {
          console.log('User found!');
          break; // Found the user, stop trying
        }
      }

      if (searchEntries.length === 0) {
        console.log('\nUSER NOT FOUND - All search attempts failed');
        console.log('Tried usernames: ' + usernameFormats.join(', '));
        console.log('Check that:');
        console.log('  1. The user search filter is correct');
        console.log('  2. The username format matches what LDAP expects');
        console.log('  3. Try with just username (e.g., "jianweiz" or "jz") not email');
        console.log('  4. Check LDAP user attributes (uid, cn, mail) match the filter');
        return null;
      }

      const userEntry = searchEntries[0];
      const userDn = userEntry.dn;
      console.log(`Found user DN: ${userDn}`);
      console.log(`User attributes: uid=${userEntry.uid}, cn=${userEntry.cn}, mail=${userEntry.mail}`);

      // Try to bind with user's credentials
      console.log('Unbinding service account...');
      await client.unbind();
      console.log(`Attempting to bind as user: ${userDn}`);
      await client.bind(userDn, password);
      console.log('User bind successful - password is correct');

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
      console.log('\n=== LDAP GROUP EXTRACTION ===');
      console.log(`User: ${username}`);
      console.log(`User DN: ${userDn}`);
      console.log(`Attributes found: ${Object.keys(userEntry).join(', ')}`);
      
      this.logger.log(`=== Extracting Groups for ${username} ===`);
      this.logger.log(`User DN: ${userDn}`);
      this.logger.log(`User entry attributes available: ${Object.keys(userEntry).join(', ')}`);
      
      // Log all attributes for debugging
      for (const [key, value] of Object.entries(userEntry)) {
        if (key !== 'dn') {
          this.logger.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
      
      if (userEntry.memberOf) {
        console.log(`✓ FOUND memberOf attribute`);
        console.log(`memberOf value: ${JSON.stringify(userEntry.memberOf)}`);
        this.logger.log(`✓ Found memberOf attribute: ${JSON.stringify(userEntry.memberOf)}`);
        const memberOfArray = Array.isArray(userEntry.memberOf) 
          ? userEntry.memberOf 
          : [userEntry.memberOf];
        
        groups = memberOfArray.map((groupDn: any) => {
          // Extract CN from DN (e.g., "CN=GroupName,OU=Groups,DC=example,DC=com" -> "GroupName")
          const match = groupDn.toString().match(/^CN=([^,]+)/i);
          const groupName = match ? match[1] : groupDn.toString();
          this.logger.log(`  - Extracted group: "${groupName}" from DN: ${groupDn}`);
          return groupName;
        });
        console.log(`✓ Groups extracted: ${groups.length} groups`);
        console.log(`Group names: [${groups.join(', ')}]`);
        this.logger.log(`✓ Total groups extracted from memberOf: ${groups.length}`);
      } else {
        console.log('✗ NO memberOf attribute - trying alternative methods...');
        this.logger.log('✗ No memberOf attribute found, trying alternative search methods...');
        // Alternative: Search for groups that contain this user
        try {
          // Try Active Directory style groups first
          this.logger.log(`Searching AD-style groups with filter: (&(objectClass=group)(member=${userDn}))`);
          let groupSearchResult = await client.search(provider.ldapBaseDn!, {
            filter: `(&(objectClass=group)(member=${userDn}))`,
            scope: 'sub',
            attributes: ['cn', 'dn'],
          });
          
          // If no results, try POSIX style groups
          if (!groupSearchResult.searchEntries || groupSearchResult.searchEntries.length === 0) {
            const uid = userEntry.uid?.toString() || username;
            this.logger.log(`No AD groups found. Searching POSIX-style groups with filter: (&(objectClass=posixGroup)(memberUid=${uid}))`);
            groupSearchResult = await client.search(provider.ldapBaseDn!, {
              filter: `(&(objectClass=posixGroup)(memberUid=${uid}))`,
              scope: 'sub',
              attributes: ['cn', 'dn'],
            });
          }
          
          // If still no results, try groupOfNames/groupOfUniqueNames
          if (!groupSearchResult.searchEntries || groupSearchResult.searchEntries.length === 0) {
            this.logger.log(`No POSIX groups found. Searching OpenLDAP-style groups...`);
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
            this.logger.log(`Found ${groups.length} groups by searching: ${groups.join(', ')}`);
          } else {
            this.logger.log('No groups found for user by searching');
          }
        } catch (groupError: any) {
          this.logger.error(`Failed to search for user groups: ${groupError.message}`);
        }
      }
      
      console.log(`\n=== FINAL LDAP RESULT ===`);
      console.log(`Email: ${email}`);
      console.log(`Name: ${name}`);
      console.log(`Groups found: ${groups.length}`);
      if (groups.length > 0) {
        console.log(`Group list: [${groups.join(', ')}]`);
      } else {
        console.log('NO GROUPS FOUND!');
      }
      console.log('========================\n');
      
      this.logger.log(`=== Final group list: [${groups.join(', ')}] ===`);

      await client.unbind();
      this.logger.log(`Returning LDAP user - email: ${email}, name: ${name}, groups: ${groups.length}`);
      return { email, name, groups };
    } catch (error: any) {
      console.log('\n=== LDAP AUTHENTICATION FAILED ===');
      console.log(`Error message: ${error.message}`);
      console.log(`Error code: ${error.code}`);
      console.log(`Error stack: ${error.stack}`);
      
      if (error.message?.includes('InvalidCredentials')) {
        console.log('REASON: Invalid password for user');
      } else if (error.message?.includes('ECONNREFUSED')) {
        console.log('REASON: Cannot connect to LDAP server');
      } else if (error.message?.includes('ETIMEDOUT')) {
        console.log('REASON: LDAP server connection timeout');
      }
      console.log('===================================\n');
      
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
    console.log('\n========== SYNC ALL LDAP GROUPS ==========');
    console.log(`Workspace ID: ${workspaceId}`);
    
    const providers = await this.authProviderRepo.findEnabledByWorkspace(workspaceId);
    const provider = providers.find(p => p.type === 'ldap');
    
    if (!provider || !provider.isEnabled || !provider.groupSync) {
      console.log('LDAP not enabled or group sync disabled');
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
      console.log('Searching for LDAP groups...');
      let allGroups: Set<string> = new Set();
      let groupDetails: Map<string, any> = new Map();
      
      // Use configured group filter or default to groupOfNames
      const groupFilter = provider.ldapGroupSearchFilter || '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames))';
      console.log(`Using group filter: ${groupFilter}`);
      
      try {
        const searchResult: any = await client.search(provider.ldapBaseDn!, {
          filter: groupFilter,
          scope: 'sub',
          attributes: ['cn', 'dn', 'member', 'uniqueMember', 'memberUid', 'name'],
        });
        
        if (searchResult.searchEntries && searchResult.searchEntries.length > 0) {
          console.log(`Found ${searchResult.searchEntries.length} groups:`);
          searchResult.searchEntries.forEach((entry: any) => {
            const groupName = entry.cn?.toString() || entry.name?.toString();
            if (groupName) {
              allGroups.add(groupName);
              groupDetails.set(groupName, entry);
              console.log(`  - ${groupName}`);
            }
          });
        } else {
          console.log('No groups found with the configured filter');
          console.log('Consider adjusting the LDAP Group Search Filter in settings');
        }
      } catch (e: any) {
        console.log(`Group search failed: ${e.message}`);
        console.log('Please check your LDAP Group Search Filter syntax');
      }
      
      const uniqueGroups = Array.from(allGroups);
      
      console.log(`\n========== SUMMARY ==========`);
      console.log(`Total groups found: ${uniqueGroups.length}`);
      if (uniqueGroups.length > 0) {
        console.log(`Groups to sync: [${uniqueGroups.join(', ')}]`);
      }
      console.log(`=============================\n`);
      
      // First, remove LDAP groups that no longer exist in LDAP
      console.log('\n=== REMOVING OBSOLETE LDAP GROUPS ===');
      const existingLdapGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('isDefault', '=', false)
        .where('deletedAt', 'is', null)
        .execute();
      
      for (const group of existingLdapGroups) {
        if (!allGroups.has(group.name)) {
          console.log(`Removing obsolete LDAP group: "${group.name}" (not found in LDAP)`);
          
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
          
          console.log(`✓ Removed group "${group.name}" and its memberships`);
        }
      }
      console.log('=== OBSOLETE GROUP REMOVAL COMPLETE ===\n');
      
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
              console.log(`✓ Created LDAP group: "${groupName}" (ID: ${newGroup.id})`);
            } catch (error: any) {
              console.log(`✗ Failed to create group "${groupName}": ${error.message}`);
            }
          } else {
            console.log(`Group "${groupName}" already exists`);
          }
        }
        
        // Optionally sync group memberships
        console.log('\\n=== SYNCING GROUP MEMBERSHIPS ===');
        await this.syncAllGroupMemberships(workspaceId, provider, client);
        console.log('=== GROUP MEMBERSHIP SYNC COMPLETE ===\\n');
      } else {
        console.log('No LDAP groups found!');
        console.log('\nTrying to debug LDAP structure...');
        
        // Debug: List all objectClasses to understand LDAP structure
        try {
          const allEntries: any = await client.search(provider.ldapBaseDn!, {
            filter: '(objectClass=*)',
            scope: 'sub',
            attributes: ['objectClass', 'cn', 'ou', 'dn'],
            sizeLimit: 100, // Limit to prevent overwhelming output
          });
          
          if (allEntries.searchEntries && allEntries.searchEntries.length > 0) {
            const objectClasses = new Set<string>();
            allEntries.searchEntries.forEach((entry: any) => {
              if (entry.objectClass) {
                const classes = Array.isArray(entry.objectClass) ? entry.objectClass : [entry.objectClass];
                classes.forEach((c: any) => objectClasses.add(c.toString()));
              }
            });
            console.log(`\nFound objectClasses in LDAP: ${Array.from(objectClasses).join(', ')}`);
            console.log(`Total entries scanned: ${allEntries.searchEntries.length}`);
          }
        } catch (e) {
          console.log('Debug scan failed');
        }
      }
      
      await client.unbind();
    } catch (error: any) {
      console.log(`LDAP group sync error: ${error.message}`);
      this.logger.error(`Failed to sync all LDAP groups: ${error.message}`);
    } finally {
      try {
        await client.unbind();
      } catch (e) {
        // Ignore unbind errors
      }
    }
    
    console.log('==========================================\n');
  }

  private async syncAllGroupMemberships(
    workspaceId: string,
    provider: any,
    client: any,
  ): Promise<void> {
    try {
      console.log('\n=== SYNCING GROUP MEMBERSHIPS ===');
      console.log(`Workspace: ${workspaceId}`);
      console.log(`Provider: ${provider.name} (${provider.id})`);
      
      // First, clear existing LDAP group memberships (keep local groups intact)
      console.log('\nClearing existing LDAP group memberships...');
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
        console.log(`Cleared memberships for group: ${group.name}`);
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
        console.log(`DB Group: ${g.name} (${g.id})`);
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
        console.log(`  DB User: ${u.email} (${u.id})`);
      });
      
      console.log(`Found ${dbUsers.length} users in database`);
      
      // Search for groups with members in LDAP
      console.log('\nSearching for group memberships in LDAP...');
      console.log(`Base DN: ${provider.ldapBaseDn}`);
      
      // Use configured group filter or default
      const groupFilter = provider.ldapGroupSearchFilter || '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames))';
      console.log(`Group filter: ${groupFilter}`);
      
      // 1. Search for groups with member attributes
      try {
        const groupsWithMembers: any = await client.search(provider.ldapBaseDn!, {
          filter: groupFilter,
          scope: 'sub',
          attributes: ['cn', 'member', 'uniqueMember', 'memberUid', 'objectClass'],
        });
        
        if (groupsWithMembers.searchEntries && groupsWithMembers.searchEntries.length > 0) {
          console.log(`\nFound ${groupsWithMembers.searchEntries.length} groups in LDAP with filter`);
          
          for (const groupEntry of groupsWithMembers.searchEntries) {
            const groupName = groupEntry.cn?.toString();
            if (!groupName) {
              console.log(`  Warning: Group entry without cn attribute, skipping`);
              continue;
            }
            
            const groupId = groupMap.get(groupName.toLowerCase());
            if (!groupId) {
              console.log(`  Group "${groupName}" not in Docmost database, skipping`);
              continue;
            }
            
            console.log(`\n  Processing Group: ${groupName}`);
            console.log(`    Object classes: ${groupEntry.objectClass}`);
            
            // Process member DNs (groupOfNames/groupOfUniqueNames)
            const memberDns = [];
            if (groupEntry.member) {
              const memberArray = Array.isArray(groupEntry.member) ? groupEntry.member : [groupEntry.member];
              memberDns.push(...memberArray);
              console.log(`    Found ${memberArray.length} 'member' attributes`);
            }
            if (groupEntry.uniqueMember) {
              const uniqueMemberArray = Array.isArray(groupEntry.uniqueMember) ? groupEntry.uniqueMember : [groupEntry.uniqueMember];
              memberDns.push(...uniqueMemberArray);
              console.log(`    Found ${uniqueMemberArray.length} 'uniqueMember' attributes`);
            }
            
            console.log(`    Total member DNs to process: ${memberDns.length}`);
            
            // Process each member DN
            for (const memberDn of memberDns) {
              const dnString = memberDn.toString();
              console.log(`      Processing DN: ${dnString}`);
              
              // Extract username from DN (e.g., "cn=jianweiz,ou=people,dc=minilab,dc=top" -> "jianweiz")
              const cnMatch = dnString.match(/cn=([^,]+)/i);
              if (!cnMatch) {
                console.log(`        Could not extract cn from DN`);
                continue;
              }
              
              const cnValue = cnMatch[1];
              console.log(`        Extracted CN: ${cnValue}`);
              
              // Look up the actual user entry to get their uid/email
              let actualUsername = cnValue.toLowerCase();
              let ldapEmail: string | null = null;
              try {
                console.log(`        Looking up user entry in LDAP: ${dnString}`);
                const userSearch: any = await client.search(dnString, {
                  scope: 'base',
                  attributes: ['uid', 'mail', 'email', 'cn', 'sAMAccountName'],
                });
                
                if (userSearch.searchEntries && userSearch.searchEntries.length > 0) {
                  const userEntry = userSearch.searchEntries[0];
                  // Prefer uid over cn for username
                  actualUsername = (userEntry.uid || userEntry.sAMAccountName || userEntry.cn || cnValue).toString().toLowerCase();
                  ldapEmail = (userEntry.mail || userEntry.email)?.toString().toLowerCase() || null;
                  console.log(`        Found LDAP user - uid: ${userEntry.uid}, cn: ${userEntry.cn}, mail: ${userEntry.mail}`);
                  console.log(`        Using username: ${actualUsername}, email: ${ldapEmail}`);
                }
              } catch (e) {
                console.log(`        Could not look up user entry, using CN as username`);
              }
              
              // Try to find user in database by username or email
              console.log(`        Looking for user in database...`);
              
              // First try with LDAP email if available
              let userId: string | undefined;
              if (ldapEmail) {
                console.log(`        Checking LDAP email: ${ldapEmail}`);
                userId = userEmailMap.get(ldapEmail);
                if (userId) {
                  console.log(`        Found user by LDAP email: ${ldapEmail}`);
                }
              }
              
              // Then try with username
              if (!userId) {
                console.log(`        Checking direct username: ${actualUsername}`);
                userId = userEmailMap.get(actualUsername);
              }
              
              if (!userId) {
                console.log(`        Username not found directly, trying with email domains...`);
                // Try with workspace email domains
                const workspace = await this.workspaceRepo.findById(workspaceId);
                const defaultDomain = workspace?.emailDomains?.[0] || 'ldap.local';
                console.log(`        Workspace email domain: ${defaultDomain}`);
                const possibleEmails = [
                  `${actualUsername}@${defaultDomain}`,
                  actualUsername
                ];
                
                console.log(`        Checking possible emails: ${possibleEmails.join(', ')}`);
                for (const email of possibleEmails) {
                  userId = userEmailMap.get(email.toLowerCase());
                  if (userId) {
                    console.log(`        Found user with email: ${email}`);
                    break;
                  }
                }
              } else {
                console.log(`        Found user directly: ${actualUsername}`);
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
                  console.log(`    ✓ Added user ${actualUsername} to group ${groupName}`);
                } catch (e) {
                  console.log(`    ✗ Failed to add user ${actualUsername} to group: ${e}`);
                }
              } else {
                // User not found - check if we should auto-provision
                if (provider.autoProvisionUsers && ldapEmail) {
                  console.log(`    ⚠ User ${actualUsername} not found - attempting to auto-provision`);
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
                    
                    console.log(`    ✓ Auto-provisioned user: ${ldapEmail} (${newUser.id})`);
                    
                    // Add to group
                    await this.db
                      .insertInto('groupUsers')
                      .values({
                        userId: newUser.id,
                        groupId: groupId,
                      })
                      .execute();
                    console.log(`    ✓ Added auto-provisioned user to group ${groupName}`);
                  } catch (error: any) {
                    console.log(`    ✗ Failed to auto-provision user: ${error.message}`);
                  }
                } else {
                  console.log(`    ⚠ User ${actualUsername} not found in database (user must log in first)`);
                }
              }
            }
            
            // Process memberUid attributes (POSIX groups)
            if (groupEntry.memberUid) {
              const memberUids = Array.isArray(groupEntry.memberUid) ? groupEntry.memberUid : [groupEntry.memberUid];
              console.log(`    Found ${memberUids.length} 'memberUid' attributes`);
              
              for (const uid of memberUids) {
                const username = uid.toString().toLowerCase();
                console.log(`      Processing memberUid: ${username}`);
                const workspace = await this.workspaceRepo.findById(workspaceId);
                const defaultDomain = workspace?.emailDomains?.[0] || 'ldap.local';
                console.log(`        Checking for user: ${username} or ${username}@${defaultDomain}`);
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
                    console.log(`    ✓ Added user ${username} to group ${groupName}`);
                  } catch (e) {
                    console.log(`    ✗ Failed to add user ${username} to group`);
                  }
                } else {
                  console.log(`    ⚠ User ${username} not found in database`);
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('Failed to search for groups with members');
      }
      
      // Get final count of group memberships
      console.log('\n=== MEMBERSHIP SYNC SUMMARY ===');
      for (const group of ldapGroups) {
        const memberCount = await this.db
          .selectFrom('groupUsers')
          .select(this.db.fn.count('userId').as('count'))
          .where('groupId', '=', group.id)
          .executeTakeFirst();
        console.log(`  ${group.name}: ${memberCount?.count || 0} members`);
      }
      
      console.log('\nGroup membership sync completed');
    } catch (error: any) {
      console.log(`Error syncing group memberships: ${error.message}`);
      console.log(`Error details: ${error.stack}`);
    }
  }

  private async syncUserGroups(
    userId: string,
    ldapGroups: string[],
    workspaceId: string,
  ): Promise<void> {
    console.log('\n========== GROUP SYNC STARTED ==========');
    console.log(`User ID: ${userId}`);
    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`LDAP Groups count: ${ldapGroups.length}`);
    console.log(`LDAP Groups: [${ldapGroups.join(', ')}]`);
    
    this.logger.log(`=== Starting syncUserGroups ===`);
    this.logger.log(`User ID: ${userId}, Workspace: ${workspaceId}`);
    this.logger.log(`LDAP Groups to sync: ${ldapGroups.join(', ')}`);
    
    try {
      // Get all existing groups in the workspace
      const existingGroups = await this.db
        .selectFrom('groups')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .execute();
      
      this.logger.log(`Found ${existingGroups.length} existing groups in workspace`);
      
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
