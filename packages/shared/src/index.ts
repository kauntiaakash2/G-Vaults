export const ROLE_CODES = [
  'ADMIN',
  'INVESTIGATOR',
  'SENIOR_OFFICER',
  'DEPARTMENT_HEAD',
  'AUDITOR',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  departmentId: string | null;
  departmentName?: string | null;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export type CaseSummary = {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: string;
  department: { id: string; name: string; code: string };
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type DocumentVersionSummary = {
  id: string;
  versionNumber: number;
  sha256Hash: string;
  fileSize: number;
  mimeType: string;
  originalFilename: string;
  changeDescription: string | null;
  createdAt: string;
  creator?: { id: string; name: string };
};

export type DocumentSummary = {
  id: string;
  caseId: string;
  title: string;
  documentType: string;
  encryption: 'AES-256-GCM';
  currentVersion: DocumentVersionSummary | null;
  case: { id: string; caseNumber: string; title: string };
  ownerDepartment: { id: string; name: string; code: string };
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  capabilities?: {
    view: boolean;
    download: boolean;
    edit: boolean;
    share: boolean;
    approve: boolean;
  };
};
