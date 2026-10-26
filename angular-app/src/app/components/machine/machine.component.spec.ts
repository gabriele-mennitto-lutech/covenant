import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BackendService, Host } from '../../services/backend.service';
import { MachineComponent } from './machine.component';
import { of } from 'rxjs';

describe('MachineComponent host detail', () => {
  let fixture: ComponentFixture<MachineComponent>;
  let backend: jasmine.SpyObj<BackendService>;
  let auth: jasmine.SpyObj<AuthService>;
  let savedHost: Host;

  beforeEach(async () => {
    savedHost = {
      id: 42, hostname: 'srv-prod-01', applicazione: 'Portale', riferimento: 'Team Windows',
      riferimentoEs: 'Operations', ambiente: 'Produzione', company: 'RAI', servizio: 'Web',
      appliance: false, zona: 'Intranet', locazione: 'Torino', os: 'Windows Server 2022',
      manutenzione: 'Domenica 01:00', status: true,
      fixed: false, fixable: true, divisione: 'Scheduled-Pari',
      nodo: 0, note: 'Prima riga\nSeconda riga', pianificazione: 'Settimanale', rfc: 'RFC123',
      ipfe: '10.20.30.40', ipmgt: '172.16.10.20', ipfe2al: '192.168.10.20',
      vlfe: '100', vlmgt: '200', vlfe2al: '300'
    };
    backend = jasmine.createSpyObj<BackendService>('BackendService', ['getHost', 'updateHost', 'getCrossReferences']);
    backend.getHost.and.callFake(async () => ({ ...savedHost }));
    backend.getCrossReferences.and.resolveTo({
      source: { type: 'hosts', id: 42, label: 'srv-prod-01', context: '', confidence: 'direct', reasons: [] },
      items: [], counts: { hosts: 0, services: 0, sites: 0, cves: 0 },
      total: 0, page: 1, pageSize: 20, totalPages: 0
    });
    backend.updateHost.and.callFake(async (_id, update) => {
      savedHost = { ...savedHost, ...update };
      return { ...savedHost };
    });
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['canWrite']);
    auth.canWrite.and.returnValue(true);
    await TestBed.configureTestingModule({
      imports: [MachineComponent],
      providers: [
        { provide: BackendService, useValue: backend },
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '42' })), snapshot: { paramMap: convertToParamMap({ id: '42' }), data: {} } } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(MachineComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function button(label: string): HTMLButtonElement {
    const result = fixture.nativeElement.querySelector(`button[aria-label="${label}"]`);
    expect(result).withContext(label).not.toBeNull();
    return result;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('keeps every inline field accessible without opening sections', () => {
    for (const label of [
      'Server', 'Applicazione', 'Servizio', 'Riferimento', 'Rif. ES', 'Finestra manutenzione',
      'Pianificazione', 'RFC', 'IP front-end', 'IP management',
      'IP FE2AL', 'VLAN front-end', 'VLAN management', 'VLAN FE2AL', 'Status'
    ]) {
      expect(button(`Modifica ${label}`).getBoundingClientRect().height).toBeGreaterThan(0);
    }
    button('Modifica sistema operativo');
    button('Modifica divisione');
    button('Modifica note');
    expect(fixture.nativeElement.querySelectorAll('.host-sheet section').length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('.card').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.network-table tbody tr').length).toBe(3);
    expect(fixture.componentInstance.networkSource).toBe('DB');
    expect(backend.updateHost).not.toHaveBeenCalled();
  });

  it('saves text and network fields on Enter or blur', async () => {
    for (const [label, field, value, event] of [
      ['Applicazione', 'applicazione', 'Nuova app', new KeyboardEvent('keyup', { key: 'Enter' })],
      ['IP front-end', 'ipfe', '10.0.0.2', new Event('blur')]
    ] as const) {
      button(`Modifica ${label}`).click();
      await settle();
      const input: HTMLInputElement = fixture.nativeElement.querySelector(`input[aria-label="Valore ${label}"]`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(event);
      await settle();
      expect(backend.updateHost).toHaveBeenCalledWith(42, { [field]: value });
    }
  });

  it('offers Windows presets plus manual entry and supports cancel', async () => {
    button('Modifica sistema operativo').click();
    await settle();
    const family: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="Famiglia sistema operativo"]');
    expect(Array.from(family.options).map(option => option.value)).toEqual(['Windows', 'Windows Server', 'custom']);
    const server: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="Versione Windows Server"]');
    expect(server.value).toBe('Windows Server 2022');
    expect(Array.from(server.options).map(option => option.value)).toEqual([
      'Windows Server 2016', 'Windows Server 2019', 'Windows Server 2022', 'Windows Server 2025'
    ]);
    family.value = 'Windows';
    family.dispatchEvent(new Event('change'));
    await settle();
    const client: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="Versione Windows client"]');
    expect(Array.from(client.options).map(option => option.value)).toEqual(['Windows 10', 'Windows 11']);
    button('Salva sistema operativo').click();
    await settle();
    expect(backend.updateHost).toHaveBeenCalledWith(42, { os: 'Windows 11' });

    button('Modifica sistema operativo').click();
    await settle();
    backend.updateHost.calls.reset();
    button('Annulla modifica sistema operativo').click();
    await settle();
    expect(fixture.componentInstance.editingField).toBeNull();
    expect(backend.updateHost).not.toHaveBeenCalled();
  });

  it('preserves presets and numeric nodes without changing the manually assigned division', async () => {
    for (const [label, field, value] of [
      ['Collaudo', 'ambiente', 'Collaudo'], ['Nodo 1', 'nodo', 1],
      ['Teulada', 'locazione', 'Teulada'], ['DMZ', 'zona', 'DMZ']
    ] as const) {
      const root: HTMLElement = fixture.nativeElement;
      const preset = Array.from(root.querySelectorAll<HTMLButtonElement>('.choice-button'))
        .find(item => item.textContent?.trim() === label)!;
      preset.click();
      await settle();
      expect(backend.updateHost).toHaveBeenCalledWith(42, { [field]: value });
      expect(preset.getAttribute('aria-pressed')).toBe('true');
    }
    expect(fixture.componentInstance.host?.divisione).toBe('Scheduled-Pari');
    expect(backend.updateHost.calls.count()).toBe(4);
    button('Modifica divisione').click();
    await settle();
    const division: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="Valore divisione"]');
    expect(Array.from(division.options).map(option => option.textContent?.trim())).toContain('Manuale NOC');
    division.value = 'Manuale';
    division.dispatchEvent(new Event('change'));
    await settle();
    expect(backend.updateHost).toHaveBeenCalledWith(42, { divisione: 'Manuale' });
  });

  it('keeps the company and boolean switches and multiline notes', async () => {
    for (const [label, update] of [
      ['Stato fix macchina', { fixed: true }],
      ['Stato fixable macchina', { fixable: false }],
      ['Stato appliance macchina', { appliance: true }],
      ['Compagnia RAI pubblicita', { company: "RAI PUBBLICITA'" }]
    ] as const) {
      const toggle: HTMLInputElement = fixture.nativeElement.querySelector(`input[aria-label="${label}"]`);
      toggle.click();
      await settle();
      expect(backend.updateHost).toHaveBeenCalledWith(42, update);
    }
    button('Modifica note').click();
    await settle();
    const notes: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    notes.value = 'Riga uno\nRiga due';
    notes.dispatchEvent(new Event('input'));
    notes.dispatchEvent(new Event('blur'));
    await settle();
    expect(backend.updateHost).toHaveBeenCalledWith(42, { note: 'Riga uno\nRiga due' });
  });

  it('leaves missing network fields empty without external retrieval or automatic persistence', async () => {
    fixture.componentInstance.host = { ...savedHost, ipfe: null, ipmgt: null, ipfe2al: null, vlfe: null, vlmgt: null, vlfe2al: null };
    await settle();
    expect(backend.getHost).toHaveBeenCalledTimes(1);
    expect(backend.updateHost).not.toHaveBeenCalled();
    expect(fixture.componentInstance.networkSource).toBe('DB');
    const cells = fixture.nativeElement.querySelectorAll('.network-table td .field-text');
    expect(Array.from(cells as NodeListOf<HTMLElement>).map(cell => cell.textContent?.trim())).toEqual(['-', '-', '-', '-', '-', '-']);
  });

  it('defaults new hosts to Windows Server and allows changing their OS before creation', async () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'paramMap', { value: convertToParamMap({ id: 'new' }) });
    fixture.componentInstance.ngOnInit();
    await settle();
    expect(fixture.componentInstance.host?.os).toBe('Windows Server 2022');
    button('Modifica sistema operativo').click();
    await settle();
    fixture.componentInstance.osFamily = 'Windows';
    fixture.componentInstance.osVersion = 'Windows 10';
    await fixture.componentInstance.saveOS();
    expect(fixture.componentInstance.host?.os).toBe('Windows 10');
    expect(backend.updateHost).not.toHaveBeenCalled();
  });

  it('does not save an OS outside the supported Windows presets', async () => {
    fixture.componentInstance.osFamily = 'Windows Server';
    fixture.componentInstance.osVersion = 'Unknown OS';
    await fixture.componentInstance.saveOS();
    expect(backend.updateHost).not.toHaveBeenCalled();
    expect(fixture.componentInstance.host?.os).toBe('Windows Server 2022');
  });

  it('supports manual Windows edition entry', async () => {
    button('Modifica sistema operativo').click();
    await settle();
    fixture.componentInstance.osFamily = 'custom';
    fixture.componentInstance.customOsVersion = 'Windows 11 Enterprise';
    await fixture.componentInstance.saveOS();
    expect(backend.updateHost).toHaveBeenCalledWith(42, { os: 'Windows 11 Enterprise' });
  });

  it('preserves a non-preset existing OS without silently assigning a Windows version', async () => {
    fixture.componentInstance.host = { ...savedHost, os: 'Legacy OS 1' };
    button('Modifica sistema operativo').click();
    await settle();
    expect(fixture.componentInstance.osFamily).toBe('custom');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[aria-label="Versione sistema operativo personalizzata"]');
    expect(input.value).toBe('Legacy OS 1');
    expect(fixture.componentInstance.host?.os).toBe('Legacy OS 1');
    button('Annulla modifica sistema operativo').click();
    await settle();
    expect(backend.updateHost).not.toHaveBeenCalled();
  });

  it('renders readonly values without editable actions', async () => {
    auth.canWrite.and.returnValue(false);
    await settle();
    expect(fixture.nativeElement.querySelectorAll('.icon-edit-btn').length).toBe(0);
    const controls: NodeListOf<HTMLInputElement | HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.choice-button, input[type="checkbox"]');
    expect(Array.from(controls).every(control => control.disabled)).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Sola lettura');
  });

  for (const width of [1100, 1056, 700, 360]) {
    it(`keeps all fields within the sheet at ${width}px without horizontal scrolling`, async () => {
      const element: HTMLElement = fixture.nativeElement;
      element.style.width = `${width}px`;
      element.style.flex = 'none';
      await settle();
      const sheet: HTMLElement = element.querySelector('.host-sheet')!;
      expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth);
      const bounds = sheet.getBoundingClientRect();
      for (const section of Array.from(sheet.querySelectorAll('section'))) {
        const rect = section.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
        expect(rect.right).toBeLessThanOrEqual(bounds.right);
      }
      if (width >= 1056) {
        expect(bounds.height).toBeLessThan(600);
      }
    });
  }
});
