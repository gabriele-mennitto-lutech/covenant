import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchFieldComponent } from './search-field.component';

describe('SearchFieldComponent', () => {
  let fixture: ComponentFixture<SearchFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SearchFieldComponent] }).compileComponents();
    fixture = TestBed.createComponent(SearchFieldComponent);
    fixture.componentRef.setInput('inputId', 'test-search');
    fixture.componentRef.setInput('label', 'Cerca template');
    fixture.componentRef.setInput('placeholder', 'Cerca template...');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('associates an accessible label and hides the decorative icon from screen readers', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('label')?.htmlFor).toBe('test-search');
    expect(host.querySelector('label')?.textContent).toContain('Cerca template');
    expect(host.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('input')?.placeholder).toBe('Cerca template...');
  });

  it('propagates typed text and external resets', async () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const emit = spyOn(fixture.componentInstance.valueChange, 'emit');
    input.value = 'manutenzione';
    input.dispatchEvent(new Event('input'));
    expect(emit).toHaveBeenCalledWith('manutenzione');

    fixture.componentRef.setInput('value', 'nuovo valore');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('nuovo valore');
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('');
  });

  for (const width of [240, 800]) {
    it(`keeps the icon centered and text clear of it at ${width}px`, () => {
      const host: HTMLElement = fixture.nativeElement;
      host.style.width = `${width}px`;
      const input = host.querySelector('input')!;
      const icon = host.querySelector('i')!;
      const inputRect = input.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      expect(inputRect.width).toBe(width);
      expect(Math.abs(iconRect.top + iconRect.height / 2 - inputRect.top - inputRect.height / 2)).toBeLessThan(1);
      expect(inputRect.left + parseFloat(getComputedStyle(input).paddingLeft)).toBeGreaterThan(iconRect.right);
      expect(getComputedStyle(host.querySelector('label')!).position).toBe('absolute');
    });
  }
});
