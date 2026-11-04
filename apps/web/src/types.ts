import type { Freshness } from 'shared';

export type Maintainer = { name: string | null; id?: string; email?: string } | null;

export type ReviewBits = {
  reviewedAt: string | null;
  reviewIntervalDays: number;
  freshness: Freshness;
  maintainer: Maintainer;
};

export type TopicSummary = {
  id: string;
  slug: string;
  name: string;
  question: string;
  sortOrder: number;
  documentedPlayerCount: number;
};

export type ResourceLink = {
  id: string;
  title: string;
  url: string;
  kind: string;
  linkStatus: string;
  linkFinalUrl?: string | null;
};

export type PlayerRow = {
  id: string;
  roleLabel: string;
  roleTypeNames: string[];
  roleQualifier: string | null;
  isDocumented: boolean;
  hasRole: boolean;
  resourcesText: string | null;
  needsText: string | null;
  organization: {
    slug: string;
    name: string;
    shortName: string | null;
    kind: string;
    websiteUrl: string | null;
  };
  resources: ResourceLink[];
} & ReviewBits;

export type TopicDetail = {
  id: string;
  slug: string;
  name: string;
  question: string;
  learnings: { id: string; heading: string; body: string }[];
  roleTypes: { id: string; name: string; definition: string }[];
  players: { documented: PlayerRow[]; notDocumented: PlayerRow[]; noRole: PlayerRow[] };
};

export type OrgListItem = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  kind: string;
  websiteUrl: string | null;
  description: string | null;
  communities: string[];
  isGroup: boolean;
  visibility: string;
  status: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
} & ReviewBits;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type OrgDetail = OrgListItem & {
  rolesByTopic: {
    topicSlug: string;
    topicName: string;
    roleLabel: string | null;
    hasRole: boolean | null;
    isDocumented: boolean | null;
    resourcesText: string | null;
    needsText: string | null;
    freshness: Freshness | null;
  }[];
  resources: ResourceLink[];
};

export type Question =
  | { id: string; type: 'select-or-text'; label: string; options: string[] }
  | {
      id: string;
      type: 'multi' | 'single';
      label: string;
      options: { value: string; label: string }[];
    };

export type PathwayOutline = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  questions: Question[];
  steps: {
    id: string;
    key: string;
    sortOrder: number;
    title: string;
    why?: string;
    howTo?: string;
    examples?: string | null;
    topicSlugs: string[];
    prerequisiteKeys: string[];
    showIf?: unknown;
    contactQuery?: unknown;
    resources?: ResourceLink[];
  }[];
} & ReviewBits;

export type ChecklistStep = {
  key: string;
  title: string;
  why: string;
  howTo: string;
  examples: string | null;
  topicSlugs: string[];
  done: boolean;
  note: string;
  doneAt: string | null;
  resources: ResourceLink[];
  contacts: {
    name: string;
    shortName: string | null;
    websiteUrl: string | null;
    roleLabel: string;
  }[];
};

export type ChecklistView = {
  id: string;
  title: string;
  community: string | null;
  pathway: { slug: string; title: string; summary: string; version: number };
  answers: Record<string, unknown>;
  answerLabels: { label: string; value: string }[];
  progress: { done: number; total: number };
  steps: ChecklistStep[];
  updatedAt: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'EDITOR' | 'COORDINATOR' | 'ADMIN';
  organizationId: string | null;
  organization: { id: string; name: string; slug: string } | null;
};

export type SuggestionRow = {
  id: string;
  targetType: string;
  targetId: string | null;
  message: string;
  proposedUrl: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
};

export type Dashboard = {
  sections: {
    key: string;
    title: string;
    counts: { stale: number; due: number; neverReviewed: number; unassigned: number };
    items: {
      entityType: string;
      id: string;
      label: string;
      freshness: Freshness;
      maintainerId: string | null;
      maintainerName: string | null;
      linkStatus?: string;
    }[];
  }[];
  brokenLinks: { id: string; label: string; url: string; maintainerName: string | null }[];
  metrics: {
    checklistsCreated: number;
    checklistsByCommunity: { community: string; count: number }[];
    pdfDownloads: number;
    stepsCompleted: number;
  };
};
