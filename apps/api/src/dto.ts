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
  assetWriteSchema,
  changeRequestCreateSchema,
  changeRequestResolveSchema,
  changeRequestStatuses,
  counterReadingSchema,
  counterWriteSchema,
  issueCreateSchema,
  issueOwnerSchema,
  issueStatuses,
  suggestionCreateSchema,
  suggestionResolveSchema,
  trailWriteSchema,
  suggestionStatuses,
  userPatchSchema,
  userWriteSchema,
  verifySchema,
  workdayWriteSchema,
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
export class TrailListDto extends createZodDto(
  pageQuerySchema.extend({
    scope,
    west: z.coerce.number().optional(),
    south: z.coerce.number().optional(),
    east: z.coerce.number().optional(),
    north: z.coerce.number().optional(),
  }),
) {}
export class TrailWriteDto extends createZodDto(trailWriteSchema) {}
export class TrailPatchDto extends createZodDto(trailWriteSchema.partial()) {}
export class AssetWriteDto extends createZodDto(assetWriteSchema) {}
export class IssueCreateDto extends createZodDto(issueCreateSchema) {}
export class IssueListDto extends createZodDto(
  pageQuerySchema.extend({
    status: z.enum(issueStatuses).optional(),
  }),
) {}
export class IssueOwnerDto extends createZodDto(issueOwnerSchema) {}
export class WorkdayWriteDto extends createZodDto(workdayWriteSchema) {}
export class WorkdayPatchDto extends createZodDto(workdayWriteSchema.partial()) {}
export class ChangeRequestCreateDto extends createZodDto(changeRequestCreateSchema) {}
export class ChangeRequestResolveDto extends createZodDto(changeRequestResolveSchema) {}
export class CounterWriteDto extends createZodDto(counterWriteSchema) {}
export class CounterPatchDto extends createZodDto(counterWriteSchema.partial()) {}
export class CounterReadingDto extends createZodDto(counterReadingSchema) {}
export class ChangeRequestListDto extends createZodDto(
  pageQuerySchema.extend({
    status: z.enum(changeRequestStatuses).optional(),
  }),
) {}
