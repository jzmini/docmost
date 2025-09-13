import {
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
import { LdapService, LdapLoginDto, LdapTestDto } from '../services/ldap.service';
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
    const isProduction = (process as any).env.NODE_ENV === 'production';
    
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
