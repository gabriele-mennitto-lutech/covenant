import type { AppUser } from '../auth/sessionStore';

declare global {
    namespace Express {
        interface Request {
            user?: AppUser;
            authToken?: string;
        }
    }
}

export {};
