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
    const providers = await this.authProviderRepo.findByWorkspace(workspace.id);
    
    console.log('Providers from DB:', providers.map(p => ({
      id: p.id,
      type: p.type,
      connectionStatus: p.connectionStatus,
      lastCheckedAt: p.lastCheckedAt,
      lastError: p.lastError
    })));
    
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
    
    // Remove sensitive data
    return providers.map(provider => ({
      ...provider,
      ldapBindPassword: undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***' : undefined,
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
    
    // Remove sensitive data
    return {
      ...provider,
      ldapBindPassword: undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***' : undefined,
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
    const provider = await this.authProviderRepo.create({
      ...createDto,
      workspaceId: workspace.id,
      creatorId: user.id,
    });
    
    // Remove sensitive data
    return {
      ...provider,
      ldapBindPassword: undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***' : undefined,
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
    const provider = await this.authProviderRepo.update(
      id,
      workspace.id,
      updateDto,
    );
    
    if (!provider) {
      throw new Error('Provider not found');
    }
    
    // Remove sensitive data
    return {
      ...provider,
      ldapBindPassword: undefined,
      ldapTlsCaCert: provider.ldapTlsCaCert ? '***' : undefined,
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
      return { success: true };
    } catch (error: any) {
      this.logger.error(`LDAP login failed: ${error.message}`);
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
      const result = await this.ldapService.testConnection(testDto);
      return result;
    } catch (error: any) {
      this.logger.error(`LDAP test connection failed: ${error.message}`);
      throw error;
    }
  }

  private setAuthCookie(res: FastifyReply, authToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
