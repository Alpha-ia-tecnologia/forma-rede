import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, permissionsForRole } from '@formarede/contracts';
import { jwtSecret } from './jwt-secret';

type JwtPayload = AuthUser & { sub: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return {
      id: payload.sub,
      email: payload.email,
      nome: payload.nome,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      role: payload.role,
      // O token guarda as permissoes do momento do login; o papel e a fonte da verdade,
      // entao uma permissao criada depois vale para quem ja estava logado.
      permissions: permissionsForRole(payload.role),
    };
  }
}
