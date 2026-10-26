import { CrossSourceComponent } from './cross-source.component';
import { BackendService, CrossReference, CrossSourceResult } from '../../services/backend.service';

describe('CrossSourceComponent', () => {
  let backend: jasmine.SpyObj<BackendService>;
  let component: CrossSourceComponent;
  const reference: CrossReference = {
    type: 'hosts', id: 42, label: 'srv-app', context: 'Produzione',
    confidence: 'potential', reasons: ['Prodotto citato nel servizio']
  };
  const result: CrossSourceResult = {
    source: reference, items: [reference], counts: { hosts: 1, services: 0, sites: 0, cves: 0 },
    total: 1, page: 1, pageSize: 25, totalPages: 1
  };

  beforeEach(() => {
    backend = jasmine.createSpyObj<BackendService>('BackendService', ['getCrossReferences']);
    backend.getCrossReferences.and.resolveTo(result);
    component = new CrossSourceComponent(backend);
    component.sourceType = 'services';
    component.sourceId = 12;
  });

  afterEach(() => component.ngOnDestroy());

  it('loads and filters references through the gateway', async () => {
    component.ngOnChanges();
    await component.load();
    expect(component.result).toEqual(result);
    component.filter('hosts');
    expect(backend.getCrossReferences).toHaveBeenCalledWith('services', 12,
      { target: 'hosts', search: undefined, page: 1 }, jasmine.any(AbortSignal));
  });

  it('explores and returns to the original source', () => {
    component.ngOnChanges();
    component.explore(reference);
    expect(component.currentType).toBe('hosts');
    expect(component.currentId).toBe(42);
    component.reset();
    expect(component.currentType).toBe('services');
    expect(component.currentId).toBe(12);
  });

  it('links to existing pages and popup query parameters', () => {
    expect(component.route(reference)).toEqual(['/machine', 42]);
    expect(component.query(reference)).toEqual({});
    expect(component.route({ ...reference, type: 'cves' })).toEqual(['/cve-analysis']);
    expect(component.query({ ...reference, type: 'cves' })).toEqual({ cveId: 42 });
    expect(component.query({ ...reference, type: 'sites' })).toEqual({ siteId: 42 });
    expect(component.query({ ...reference, type: 'services' })).toEqual({ serviceId: 42 });
  });

  it('ignores a superseded response and aborts its request', async () => {
    let resolveFirst!: (value: CrossSourceResult) => void;
    backend.getCrossReferences.and.returnValues(
      new Promise<CrossSourceResult>(resolve => resolveFirst = resolve),
      Promise.resolve({ ...result, total: 2 })
    );
    component.ngOnChanges();
    const signal = backend.getCrossReferences.calls.first().args[3]!;
    await component.load();
    resolveFirst(result);
    await Promise.resolve();
    expect(signal.aborted).toBeTrue();
    expect(component.result?.total).toBe(2);
  });

  it('shows failures instead of an empty successful result', async () => {
    spyOn(console, 'error');
    backend.getCrossReferences.and.rejectWith(new Error('Unavailable'));
    component.ngOnChanges();
    await component.load();
    expect(component.error).toContain('Impossibile caricare');
    expect(component.result).toBeNull();
    expect(component.loading).toBeFalse();
  });
});
