import { DocumentClassification } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth-user';

export const DOCUMENT_TYPES = [
  'FIR',
  'POLICE_REPORT',
  'REPORT',
  'WITNESS_STATEMENT',
  'CHARGE_SHEET',
  'COURT_FILING',
  'EVIDENCE_RECORD',
  'FORENSIC_REPORT',
  'LEGAL_NOTICE',
  'JUDGMENT',
  'OTHER',
] as const;

const classificationRank: Record<DocumentClassification, number> = {
  INTERNAL: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  HIGHLY_RESTRICTED: 3,
};

const roleClearance: Record<string, DocumentClassification> = {
  ADMIN: DocumentClassification.INTERNAL,
  INVESTIGATOR: DocumentClassification.RESTRICTED,
  SENIOR_OFFICER: DocumentClassification.CONFIDENTIAL,
  DEPARTMENT_HEAD: DocumentClassification.HIGHLY_RESTRICTED,
  AUDITOR: DocumentClassification.CONFIDENTIAL,
};

export function canAccessClassification(user: AuthenticatedUser, classification: DocumentClassification) {
  const clearance = roleClearance[user.role] ?? DocumentClassification.INTERNAL;
  return classificationRank[clearance] >= classificationRank[classification];
}

export function maximumClassification(user: AuthenticatedUser) {
  return roleClearance[user.role] ?? DocumentClassification.INTERNAL;
}

export function allowedClassifications(user: AuthenticatedUser) {
  const maximum = classificationRank[maximumClassification(user)];
  return Object.values(DocumentClassification).filter((classification) => classificationRank[classification] <= maximum);
}
