import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    firebaseId: string; // The authenticated user's Firebase ID
    role: 'user' | 'agent';
  };
}