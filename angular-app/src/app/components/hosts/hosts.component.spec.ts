import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BackendService } from '../../services/backend.service';
import { NotificationService } from '../../services/notification.service';
import { FixesComponent } from '../fixes/fixes.component';
import { HostsComponent } from './hosts.component';

describe('Windows inventory and fixes filters', () => {
  const versions = [
    'Windows 10', 'Windows 11', 'Windows Server 2016',
    'Windows Server 2019', 'Windows Server 2022', 'Windows Server 2025'
  ];

  for (const mode of ['hosts', 'fixes']) {
    let component: HostsComponent | FixesComponent;

    beforeEach(() => {
      const backend = {} as BackendService;
      const auth = {} as AuthService;
      const notifications = {} as NotificationService;
      component = mode === 'hosts'
        ? new HostsComponent(backend, {} as ActivatedRoute, auth, notifications)
        : new FixesComponent(backend, auth, notifications);
      component.availableOS = [...versions, 'Unknown OS'];
    });

    it(`${mode}: separates clients and servers without treating unknown OS as Windows`, () => {
      component.filterOSFamily = ['Windows'];
      expect(component.getAvailableOSVersions()).toEqual(versions.slice(0, 2));
      component.filterOSFamily = ['Windows Server'];
      expect(component.getAvailableOSVersions()).toEqual(versions.slice(2));
      component.filterOSFamily = ['Windows', 'Windows Server'];
      expect(component.getAvailableOSVersions()).toEqual(versions);
    });

    it(`${mode}: sends matching families to the backend and clears incompatible versions`, () => {
      component.setPreset('osFamily', 'Windows');
      component.setPreset('os', 'Windows 11');
      component.setPreset('osFamily', 'Windows Server');
      component.setPreset('osFamily', 'Windows');
      expect(component.filterOS).toEqual([]);
      const filters = component instanceof HostsComponent ? component.baseFiltersWindows : component.baseFilters;
      expect(filters.osFamily).toBe('Windows Server');
      expect(filters.os).toBeUndefined();
    });
  }
});
