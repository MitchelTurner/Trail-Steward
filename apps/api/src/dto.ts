import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  checklistCreateSchema,
  checklistPatchSchema,
  linkStatuses,
  magicLinkSchema,
  maintainerPatchSchema,
  orgKinds,
  orgWriteSchema,
  pageQuerySchema,
  pathwayWriteSchema,
  resourceWriteSchema,
  roleWriteSchema,
  stepWriteSchema,
  suggestionCreateSchema,
  suggestionResolveSchema,
  suggestionStatuses,
  userPatchSchema,
  userWriteSchema,
  verifySchema,
} from 'shared';

const scope = z.enum(['public', 'manage']).optional();

export class PageQueryDto extends createZodDto(pageQuerySchema) {}
export class OrgListDto extends createZodDto(
  pageQuerySchema.extend({
    kind: z.enum(orgKinds).optional(),
    topic: z.string().optional(),
    community: z.string().optional(),
    scope,
  }),
) {}
export class ResourceListDto extends createZodDto(
  pageQuerySchema.extend({
    kind: z.string().optional(),
    topic: z.string().optional(),
    linkStatus: z.enum(linkStatuses).optional(),
    scope,
  }),
) {}
export class RoleListDto extends createZodDto(
  pageQuerySchema.extend({
    topic: z.string().optional(),
  }),
) {}
export class SuggestionListDto extends createZodDto(
  pageQuerySchema.extend({
    status: z.enum(suggestionStatuses).optional(),
  }),
) {}
export class AuditListDto extends createZodDto(
  pageQuerySchema.extend({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
  }),
) {}
export class OrgWriteDto extends createZodDto(orgWriteSchema) {}
export class OrgPatchDto extends createZodDto(orgWriteSchema.partial()) {}
export class RoleWriteDto extends createZodDto(roleWriteSchema) {}
export class ResourceWriteDto extends createZodDto(resourceWriteSchema) {}
export class PathwayWriteDto extends createZodDto(pathwayWriteSchema) {}
export class StepWriteDto extends createZodDto(stepWriteSchema) {}
export class MaintainerDto extends createZodDto(maintainerPatchSchema) {}
export class ChecklistCreateDto extends createZodDto(checklistCreateSchema) {}
export class ChecklistPatchDto extends createZodDto(checklistPatchSchema) {}
export class SuggestionCreateDto extends createZodDto(suggestionCreateSchema) {}
export class SuggestionResolveDto extends createZodDto(suggestionResolveSchema) {}
export class MagicLinkDto extends createZodDto(magicLinkSchema) {}
export class VerifyDto extends createZodDto(verifySchema) {}
export class UserWriteDto extends createZodDto(userWriteSchema) {}
export class UserPatchDto extends createZodDto(userPatchSchema) {}
