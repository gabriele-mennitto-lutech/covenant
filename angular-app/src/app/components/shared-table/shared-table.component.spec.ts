import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { SharedTableComponent } from './shared-table.component';
import { BackendService } from '../../services/backend.service';
import { TableConfigService } from '../../services/table-config.service';
import { TableStateService } from '../../services/table-state.service';
import { AuthService } from '../../services/auth.service';

describe('SharedTableComponent column shortcuts', () => {
  let fixture: ComponentFixture<SharedTableComponent>;
  let component: SharedTableComponent;

  beforeEach(async () => {
    const columns = of([
      { key: 'hostname', selected: true },
      { key: 'applicazione', selected: true }
    ]);
    await TestBed.configureTestingModule({
      imports: [SharedTableComponent],
      providers: [
        provideRouter([]),
        { provide: BackendService, useValue: {} },
        { provide: TableConfigService, useValue: { hostsCols$: columns, fixesCols$: columns } },
        { provide: TableStateService, useValue: { getState: () => undefined, saveState: () => {} } },
        { provide: AuthService, useValue: { canWrite: () => false } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SharedTableComponent);
    component = fixture.componentInstance;
    spyOn(component, 'loadData');
    fixture.detectChanges();
  });

  for (const collapsed of [true, false]) {
    it(`toggles only the clicked column without sorting when filtersCollapsed=${collapsed}`, () => {
      fixture.componentRef.setInput('filtersCollapsed', collapsed);
      fixture.detectChanges();
      component.filterHostname = 'server';
      const sort = spyOn(component, 'sortBy');
      const header: HTMLButtonElement = fixture.nativeElement.querySelector('th:nth-child(2) button');

      header.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      fixture.detectChanges();
      expect(component.isFilterVisible('hostname')).toBe(collapsed);
      expect(component.isFilterVisible('applicazione')).toBe(!collapsed);
      expect(fixture.nativeElement.querySelector('th:nth-child(2) .table-filter-container').classList.contains('collapsed')).toBe(!collapsed);
      expect(component.filterHostname).toBe('server');
      expect(sort).not.toHaveBeenCalled();

      header.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      fixture.detectChanges();
      expect(component.isFilterVisible('hostname')).toBe(!collapsed);
    });
  }

  it('keeps normal clicks sorting and supports more than one individually opened column', () => {
    component.filtersCollapsed = true;
    const sort = spyOn(component, 'sortBy');
    component.onHeaderClick(new MouseEvent('click'), 'hostname');
    expect(sort).toHaveBeenCalledWith('hostname');
    component.onHeaderClick(new MouseEvent('click', { shiftKey: true }), 'hostname');
    component.onHeaderClick(new MouseEvent('click', { shiftKey: true }), 'applicazione');
    expect(component.isFilterVisible('hostname')).toBeTrue();
    expect(component.isFilterVisible('applicazione')).toBeTrue();
  });

  it('resets individual visibility when the global toggle changes or text filters are cleared', () => {
    component.activeColumnFilters.add('hostname');
    component.ngOnChanges({ filtersCollapsed: new SimpleChange(true, false, false) });
    expect(component.activeColumnFilters.size).toBe(0);
    component.activeColumnFilters.add('hostname');
    component.filterHostname = 'server';
    component.clearTextFilters();
    expect(component.activeColumnFilters.size).toBe(0);
    expect(component.filterHostname).toBe('');
  });
});
