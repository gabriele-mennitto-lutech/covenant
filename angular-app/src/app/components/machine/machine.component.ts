import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BackendService, Host } from '../../services/backend.service';
import { AuthService } from '../../services/auth.service';
import { CrossSourceComponent } from '../cross-source/cross-source.component';

/** Dettaglio host Windows con modifica inline e dati di rete persistiti nel DB. */
@Component({
  selector: 'app-machine',
  standalone: true,
  imports: [CommonModule, FormsModule, CrossSourceComponent],
  templateUrl: './machine.component.html',
  styleUrls: ['./machine.component.css']
})
export class MachineComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  /** Proprietà hostname */
    hostname: string | null = null;
  /** Proprietà ambiente */
    ambiente: string | null = null;
  /** Proprietà host */
    host: Host | undefined = undefined;
  /** Proprietà isLoading */
    isLoading = true;
  /** Proprietà editingField */
    editingField: string | null = null;
  /** Proprietà editValue */
    editValue = '';
  /** Proprietà isNewMode */
    isNewMode = false;
  /** Proprietà showSuccessPopup */
    showSuccessPopup = false;
  /** Proprietà creationError */
    creationError: string | null = null;
  /** Proprietà infoSource */
    infoSource: string = '';
  /** Proprietà networkSource */
    networkSource: string = '';

  /** Costruttore di MachineComponent */
    constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly backend: BackendService,
    private readonly location: Location,
    public readonly auth: AuthService
  ) {}

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  getFieldValue(field: keyof Host): Host[keyof Host] {
    const value = this.host?.[field];
    return value === '' ? '-' : value ?? '-';
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadRoute());
  }

  private loadRoute() {
    this.host = undefined;
    this.isLoading = true;
    this.isNewMode = false;
    this.editingField = null;
    this.hostname = null;
    this.ambiente = null;
    this.networkSource = '';
    const id = this.route.snapshot.paramMap.get('id');
    if (id === 'new') {
      if (!this.canWrite) {
        this.router.navigate(['/hosts']);
        return;
      }
        this.isNewMode = true;
        this.host = {
            hostname: '',
            applicazione: null,
            riferimento: null,
            ambiente: 'Sviluppo',
            company: 'RAI',
            servizio: null,
            appliance: false,
            zona: 'Intranet',
            riferimentoEs: null,
            locazione: null,
            os: 'Windows Server 2022',
            manutenzione: null,
            status: true,
            fixed: false,
            fixable: true,
            divisione: null,
            nodo: 0,
            note: null,
            pianificazione: null,
            rfc: null
        } as unknown as Host; // Using unknown cast to avoid strict null checking issues if interface has extra optional fields
        this.ambiente = this.host.ambiente;
        this.isLoading = false;
        this.infoSource = 'Manuale (Nuova)';
    } else if (this.route.snapshot.data['resolveByName']) {
      this.resolveByName();
    } else if (id) {
      const hostId = Number(id);
      if (!Number.isSafeInteger(hostId) || hostId <= 0) {
        this.isLoading = false;
        return;
      }
      this.loadHost(hostId);
    } else {
      this.isLoading = false;
    }
  }

  /** Carica l'host per id (chiave primaria) */
    private loadHost(hostId: number) {
    this.backend.getHost(hostId).then(host => {
      if (Number(this.route.snapshot.paramMap.get('id')) !== hostId) return;
      this.host = host;
      this.hostname = host.hostname;
      this.ambiente = host.ambiente;
      this.isLoading = false;
      this.infoSource = 'DB';
      this.networkSource = 'DB';
    }).catch(err => {
      if (Number(this.route.snapshot.paramMap.get('id')) !== hostId) return;
      console.error(err);
      this.isLoading = false;
    });
  }

  /**
   * Risolve hostname (+ ambiente) nell'id tramite il back-end (che delega al dataservice)
   * e reindirizza alla pagina canonica /machine/:id. Usato dai link che conoscono solo il nome macchina (es. siti).
   */
    private resolveByName() {
    const query = this.route.snapshot.queryParamMap;
    const hostname = query.get('hostname');
    if (!hostname) {
      this.isLoading = false;
      return;
    }
    const ambiente = query.get('ambiente');
    this.backend.resolveHost(hostname, ambiente)
      // Se l'ambiente indicato non corrisponde (es. sito con ambiente diverso), ripiega sul solo hostname
      .catch(err => ambiente && err?.response?.status === 404 ? this.backend.resolveHost(hostname) : Promise.reject(err))
      .then(res => {
      this.router.navigate(['/machine', res.id], { replaceUrl: true });
    }).catch(err => {
      console.error(err);
      this.isLoading = false;
    });
  }

  /** Metodo startEdit */
    startEdit(field: keyof Host) {
    if (!this.canWrite) return;
    if (!this.host) return;
    this.editingField = field;
    this.editValue = this.host[field] as string;
  }

  private async saveEditToBackend(field: keyof Host, oldValue: any) {
    try {
      const updatedHost = await this.backend.updateHost(this.host!.id, { [field]: this.editValue });
      if (updatedHost) {
        this.host = updatedHost;
      }
    } catch (e) {
      console.error(e);
      (this.host as any)[field] = oldValue;
    }
  }

  /** Metodo saveEdit */
    async saveEdit() {
    if (!this.canWrite) return;
    if (!this.host || !this.editingField || !this.ambiente) return;
    const field = this.editingField as keyof Host;
    const oldValue = this.host[field];
    this.editingField = null;
    
    if (this.editValue === this.host[field]) return;

    if (this.isNewMode) {
      (this.host as any)[field] = this.editValue;
    } else {
      await this.saveEditToBackend(field, oldValue);
    }
  }

  /** Metodo toggleAppliance */
    async toggleAppliance() {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const newAppliance = !this.host.appliance;
    if (this.isNewMode) {
        this.host.appliance = newAppliance;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { appliance: newAppliance });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo toggleFixed */
    async toggleFixed() {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const newFixed = !this.host.fixed;
    if (this.isNewMode) {
        this.host.fixed = newFixed;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { fixed: newFixed });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo toggleFixable */
    async toggleFixable() {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const newFixable = !this.host.fixable;
    if (this.isNewMode) {
        this.host.fixable = newFixable;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { fixable: newFixable });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo setAmbiente */
    async setAmbiente(env: string) {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    if (this.isNewMode) {
        this.host.ambiente = env;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { ambiente: env });
        if (updatedHost) {
            this.host = updatedHost;
            this.ambiente = env;
        }
    }
  }

  /** Proprietà osFamily */
    osFamily: string = '';
  /** Proprietà osVersion */
    osVersion: string = '';
    customOsVersion = '';
    readonly clientVersions = ['Windows 10', 'Windows 11'];
    readonly serverVersions = [
      'Windows Server 2016', 'Windows Server 2019', 'Windows Server 2022', 'Windows Server 2025'
    ];

  /** Proprietà divisioni */
    readonly divisioni = [
    'NO',
    'EOL',
    'Manuale',
    'Manuale NOC',
    'Scheduled-Dispari',
    'Scheduled-Pari'
  ];

  private toLower(value: string | null | undefined): string {
    return (value || '').toLowerCase();
  }

  private findOsVersion(target: string, candidates: string[]): string | undefined {
    return candidates.find(version => target === version.toLowerCase());
  }

  /** Metodo getEnvClass */
    getEnvClass(env: string) {
    const e = env.toLowerCase();
    if (['sviluppo', 'collaudo', 'produzione', 'dismessa'].includes(e)) {
      return `env-${e}`;
    }
    return 'env-default';
  }

  /** Metodo startEditOS */
    startEditOS() {
    if (!this.canWrite) return;
    if (!this.host) return;
    this.editingField = 'os';
     const osLower = this.toLower(this.host.os);
    const client = this.findOsVersion(osLower, this.clientVersions);
    const server = this.findOsVersion(osLower, this.serverVersions);
    this.osFamily = client ? 'Windows' : server ? 'Windows Server' : 'custom';
    this.osVersion = client || server || '';
    this.customOsVersion = this.host.os || '';
  }

  /** Metodo onFamilyChange */
    onFamilyChange() {
    this.osVersion = this.osFamily === 'Windows Server' ? 'Windows Server 2022' : 'Windows 11';
    if (this.osFamily === 'custom') this.customOsVersion = this.host?.os || '';
  }

  /** Metodo saveOS */
    async saveOS() {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const finalOs = (this.osFamily === 'custom' ? this.customOsVersion : this.osVersion).trim();
    const versions = this.osFamily === 'Windows Server' ? this.serverVersions : this.clientVersions;
    if (!finalOs || (this.osFamily !== 'custom' && !versions.includes(finalOs))) return;

    if (this.isNewMode) {
        this.host.os = finalOs.trim();
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { os: finalOs.trim() });
        if (updatedHost) this.host = updatedHost;
    }
    this.editingField = null;
  }

  /** Metodo cancelEditOS */
    cancelEditOS() {
    this.editingField = null;
  }

  /** Metodo setNodo */
    async setNodo(val: string) {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const nodoStr = val === 'Standalone' ? '0' : val.replace('Nodo ', '');
    const nodo = Number.parseInt(nodoStr, 10) || 0;
    if (this.isNewMode) {
        this.host.nodo = nodo;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { nodo });
        if (updatedHost) {
            this.host = updatedHost;
        }
    }
  }

  /** Metodo isNodoActive */
    isNodoActive(n: string): boolean {
    if (!this.host) return false;
    const nodoStr = n === 'Standalone' ? '0' : n.replace('Nodo ', '');
      const nodoVal = Number.parseInt(nodoStr, 10) || 0;
    return this.host.nodo === nodoVal;
  }

  /** Metodo setLocazione */
    async setLocazione(val: string) {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    if (this.isNewMode) {
        this.host.locazione = val;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { locazione: val });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo isLocazioneActive */
    isLocazioneActive(val: string): boolean {
    if (!this.host) return false;
    return this.host.locazione === val;
  }

  /** Metodo setZona */
    async setZona(val: string) {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    if (this.isNewMode) {
        this.host.zona = val;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { zona: val });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo isZonaActive */
    isZonaActive(val: string): boolean {
    if (!this.host) return false;
    return this.host.zona === val;
  }

  /** Metodo toggleCompagnia */
    async toggleCompagnia() {
    if (!this.canWrite || !this.ambiente) return;
    if (!this.host) return;
    const newCompagnia = this.host.company === 'RAI' ? 'RAI PUBBLICITA\'' : 'RAI';
    if (this.isNewMode) {
        this.host.company = newCompagnia;
    } else {
        const updatedHost = await this.backend.updateHost(this.host.id, { company: newCompagnia });
        if (updatedHost) this.host = updatedHost;
    }
  }

  /** Metodo submitNewHost */
    async submitNewHost() {
      if (!this.canWrite) return;
      if (!this.host) return;
      this.creationError = null;
      if (!this.host.hostname) {
          this.creationError = 'Hostname è obbligatorio.';
          return;
      }
      if (!this.host.ambiente) {
          this.creationError = 'Ambiente è obbligatorio.';
          return;
      }
      
      this.host.hostname = this.host.hostname.trim();
      
      try {
          const created = await this.backend.createHost(this.host);
          
          this.showSuccessPopup = true;
          setTimeout(() => {
              this.isNewMode = false;
              this.editingField = null;
              this.host = created;
              this.hostname = created.hostname;
              this.ambiente = created.ambiente;
              
              setTimeout(() => {
                  this.router.navigate(['/machine', created.id], { replaceUrl: true });
              }, 1500);
          }, 2000);
          
      } catch (err: any) {
          console.error(err);
          this.creationError = err.response?.data?.error || 'Errore durante la creazione della macchina.';
      }
  }

  /** Metodo goBack */
    goBack() {
    this.location.back();
  }

}
