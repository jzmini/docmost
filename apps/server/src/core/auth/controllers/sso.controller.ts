import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { Workspace, User } from '@docmost/db/types/entity.types';
import { AuthProviderRepo, CreateAuthProviderDto, UpdateAuthProviderDto } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { LdapService } from '../services/ldap.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { LdapLoginDto, LdapTestDto } from '../dto/ldap.dto';
import { FastifyReply } from 'fastify';
import { UserRole } from '../../../common/helpers/types/permission';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';

@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private authProviderRepo: AuthProviderRepo,
    private ldapService: LdapService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  private checkWorkspaceManagePermission(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (!ability.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('providers')
  async getProviders(
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    
    // Clean up old deleted providers first
    await this.authProviderRepo.cleanupOldDeletedProviders(workspace.id);
    
    const providers = await this.authProviderRepo.findByWorkspace(workspace.id);
    
    // Check connection status for LDAP providers when loading the page
    for (const provider of providers) {
      if (provider.type === 'ldap') {
        // Check if status is stale (older than 5 minutes) or never checked
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (!provider.lastCheckedAt || new Date(provider.lastCheckedAt) < fiveMinutesAgo) {
          // Run check in background (don't wait for it to complete)
          this.ldapService.checkConnectionHealth(provider.id, workspace.id).catch(err => {
            this.logger.error(`Failed to check LDAP connection: ${err.message}`);
          });
        }
      }
    }
    
    // Mask sensitive data
    return providers.map(provider => ({
      ...provider,
      ldapBindPassword: provider.ldapBindPassword ? '***MASKED***' : undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***MASKED***' : undefined,
    }));
  }

  @UseGuards(JwtAuthGuard)
  @Get('providers/:id')
  async getProvider(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    const provider = await this.authProviderRepo.findById(id, workspace.id);
    
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    // Mask sensitive data
    return {
      ...provider,
      ldapBindPassword: provider.ldapBindPassword ? '***MASKED***' : undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***MASKED***' : undefined,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('providers')
  async createProvider(
    @Body() createDto: CreateAuthProviderDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    
    // Check for duplicate provider name
    const existingProviders = await this.authProviderRepo.findByWorkspace(workspace.id);
    const duplicateName = existingProviders.find(
      p => p.name.toLowerCase() === createDto.name.toLowerCase() && p.deletedAt === null
    );
    
    if (duplicateName) {
      throw new BadRequestException(`An authentication provider with the name "${createDto.name}" already exists`);
    }
    
    const provider = await this.authProviderRepo.create({
      ...createDto,
      workspaceId: workspace.id,
      creatorId: user.id,
    });
    
    // Mask sensitive data
    return {
      ...provider,
      ldapBindPassword: provider.ldapBindPassword ? '***MASKED***' : undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***MASKED***' : undefined,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put('providers/:id')
  async updateProvider(
    @Param('id') id: string,
    @Body() updateDto: UpdateAuthProviderDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    
    // If name is being updated, check for duplicates
    if (updateDto.name) {
      const existingProviders = await this.authProviderRepo.findByWorkspace(workspace.id);
      const duplicateName = existingProviders.find(
        p => p.id !== id && p.name.toLowerCase() === updateDto.name.toLowerCase() && p.deletedAt === null
      );
      
      if (duplicateName) {
        throw new BadRequestException(`An authentication provider with the name "${updateDto.name}" already exists`);
      }
    }
    
    const provider = await this.authProviderRepo.update(
      id,
      workspace.id,
      updateDto,
    );
    
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    // Mask sensitive data
    return {
      ...provider,
      ldapBindPassword: provider.ldapBindPassword ? '***MASKED***' : undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***MASKED***' : undefined,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('providers/:id')
  async deleteProvider(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    await this.authProviderRepo.delete(id, workspace.id);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('ldap/:providerId/login')
  async ldapLogin(
    @Param('providerId') providerId: string,
    @Body() loginDto: Omit<LdapLoginDto, 'providerId'>,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      const authToken = await this.ldapService.login(
        { ...loginDto, providerId },
        workspace.id,
      );
      
      this.setAuthCookie(res, authToken);
      // Return nothing (void) for successful login, just like regular login does
      // The frontend will navigate to home when response is successful
      return;
    } catch (error: any) {
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('providers/:id/check-connection')
  async checkProviderConnection(
    @Param('id') providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    this.checkWorkspaceManagePermission(user, workspace);
    
    const provider = await this.authProviderRepo.findById(providerId, workspace.id);
    if (!provider || provider.type !== 'ldap') {
      throw new BadRequestException('Invalid provider');
    }
    
    const healthCheck = await this.ldapService.checkConnectionHealth(providerId, workspace.id);
    return healthCheck;
  }

  @UseGuards(JwtAuthGuard)
  @Post('ldap/test')
  async testLdapConnection(
    @Body() testDto: LdapTestDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    try {
      this.checkWorkspaceManagePermission(user, workspace);
      
      // If password is not provided, try to use the saved password
      if (!testDto.ldapBindPassword) {
        // Find an existing LDAP provider to get the saved password
        const providers = await this.authProviderRepo.findByWorkspace(workspace.id);
        const ldapProvider = providers.find(p => p.type === 'ldap' && p.ldapBindPassword);
        if (ldapProvider && ldapProvider.ldapBindPassword) {
          testDto.ldapBindPassword = ldapProvider.ldapBindPassword;
        }
      }
      
      const result = await this.ldapService.testConnection(testDto);
      return result;
    } catch (error: any) {
      throw error;
    }
  }

  private setAuthCookie(res: FastifyReply, authToken: string) {
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      secure: this.environmentService.isHttps(),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
