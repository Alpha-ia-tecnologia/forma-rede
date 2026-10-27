import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  AuthUser,
  createEscolaSchema,
  CreateEscolaDto,
  createRegionalSchema,
  CreateRegionalDto,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions, Roles } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { OrganizationsService } from './organizations.service';

@Controller()
export class OrganizationsController {
  constructor(private readonly org: OrganizationsService) {}

  // Superadmin: visao de todos os municipios da plataforma.
  @Get('tenants')
  @Roles('SUPERADMIN')
  listTenants() {
    return this.org.listTenants();
  }

  @Get('tenants/current')
  currentTenant(@CurrentUser() user: AuthUser) {
    return this.org.currentTenant(user.tenantId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.org.dashboard(user.tenantId);
  }

  @Get('regionais')
  @RequirePermissions('regional:read')
  listRegionais(@CurrentUser() user: AuthUser) {
    return this.org.listRegionais(user.tenantId);
  }

  @Post('regionais')
  @RequirePermissions('regional:create')
  createRegional(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRegionalSchema)) dto: CreateRegionalDto,
  ) {
    return this.org.createRegional(user.tenantId, dto);
  }

  @Get('escolas')
  @RequirePermissions('escola:read')
  listEscolas(@CurrentUser() user: AuthUser) {
    return this.org.listEscolas(user.tenantId);
  }

  @Post('escolas')
  @RequirePermissions('escola:create')
  createEscola(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEscolaSchema)) dto: CreateEscolaDto,
  ) {
    return this.org.createEscola(user.tenantId, dto);
  }

  @Delete('escolas/:id')
  @RequirePermissions('escola:delete')
  removeEscola(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.deactivateEscola(user.tenantId, id);
  }
}
