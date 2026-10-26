import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BackendService, Site } from '../../services/backend.service';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { FieldsetModule } from 'primeng/fieldset';
import { DropdownModule } from 'primeng/dropdown';
import { ChipsModule } from 'primeng/chips';
import { MainpageComponent } from '../mainpage/mainpage.component';
import { SiteCardComponent } from './site-card/site-card.component';
import { SearchFieldComponent } from '../search-field/search-field.component';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { AuthService } from '../../services/auth.service';
import { ImportDialogComponent } from '../import-dialog/import-dialog.component';
import { CrossSourceComponent } from '../cross-source/cross-source.component';

/** Componente/Servizio SitesComponent */
@Component({
  selector: 'app-sites',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, TagModule, InputTextModule, 
    DialogModule, DividerModule, FieldsetModule, DropdownModule, ChipsModule,
    MainpageComponent, SiteCardComponent, SearchFieldComponent,
    ConfirmDialogModule, ImportDialogComponent, CrossSourceComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './sites.component.html',
  styleUrls: ['./sites.component.css']
})
export class SitesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  /** Proprietà sites */
    sites: Site[] = [];
  /** Proprietà searchQuery */
    searchQuery: string = '';
  /** Proprietà ambienteFilter */
    ambienteFilter: string | null = null;
  /** Proprietà isLoading */
    isLoading = true;

  /** Proprietà displayDialog */
    displayDialog: boolean = false;
  /** Proprietà selectedSite */
    selectedSite: Site | null = null;

  /** Proprietà displayImportDialog */
    displayImportDialog: boolean = false;
  /** Proprietà displayAddDialog */
    displayAddDialog: boolean = false;
  /** Proprietà isEditMode */
    isEditMode: boolean = false;
  /** Proprietà editingSite */
    editingSite: Partial<Site> = {
    hostReali: []
  };
  /** Proprietà tlsOptions */
    tlsOptions = [
    { label: 'PASSTHROUGH', value: 'PASSTHROUGH' },
    { label: 'EDGE', value: 'EDGE' },
    { label: 'RE-ENCRYPT', value: 'RE-ENCRYPT' }
  ];
  /** Proprietà ambienteOptions */
    ambienteOptions = [
    { label: 'Sviluppo', value: 'Sviluppo' },
    { label: 'Collaudo', value: 'Collaudo' },
    { label: 'Produzione', value: 'Produzione' }
  ];

  /** Costruttore di SitesComponent */
    constructor(
    private readonly backend: BackendService, 
    private readonly confirmationService: ConfirmationService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly auth: AuthService
  ) {}

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit(): void {
    this.backend.getSites().then(res => {
      this.sites = res.items;
      this.isLoading = false;
      
      this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
        if (params['siteId']) {
          const site = this.sites.find(s => s.id === Number.parseInt(params['siteId'], 10));
          if (site) {
            this.selectedSite = site;
            this.displayDialog = true;
          }
        } else {
          this.displayDialog = false;
          // non resettare selectedSite istantaneamente altrimenti c'è un glitch visivo mentre l'animazione di chiusura va
        }
      });
    }).catch(err => {
      console.error("Failed to load sites", err);
      this.isLoading = false;
    });
  }

  /** Metodo openImportDialog */
    openImportDialog() {
    if (!this.canWrite) return;
    this.displayImportDialog = true;
  }

  /** Metodo onSitesImported: ricarica i siti dopo un import */
    onSitesImported() {
    this.backend.getSites().then(res => {
      this.sites = res.items;
    }).catch(err => console.error("Failed to reload sites", err));
  }

  /** Metodo confirmDeleteSite */
    confirmDeleteSite(event: Event) {
    if (!this.canWrite) return;
    if (!this.selectedSite) return;
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: 'Are you sure you want to delete this site? This action cannot be undone.',
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: "btn-primary rounded-btn",
      rejectButtonStyleClass: "btn-secondary rounded-btn",
      acceptLabel: "Delete",
      rejectLabel: "Cancel",
      acceptIcon: "pi pi-trash",
      rejectIcon: "none",
      accept: () => {
        if (this.selectedSite?.id) {
          this.backend.deleteSite(this.selectedSite.id).then(() => {
            this.sites = this.sites.filter(s => s.id !== this.selectedSite!.id);
            this.closeDialog(); // triggers URL cleanup
          }).catch(err => {
            console.error("Failed to delete site", err);
          });
        }
      },
      reject: () => {
        // Do nothing
      }
    });
  }
  get filteredSites(): Site[] {
    let result = this.sites;
    if (this.ambienteFilter) {
      result = result.filter(s => s.ambiente === this.ambienteFilter);
    }
    if (!this.searchQuery) return result;
    const lowerQ = this.searchQuery.toLowerCase();
    return result.filter(site => 
      site.urlAliases.toLowerCase().includes(lowerQ) ||
      site.ipVip.toLowerCase().includes(lowerQ) ||
      site.nomeBilanciatore.toLowerCase().includes(lowerQ) ||
      site.servizio.toLowerCase().includes(lowerQ) ||
      (site.hostReali?.some(h => h.toLowerCase().includes(lowerQ)))
    );
  }

  /** Metodo setAmbienteFilter */
    setAmbienteFilter(ambiente: string | null) {
    this.ambienteFilter = this.ambienteFilter === ambiente ? null : ambiente;
  }

  /** Metodo getTlsSeverity */
    getTlsSeverity(tls: string): 'success' | 'warning' | 'danger' | 'info' {
    if (tls === 'PASSTHROUGH') return 'success';
    if (tls === 'EDGE') return 'warning';
    if (tls === 'RE-ENCRYPT') return 'info';
    return 'success';
  }

  /** Metodo openDialog */
    openDialog(site: Site) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { siteId: site.id }, queryParamsHandling: 'merge' });
  }

  /** Metodo closeDialog */
    closeDialog() {
    const siteId = this.selectedSite?.id;
    this.router.navigate([], { relativeTo: this.route, queryParams: { siteId: null }, queryParamsHandling: 'merge' });
    setTimeout(() => {
      if (!this.displayDialog && this.selectedSite?.id === siteId) this.selectedSite = null;
    }, 200);
  }

  /** Metodo openEditDialog */
    openEditDialog(site?: Site) {
    if (!this.canWrite) return;
    if (site) {
      this.isEditMode = true;
      this.editingSite = { ...site, hostReali: site.hostReali ? [...site.hostReali] : [] };
    } else {
      this.isEditMode = false;
      this.editingSite = {
        tls: 'EDGE',
        hostReali: [],
        ambiente: 'Sviluppo'
      };
    }
    this.displayAddDialog = true;
    this.displayDialog = false; // close the view dialog if open
  }

  /** Metodo closeAddDialog */
    closeAddDialog() {
    this.displayAddDialog = false;
  }

  /** Metodo saveSite */
    saveSite() {
    if (!this.canWrite) return;
    if (!this.editingSite.urlAliases || !this.editingSite.ambiente) return;
    
    if (this.isEditMode && this.editingSite.id) {
      this.backend.updateSite(this.editingSite.id, this.editingSite as Site).then((updatedSite) => {
        const index = this.sites.findIndex(s => s.id === updatedSite.id);
        if (index !== -1) {
          this.sites[index] = updatedSite;
        }
        this.closeAddDialog();
      }).catch(err => {
        console.error("Failed to update site", err);
      });
    } else {
      // Logic for adding new site
      this.backend.createSite(this.editingSite as Site).then((newSite) => {
        this.sites.unshift(newSite);
        this.closeAddDialog();
      }).catch(err => {
        console.error("Failed to create site", err);
      });
    }
  }

  /** Metodo copyToClipboard */
    copyToClipboard(url: string, event: Event) {
    if (event) event.stopPropagation();
    const fullUrl = `https://${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      console.log('Copied to clipboard:', fullUrl);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  }
}
