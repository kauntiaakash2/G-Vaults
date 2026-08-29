import type { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
};

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
