'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">angular-app documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                        <li class="link">
                            <a href="overview.html" data-type="chapter-link">
                                <span class="icon ion-ios-keypad"></span>Overview
                            </a>
                        </li>
                        <li class="link">
                            <a href="index.html" data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>README
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>
                    </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#components-links"' :
                            'data-bs-target="#xs-components-links"' }>
                            <span class="icon ion-md-cog"></span>
                            <span>Components</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="components-links"' : 'id="xs-components-links"' }>
                            <li class="link">
                                <a href="components/AppComponent.html" data-type="entity-link" >AppComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/BigcardComponent.html" data-type="entity-link" >BigcardComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/CrossSourceComponent.html" data-type="entity-link" >CrossSourceComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/CveAnalysisComponent.html" data-type="entity-link" >CveAnalysisComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/DashboardComponent.html" data-type="entity-link" >DashboardComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/FilterItemComponent.html" data-type="entity-link" >FilterItemComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/FixesComponent.html" data-type="entity-link" >FixesComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/GlobalFiltersComponent.html" data-type="entity-link" >GlobalFiltersComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/HeaderComponent.html" data-type="entity-link" >HeaderComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/HostsComponent.html" data-type="entity-link" >HostsComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ImportDialogComponent.html" data-type="entity-link" >ImportDialogComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/LoginComponent.html" data-type="entity-link" >LoginComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MachineComponent.html" data-type="entity-link" >MachineComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MailingComponent.html" data-type="entity-link" >MailingComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MainpageComponent.html" data-type="entity-link" >MainpageComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MonitoringComponent.html" data-type="entity-link" >MonitoringComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SearchFieldComponent.html" data-type="entity-link" >SearchFieldComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ServicesComponent.html" data-type="entity-link" >ServicesComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SettingsComponent.html" data-type="entity-link" >SettingsComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SharedTableComponent.html" data-type="entity-link" >SharedTableComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SidebarComponent.html" data-type="entity-link" >SidebarComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SiteCardComponent.html" data-type="entity-link" >SiteCardComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SitesComponent.html" data-type="entity-link" >SitesComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SmartcardComponent.html" data-type="entity-link" >SmartcardComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ToastComponent.html" data-type="entity-link" >ToastComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/WipComponent.html" data-type="entity-link" >WipComponent</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/AuthService.html" data-type="entity-link" >AuthService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/BackendService.html" data-type="entity-link" >BackendService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/NotificationService.html" data-type="entity-link" >NotificationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TableConfigService.html" data-type="entity-link" >TableConfigService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TableStateService.html" data-type="entity-link" >TableStateService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/AppNotification.html" data-type="entity-link" >AppNotification</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/AuthUser.html" data-type="entity-link" >AuthUser</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ColumnConfig.html" data-type="entity-link" >ColumnConfig</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CrossReference.html" data-type="entity-link" >CrossReference</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CrossSourceResult.html" data-type="entity-link" >CrossSourceResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Cve.html" data-type="entity-link" >Cve</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveDetails.html" data-type="entity-link" >CveDetails</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveEnrichResult.html" data-type="entity-link" >CveEnrichResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveImportResult.html" data-type="entity-link" >CveImportResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveListParams.html" data-type="entity-link" >CveListParams</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveListResponse.html" data-type="entity-link" >CveListResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveMotivoHistory.html" data-type="entity-link" >CveMotivoHistory</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CveOption.html" data-type="entity-link" >CveOption</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FilterOption.html" data-type="entity-link" >FilterOption</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Host.html" data-type="entity-link" >Host</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/HostRef.html" data-type="entity-link" >HostRef</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/HostResolveResult.html" data-type="entity-link" >HostResolveResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ImportResult.html" data-type="entity-link" >ImportResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/LoginResponse.html" data-type="entity-link" >LoginResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Service.html" data-type="entity-link" >Service</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Site.html" data-type="entity-link" >Site</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Toast.html" data-type="entity-link" >Toast</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/typealiases.html" data-type="entity-link">Type aliases</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});