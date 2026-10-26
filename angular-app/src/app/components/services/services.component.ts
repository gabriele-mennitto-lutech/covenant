import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BackendService, Service } from '../../services/backend.service';
import { AuthService } from '../../services/auth.service';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SearchFieldComponent } from '../search-field/search-field.component';
import { DialogModule } from 'primeng/dialog';
import { CrossSourceComponent } from '../cross-source/cross-source.component';

/** Componente/Servizio ServicesComponent */
@Component({
  selector: 'app-services',
  standalone: true,
  imports: [
    CommonModule, FormsModule, InputTextModule,
    SearchFieldComponent, DialogModule, TagModule, CrossSourceComponent
  ],
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.css']
})
export class ServicesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  linkError: string | null = null;
  /** Proprietà services */
    services: Service[] = [];
  /** Proprietà searchQuery */
    searchQuery: string = '';
  /** Proprietà knowledgeFilter */
    knowledgeFilter: string | null = null;
  /** Proprietà isLoading */
    isLoading = true;
  
  /** Proprietà displayDialog */
    displayDialog: boolean = false;
  /** Proprietà selectedService */
    selectedService: Service | null = null;
  /** Proprietà editMode */
    editMode: boolean = false;
  
  /** Proprietà formData */
    formData: Partial<Service> = {
    servizio: '',
    knowledge: '',
    stato: ''
  };

  /** Proprietà knowledgeOptions */
    readonly knowledgeOptions = [
    { label: 'All', value: null },
    { label: 'Full', value: 'Full' },
    { label: 'Limited', value: 'Limited' },
    { label: 'Absent', value: 'Absent' }
  ];

  /** Costruttore di ServicesComponent */
    constructor(private readonly backend: BackendService, private readonly auth: AuthService,
      private readonly route: ActivatedRoute, private readonly router: Router) { }

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit(): void {
    this.loadData();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async params => {
      const id = Number(params.get('serviceId'));
      this.linkError = null;
      if (!Number.isSafeInteger(id) || id <= 0) {
        if (!this.editMode) this.displayDialog = false;
        return;
      }
      if (this.selectedService?.id === id && this.displayDialog) return;
      try {
        const service = await this.backend.getService(id);
        if (Number(this.route.snapshot.queryParamMap.get('serviceId')) === id) {
          this.selectedService = service;
          this.editMode = false;
          this.displayDialog = true;
        }
      } catch (error) {
        if (Number(this.route.snapshot.queryParamMap.get('serviceId')) !== id) return;
        console.error('Failed to open linked service', error);
        this.linkError = 'Impossibile aprire il servizio collegato.';
      }
    });
  }

  /** Metodo loadData */
    async loadData() {
    this.isLoading = true;
    try {
      const response = await this.backend.getServices(
        this.searchQuery, 
        this.knowledgeFilter || undefined, 
        1, 
        1000
      );
      console.log('Services API response:', response);
      this.services = response.items || [];
    } catch (err) {
      console.error("Error loading services", err);
    } finally {
      this.isLoading = false;
    }
  }

  /** Metodo onSearchChange */
    onSearchChange() {
    this.loadData();
  }

  /** Metodo setKnowledgeFilter */
    setKnowledgeFilter(value: string | null) {
    this.knowledgeFilter = value;
    this.loadData();
  }

  /** Metodo showDetails */
    showDetails(service: Service) {
    this.selectedService = service;
    this.editMode = false;
    this.displayDialog = true;
    this.router.navigate([], { relativeTo: this.route, queryParams: { serviceId: service.id }, queryParamsHandling: 'merge' });
  }

  closeDetails(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { serviceId: null }, queryParamsHandling: 'merge' });
  }

  /** Metodo openCreateDialog */
    openCreateDialog() {
    this.selectedService = null;
    this.editMode = true;
    this.formData = {
      servizio: '',
      knowledge: '',
      stato: ''
    };
    this.displayDialog = true;
  }

  /** Metodo openEditDialog */
    openEditDialog() {
    if (!this.selectedService) return;
    this.editMode = true;
    this.formData = {
      servizio: this.selectedService.servizio,
      knowledge: this.selectedService.knowledge,
      stato: this.selectedService.stato
    };
  }

  /** Metodo saveService */
    async saveService() {
    if (!this.formData.servizio || !this.formData.knowledge) {
      alert("Il nome del servizio e il grado di knowledge sono obbligatori.");
      return;
    }

    try {
      if (this.selectedService?.id) {
        // Edit mode
        await this.backend.updateService(this.selectedService.id, this.formData);
      } else {
        // Create mode
        await this.backend.createService(this.formData);
      }
      this.displayDialog = false;
      this.loadData(); // Refresh list
    } catch (err) {
      console.error("Error saving service:", err);
      alert("Errore durante il salvataggio del servizio.");
    }
  }
}
