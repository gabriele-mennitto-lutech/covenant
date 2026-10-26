import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BackendService, CrossReference, CrossSourceResult, CrossSourceType } from '../../services/backend.service';

/** Pannello integrabile in schede e popup, con drill-down e paginazione lato server. */
@Component({
  selector: 'app-cross-source',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cross-source.component.html',
  styleUrls: ['./cross-source.component.css']
})
export class CrossSourceComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) sourceType!: CrossSourceType;
  @Input({ required: true }) sourceId!: number;
  @Input() revision: unknown;

  readonly categories: { type: CrossSourceType; label: string }[] = [
    { type: 'hosts', label: 'Host' }, { type: 'services', label: 'Servizi' },
    { type: 'sites', label: 'Sites' }, { type: 'cves', label: 'CVE' }
  ];
  result: CrossSourceResult | null = null;
  target: CrossSourceType | '' = '';
  search = '';
  page = 1;
  loading = false;
  error: string | null = null;
  collapsed = false;
  currentType!: CrossSourceType;
  currentId!: number;
  private request?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly backend: BackendService) {}

  ngOnChanges(): void {
    this.reset();
  }

  ngOnDestroy(): void {
    this.request?.abort();
    clearTimeout(this.timer);
  }

  reset(): void {
    this.explore({ type: this.sourceType, id: this.sourceId });
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  explore(reference: Pick<CrossReference, 'type' | 'id'>): void {
    clearTimeout(this.timer);
    this.currentType = reference.type;
    this.currentId = reference.id;
    this.target = '';
    this.search = '';
    this.page = 1;
    this.result = null;
    this.load();
  }

  filter(target: CrossSourceType | '' = this.target): void {
    clearTimeout(this.timer);
    this.target = target;
    this.page = 1;
    this.load();
  }

  searchChanged(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filter(), 300);
  }

  async load(page = this.page): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.loading = true;
    this.error = null;
    this.page = page;
    try {
      const result = await this.backend.getCrossReferences(this.currentType, this.currentId,
        { target: this.target || undefined, search: this.search || undefined, page }, request.signal);
      if (!request.signal.aborted) this.result = result;
    } catch (error) {
      if (!request.signal.aborted) {
        console.error('Failed to load cross-source references', error);
        this.error = 'Impossibile caricare i riferimenti. Riprova.';
        this.result = null;
      }
    } finally {
      if (!request.signal.aborted) this.loading = false;
    }
  }

  label(type: CrossSourceType): string {
    return this.categories.find(category => category.type === type)!.label;
  }

  route(reference: CrossReference): (string | number)[] {
    return reference.type === 'hosts' ? ['/machine', reference.id]
      : [reference.type === 'cves' ? '/cve-analysis' : `/${reference.type}`];
  }

  query(reference: CrossReference): Record<string, number> {
    if (reference.type === 'hosts') return {};
    const key = reference.type === 'sites' ? 'siteId' : reference.type === 'services' ? 'serviceId' : 'cveId';
    return { [key]: reference.id };
  }
}
