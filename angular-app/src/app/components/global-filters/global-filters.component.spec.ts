import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GlobalFiltersComponent } from './global-filters.component';

describe('GlobalFiltersComponent Windows filters', () => {
  let fixture: ComponentFixture<GlobalFiltersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GlobalFiltersComponent] }).compileComponents();
    fixture = TestBed.createComponent(GlobalFiltersComponent);
    fixture.componentRef.setInput('mode', 'fixes');
    fixture.detectChanges();
  });

  it('offers Windows client and server families', () => {
    expect(fixture.componentInstance.osFamilyOptions.map(option => option.value))
      .toEqual(['Windows', 'Windows Server']);
    expect(fixture.nativeElement.textContent).toContain('Windows 10 / 11');
    expect(fixture.nativeElement.textContent).toContain('Windows Server');
  });

  it('emits family selections and Clear All', () => {
    const preset = spyOn(fixture.componentInstance.presetClick, 'emit');
    const clear = spyOn(fixture.componentInstance.clearAll, 'emit');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find(button => button.textContent?.includes('Windows Server'))!.click();
    expect(preset).toHaveBeenCalledOnceWith({ col: 'osFamily', val: 'Windows Server' });
    fixture.nativeElement.querySelector('.clear-btn').click();
    expect(clear).toHaveBeenCalled();
  });

  it('renders supplied Windows versions in both inventory and fixes', () => {
    for (const mode of ['hosts', 'fixes']) {
      fixture.componentRef.setInput('mode', mode);
      fixture.componentRef.setInput('filterOSFamily', ['Windows Server']);
      fixture.componentRef.setInput('availableOSVersions', ['Windows Server 2016', 'Windows Server 2025']);
      fixture.detectChanges();
      expect(fixture.componentInstance.osVersionsOptions.map(option => option.value))
        .toEqual(['Windows Server 2016', 'Windows Server 2025']);
    }
  });
});
