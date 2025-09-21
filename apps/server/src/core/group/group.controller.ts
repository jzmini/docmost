import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { GroupService } from './services/group.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { GroupUserService } from './services/group-user.service';
import { GroupIdDto } from './dto/group-id.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { AddGroupUserDto } from './dto/add-group-user.dto';
import { RemoveGroupUserDto } from './dto/remove-group-user.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { LdapService } from '../auth/services/ldap.service';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupController {
  private readonly logger = new Logger(GroupController.name);
  
  constructor(
    private readonly groupService: GroupService,
    private readonly groupUserService: GroupUserService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(forwardRef(() => LdapService))
    private readonly ldapService: LdapService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async getWorkspaceGroups(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.logger.log(`=== Groups API Request ===`);
    this.logger.log(`User: ${user.email} (${user.id})`);
    this.logger.log(`Workspace: ${workspace.id}`);
    this.logger.log(`Request body: ${JSON.stringify(pagination)}`);
    
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group)) {
      this.logger.error(`User ${user.email} does not have permission to read groups`);
      throw new ForbiddenException();
    }
    
    this.logger.log(`User has permission, syncing LDAP groups first...`);
    
    // Sync LDAP groups and memberships before fetching
    try {
      console.log('\n=== TRIGGERING LDAP SYNC FROM GROUPS PAGE ===');
      console.log('This will sync groups and update memberships for existing users.');
      console.log('Note: Only users who have logged into Docmost will be added to groups.');
      await this.ldapService.syncAllLdapGroups(workspace.id);
      console.log('=== LDAP SYNC COMPLETE ===\n');
    } catch (error: any) {
      console.log(`LDAP sync error (non-fatal): ${error.message}`);
      this.logger.warn(`LDAP group sync failed: ${error.message}`);
      // Continue to show existing groups even if LDAP sync fails
    }
    
    this.logger.log(`Fetching groups from database...`);
    
    const result = await this.groupService.getWorkspaceGroups(workspace.id, pagination);
    
    this.logger.log(`Groups fetched, count: ${result?.items?.length || 0}`);
    const total = (result?.meta as any)?.total || 0;
    this.logger.log(`Total groups in DB: ${total}`);
    
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  getGroup(
    @Body() groupIdDto: GroupIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }
    return this.groupService.getGroupInfo(groupIdDto.groupId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  createGroup(
    @Body() createGroupDto: CreateGroupDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }
    return this.groupService.createGroup(user, workspace.id, createGroupDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  updateGroup(
    @Body() updateGroupDto: UpdateGroupDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    return this.groupService.updateGroup(workspace.id, updateGroupDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  getGroupMembers(
    @Body() groupIdDto: GroupIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }

    return this.groupUserService.getGroupUsers(
      groupIdDto.groupId,
      workspace.id,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/add')
  addGroupMember(
    @Body() addGroupUserDto: AddGroupUserDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    return this.groupUserService.addUsersToGroupBatch(
      addGroupUserDto.userIds,
      addGroupUserDto.groupId,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/remove')
  removeGroupMember(
    @Body() removeGroupUserDto: RemoveGroupUserDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    return this.groupUserService.removeUserFromGroup(
      removeGroupUserDto.userId,
      removeGroupUserDto.groupId,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  deleteGroup(
    @Body() groupIdDto: GroupIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }
    return this.groupService.deleteGroup(groupIdDto.groupId, workspace.id);
  }
}
