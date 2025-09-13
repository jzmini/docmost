import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SsoController } from './controllers/sso.controller';
import { AuthService } from './services/auth.service';
import { LdapService } from './services/ldap.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, SsoController],
  providers: [AuthService, SignupService, LdapService, JwtStrategy, AuthProviderRepo],
  exports: [SignupService, LdapService],
})
export class AuthModule {}
