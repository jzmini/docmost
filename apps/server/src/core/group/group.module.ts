import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { GroupService } from './services/group.service';
import { GroupController } from './group.controller';
import { GroupUserService } from './services/group-user.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [GroupController],
  providers: [GroupService, GroupUserService],
  exports: [GroupService, GroupUserService],
})
export class GroupModule implements OnModuleInit {
  private readonly logger = new Logger(GroupModule.name);
  
  onModuleInit() {
    this.logger.log('Group module initialized with enhanced logging');
    this.logger.log('Controller: GroupController');
    this.logger.log('Services: GroupService, GroupUserService');
  }
}
