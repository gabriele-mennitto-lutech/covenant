import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SitesComponent } from './components/sites/sites.component';
import { HostsComponent } from './components/hosts/hosts.component';
import { FixesComponent } from './components/fixes/fixes.component';
import { MailingComponent } from './components/mailing/mailing.component';
import { SettingsComponent } from './components/settings/settings.component';
import { MachineComponent } from './components/machine/machine.component';
import { CveAnalysisComponent } from './components/cve-analysis/cve-analysis.component';
import { LoginComponent } from './components/login/login.component';
import { ServicesComponent } from './components/services/services.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'services', component: ServicesComponent, canActivate: [authGuard] },
  { path: 'sites', component: SitesComponent, canActivate: [authGuard] },
  { path: 'hosts', component: HostsComponent, canActivate: [authGuard] },
  { path: 'fixes', component: FixesComponent, canActivate: [authGuard] },
  { path: 'mailing', component: MailingComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: 'cve-analysis', component: CveAnalysisComponent, canActivate: [authGuard] },
  // Risolve hostname (+ ambiente) nell'id e reindirizza a /machine/:id (usato da link che conoscono solo il nome, es. siti)
  { path: 'machine/by-name', component: MachineComponent, canActivate: [authGuard], data: { resolveByName: true } },
  { path: 'machine/:id', component: MachineComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' }
];
