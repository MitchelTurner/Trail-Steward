import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { publicContent, reviewFields } from '../present';
import { PrismaService } from '../prisma.service';

@Controller('topics')
export class TopicsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const topics = await this.prisma.topic.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        roles: {
          where: {
            hasRole: true,
            isDocumented: true,
            status: 'PUBLISHED',
            organization: publicContent,
          },
          select: { id: true },
        },
      },
    });
    return topics.map((topic) => ({
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      question: topic.question,
      sortOrder: topic.sortOrder,
      documentedPlayerCount: topic.roles.length,
    }));
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        learnings: { orderBy: { sortOrder: 'asc' } },
        roleTypes: { orderBy: { sortOrder: 'asc' } },
        roles: {
          where: { status: 'PUBLISHED', organization: publicContent },
          include: {
            organization: true,
            maintainer: true,
            resources: { orderBy: { title: 'asc' } },
          },
        },
      },
    });
    if (!topic) throw new NotFoundException('Topic not found.');
    const rank = (role: (typeof topic.roles)[number]) =>
      !role.isDocumented ? 1 : !role.hasRole ? 2 : 0;
    const roles = [...topic.roles].sort(
      (a, b) => rank(a) - rank(b) || a.organization.name.localeCompare(b.organization.name),
    );
    const present = (role: (typeof roles)[number]) => ({
      id: role.id,
      roleLabel: role.roleLabel,
      roleTypeNames: role.roleTypeNames,
      roleQualifier: role.roleQualifier,
      isDocumented: role.isDocumented,
      hasRole: role.hasRole,
      resourcesText: role.resourcesText,
      needsText: role.needsText,
      ...reviewFields(role, role.maintainer, false),
      organization: {
        slug: role.organization.slug,
        name: role.organization.name,
        shortName: role.organization.shortName,
        kind: role.organization.kind,
        websiteUrl: role.organization.websiteUrl,
      },
      resources: role.resources.map((resource) => ({
        id: resource.id,
        title: resource.title,
        url: resource.url,
        kind: resource.kind,
        linkStatus: resource.linkStatus,
        linkFinalUrl: resource.linkFinalUrl,
      })),
    });
    return {
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      question: topic.question,
      sortOrder: topic.sortOrder,
      learnings: topic.learnings.map((learning) => ({
        id: learning.id,
        heading: learning.heading,
        body: learning.body,
        sortOrder: learning.sortOrder,
      })),
      roleTypes: topic.roleTypes.map((roleType) => ({
        id: roleType.id,
        name: roleType.name,
        definition: roleType.definition,
        sortOrder: roleType.sortOrder,
      })),
      players: {
        documented: roles.filter((role) => role.isDocumented && role.hasRole).map(present),
        notDocumented: roles.filter((role) => !role.isDocumented).map(present),
        noRole: roles.filter((role) => role.isDocumented && !role.hasRole).map(present),
      },
    };
  }
}

@Module({ controllers: [TopicsController] })
export class TopicsModule {}
