import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import axios from 'axios';
import { BehaviorSubject } from 'rxjs';

export type AppRole = 'admin' | 'readonly';

/** Interfaccia AuthUser */
export interface AuthUser {
  /** Proprietà username */
    username: string;
  /** Proprietà role */
    role: AppRole;
  /** Proprietà canWrite */
    canWrite: boolean;
}

/** Interfaccia LoginResponse */
interface LoginResponse {
  /** Proprietà token */
    token: string;
  /** Proprietà expiresAt */
    expiresAt: number;
  /** Proprietà user */
    user: AuthUser;
}

const TOKEN_KEY = 'covenant_auth_token';
const USER_KEY = 'covenant_auth_user';

/** Componente/Servizio AuthService */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /** Proprietà interceptorInstalled */
    private static interceptorInstalled = false;

  /** Proprietà currentUserSubject */
    private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  /** Proprietà currentUser$ */
    readonly currentUser$ = this.currentUserSubject.asObservable();

  /** Costruttore di AuthService */
    constructor(private readonly router: Router) {
    this.restoreSession();
    this.installUnauthorizedInterceptor();
  }

  /** Metodo installUnauthorizedInterceptor */
    private installUnauthorizedInterceptor() {
    if (AuthService.interceptorInstalled) return;

    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error?.response?.status === 401) {
          this.clearSession(false);
          await this.router.navigate(['/login']);
        }
        throw error;
      }
    );

    AuthService.interceptorInstalled = true;
  }

  /** Metodo restoreSession */
    private restoreSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);

    if (!token || !userRaw) return;

    try {
      const user = JSON.parse(userRaw) as AuthUser;
      this.currentUserSubject.next(user);
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } catch {
      this.clearSession(false);
    }
  }

  /** Metodo login */
    async login(username: string, password: string): Promise<void> {
    const normalizedUsername = username.trim().toUpperCase();
    const response = await axios.post<LoginResponse>('/api/auth/login', {
      username: normalizedUsername,
      password
    });

    const { token, user } = response.data;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    this.currentUserSubject.next(user);
  }

  /** Metodo logout */
    async logout(redirectToLogin = true): Promise<void> {
    try {
      if (this.isAuthenticated()) {
        await axios.post('/api/auth/logout');
      }
    } catch {
      // Ignore logout request failures and clear session locally anyway.
    }

    this.clearSession(redirectToLogin);
  }

  /** Metodo clearSession */
    clearSession(redirectToLogin = false) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete axios.defaults.headers.common.Authorization;
    this.currentUserSubject.next(null);

    if (redirectToLogin) {
      this.router.navigate(['/login']);
    }
  }

  /** Metodo isAuthenticated */
    isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  /** Metodo canWrite */
    canWrite(): boolean {
    return this.currentUserSubject.value?.canWrite === true;
  }

  /** Metodo getCurrentUser */
    getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }
}
