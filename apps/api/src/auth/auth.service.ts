import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { prisma, runAsSystem } from '@formarede/db';
import { AuthUser, permissionsForRole, Role } from '@formarede/contracts';

type UserRecord = { id: string; email: string; nome: string; senhaHash: string; ativo: boolean };
type MembershipWithTenant = {
  role: string;
  tenantId: string;
  tenant: { slug: string; nome: string };
};

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(email: string, senha: string, tenantSlug?: string) {
    const user = (await prisma.user.findUnique({ where: { email } })) as UserRecord | null;
    if (!user || !user.ativo) throw new UnauthorizedException('Credenciais invalidas.');

    const ok = await bcrypt.compare(senha, user.senhaHash);
    if (!ok) throw new UnauthorizedException('Credenciais invalidas.');

    // Vinculos cruzam tenants -> leitura exige bypass de RLS.
    const memberships = (await runAsSystem((tx) =>
      tx.membership.findMany({
        where: { userId: user.id, ativo: true },
        include: { tenant: true },
      }),
    )) as unknown as MembershipWithTenant[];

    if (!memberships.length) throw new UnauthorizedException('Usuario sem vinculo ativo.');

    const chosen = tenantSlug
      ? memberships.find((m) => m.tenant.slug === tenantSlug)
      : memberships[0];
    if (!chosen) throw new UnauthorizedException('Sem acesso ao municipio informado.');

    const authUser = this.build(user, chosen);
    return {
      accessToken: await this.sign(authUser),
      user: authUser,
      tenants: memberships.map((m) => ({
        slug: m.tenant.slug,
        nome: m.tenant.nome,
        role: m.role as Role,
      })),
    };
  }

  async switchTenant(current: AuthUser, tenantSlug: string) {
    const membership = (await runAsSystem((tx) =>
      tx.membership.findFirst({
        where: { userId: current.id, ativo: true, tenant: { slug: tenantSlug } },
        include: { tenant: true },
      }),
    )) as unknown as MembershipWithTenant | null;
    if (!membership) throw new NotFoundException('Vinculo nao encontrado.');

    const user = (await prisma.user.findUniqueOrThrow({ where: { id: current.id } })) as UserRecord;
    const authUser = this.build(user, membership);
    return { accessToken: await this.sign(authUser), user: authUser };
  }

  private build(user: UserRecord, m: MembershipWithTenant): AuthUser {
    const role = m.role as Role;
    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      tenantId: m.tenantId,
      tenantSlug: m.tenant.slug,
      role,
      permissions: permissionsForRole(role),
    };
  }

  private sign(u: AuthUser): Promise<string> {
    return this.jwt.signAsync({
      sub: u.id,
      email: u.email,
      nome: u.nome,
      tenantId: u.tenantId,
      tenantSlug: u.tenantSlug,
      role: u.role,
      permissions: u.permissions,
    });
  }
}
