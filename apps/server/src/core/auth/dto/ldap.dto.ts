import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class LdapLoginDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsString()
  providerId: string;
}

export class LdapTestDto {
  @IsNotEmpty()
  @IsString()
  ldapUrl: string;

  @IsNotEmpty()
  @IsString()
  ldapBindDn: string;

  @IsOptional()
  @IsString()
  ldapBindPassword?: string;

  @IsNotEmpty()
  @IsString()
  ldapBaseDn: string;

  @IsOptional()
  @IsString()
  ldapUserSearchFilter?: string;

  @IsOptional()
  @IsString()
  ldapGroupSearchFilter?: string;

  @IsOptional()
  @IsBoolean()
  ldapTlsEnabled?: boolean;

  @IsOptional()
  @IsString()
  ldapTlsCaCert?: string;

  @IsOptional()
  @IsString()
  testUsername?: string;

  @IsOptional()
  @IsString()
  testPassword?: string;
}
