import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** Componente/Servizio LoginComponent */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  /** Proprietà username */
    username = '';
  /** Proprietà password */
    password = '';
  /** Proprietà isLoading */
    isLoading = false;
  /** Proprietà errorMessage */
    errorMessage = '';

  /** Costruttore di LoginComponent */
    constructor(private readonly auth: AuthService, private readonly router: Router) {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  /** Metodo onSubmit */
    async onSubmit() {
    if (!this.username || !this.password) {
      this.errorMessage = 'Inserisci username e password.';
      return;
    }

    this.errorMessage = '';
    this.isLoading = true;

    try {
      await this.auth.login(this.username, this.password);
      await this.router.navigate(['/dashboard']);
    } catch {
      this.errorMessage = 'Credenziali non valide.';
    } finally {
      this.isLoading = false;
    }
  }
}
