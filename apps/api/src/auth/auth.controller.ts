import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, loginSchema, LoginDto } from '@formarede/contracts';
import { CurrentUser, Public } from '../common/security';
import { ZodValidationPipe } from '../common/http';
import { AuthService } from './auth.service';

const switchSchema = z.object({ tenantSlug: z.string().min(1) });

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto.email, dto.senha, dto.tenantSlug);
  }

  @Get('auth/me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('auth/switch-tenant')
  switchTenant(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(switchSchema)) dto: { tenantSlug: string },
  ) {
    return this.auth.switchTenant(user, dto.tenantSlug);
  }
}
