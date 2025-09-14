import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SsoController } from './controllers/sso.controller';
import { AuthService } from './services/auth.service';
import { LdapService } from './services/ldap.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, SsoController],
  providers: [AuthService, SignupService, LdapService, JwtStrategy, AuthProviderRepo, GroupRepo, WorkspaceRepo],
  exports: [SignupService, LdapService],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);
  
  onModuleInit() {
    this.logger.log('Auth module initialized with LDAP support');
    this.logger.log('Controllers: AuthController, SsoController');
    this.logger.log('Services: LdapService active');
  }
}
