import { Controller, Get, Module, Query } from '@nestjs/common';
import { PageQueryDto } from '../dto';
import { publicContent } from '../present';
import { PrismaService } from '../prisma.service';

@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query() query: PageQueryDto) {
    const q = query.q?.trim();
    if (!q) return { topics: [], organizations: [], resources: [] };
    const take = query.pageSize;
    const skip = (query.page - 1) * query.pageSize;
    const [topics, organizations, resources] = await Promise.all([
      this.prisma.topic.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { question: { contains: q, mode: 'insensitive' } },
            { learnings: { some: { heading: { contains: q, mode: 'insensitive' } } } },
            { learnings: { some: { body: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        orderBy: { sortOrder: 'asc' },
        skip,
        take,
        select: { id: true, slug: true, name: true, question: true },
      }),
      this.prisma.organization.findMany({
        where: {
          ...publicContent,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { shortName: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { roles: { some: { roleLabel: { contains: q, mode: 'insensitive' } } } },
            { roles: { some: { needsText: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        orderBy: { name: 'asc' },
        skip,
        take,
        select: { id: true, slug: true, name: true, shortName: true, kind: true },
      }),
      this.prisma.resource.findMany({
        where: {
          AND: [
            { OR: [{ ownerOrgId: null }, { ownerOrg: publicContent }] },
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        orderBy: { title: 'asc' },
        skip,
        take,
        select: { id: true, title: true, url: true, kind: true, linkStatus: true },
      }),
    ]);
    return { topics, organizations, resources };
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
