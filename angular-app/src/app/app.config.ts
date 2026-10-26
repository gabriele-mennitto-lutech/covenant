import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Lara from '@primeng/themes/lara';

import { routes } from './app.routes';

const AppTheme = definePreset(Lara, {
  semantic: {
    primary: {
      50: '#eff6fc',
      100: '#deecf9',
      200: '#c7e0f4',
      300: '#71afe5',
      400: '#2b88d8',
      500: '#0078d4',
      600: '#106ebe',
      700: '#005a9e',
      800: '#004578',
      900: '#00345b',
      950: '#002440'
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '#005a9e',
      offset: '2px'
    },
    colorScheme: {
      light: {
        primary: {
          color: '#0078d4',
          inverseColor: '#ffffff',
          hoverColor: '#106ebe',
          activeColor: '#005a9e'
        },
        highlight: {
          background: '#eff6fc',
          focusBackground: '#deecf9',
          color: '#005a9e',
          focusColor: '#004578'
        }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    providePrimeNG({
      theme: {
        preset: AppTheme,
        options: {
          darkModeSelector: false
        }
      }
    })
  ]
};
