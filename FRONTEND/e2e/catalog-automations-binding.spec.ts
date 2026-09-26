import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// «Módulos conectados» → Automatizaciones (ADR-0039).
//
// El principio que estas pruebas protegen:
//
//   Un workflow publicado es una capacidad reutilizable; solo una definición
//   publicada de Catalog Builder decide si forma parte del comportamiento de un
//   ticket.
//
// En pantalla eso significa cuatro cosas concretas: solo se ofrecen versiones
// publicadas, se pueden vincular varias, una vinculación se puede apagar sin
// perderla, y una referencia que ya no está publicada se MARCA en vez de
// borrarse sola.

const automatizacionesPublicadas = {
  items: [
    {
      reference: {
        module: 'automations', resourceType: 'workflow',
        resourceId: 'fam-asignacion', resourceInstanceId: 'wf-asignacion',
        resourceVersion: '3', contractVersion: '1', required: false,
      },
      displayName: 'INC v3 · asignar_automatico',
      description: 'Automatización publicada. Disparador: ticket_created.',
      automationCapability: {
        categoryId: 'INC', trigger: 'ticket_created', workflowId: 'wf-asignacion',
        familyId: 'fam-asignacion', version: 3, selectable: true,
      },
    },
    {
      reference: {
        module: 'automations', resourceType: 'workflow',
        resourceId: 'fam-notificacion', resourceInstanceId: 'wf-notificacion',
        resourceVersion: '1', contractVersion: '1', required: false,
      },
      displayName: 'INC v1 · notificar_interesados',
      description: 'Automatización publicada. Disparador: ticket_created.',
      automationCapability: {
        categoryId: 'INC', trigger: 'ticket_created', workflowId: 'wf-notificacion',
        familyId: 'fam-notificacion', version: 1, selectable: true,
      },
    },
    {
      reference: {
        module: 'automations', resourceType: 'workflow',
        resourceId: 'fam-service-required', resourceInstanceId: 'wf-service-required',
        resourceVersion: '1', contractVersion: '1', required: false,
      },
      displayName: 'INC v1 · create_service_rfc',
      description: 'Automatización publicada. Disparador: incident_service_required.',
      automationCapability: {
        categoryId: 'INC', trigger: 'incident_service_required', workflowId: 'wf-service-required',
        familyId: 'fam-service-required', version: 1, selectable: true,
      },
    },
  ],
};

// definicionINC es lo mínimo que el builder necesita para abrir la plantilla.
//
// Se sirve desde el propio spec —`forwardUnmatched: false`— a propósito: lo que
// se comprueba es el SELECTOR de automatizaciones, y depender del backend
// compartido haría que esta prueba fallara por el estado de la instalación en
// vez de por lo que afirma.
const definicionINC = {
  items: [{
    id: '1', entityKey: 'INC', name: 'Incidente', version: 1, status: 'draft',
    specification: {
      fields: [], bindings: [],
      lifecycle: { states: [{ key: 'open', label: 'Abierto', initial: true }], transitions: [] },
    },
  }],
};

async function abrirModulosConectados(page: Page, recursos: unknown = automatizacionesPublicadas) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/catalog/resources', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recursos) }));
  await page.route('**/catalog/definitions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(definicionINC) }));
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-resources').click();
  await expect(page.getByTestId('automations-bindings')).toBeVisible();
}

test('solo se ofrecen automatizaciones publicadas, con su versión', async ({ page }) => {
  await abrirModulosConectados(page);

  const selector = page.getByTestId('automations-available');
  await expect(selector.locator('option')).toContainText([
    'Select a published automation',
    'INC v3 · asignar_automatico · v3',
    'INC v1 · notificar_interesados · v1',
    'INC v1 · create_service_rfc · v1',
  ]);
  // El catálogo de capacidades solo devuelve lo publicado; un borrador no llega
  // hasta aquí, y el texto lo dice para que nadie lo busque.
  await expect(page.getByTestId('automations-bindings')).toContainText('a draft cannot be bound');
});

test('se pueden vincular varias y cada una se puede apagar sin perderla', async ({ page }) => {
  await abrirModulosConectados(page);

  await page.getByTestId('automations-available').selectOption('wf-asignacion');
  await page.getByTestId('automations-available').selectOption('wf-notificacion');
  await page.getByTestId('automations-available').selectOption('wf-service-required');
  await expect(page.getByTestId('automation-binding')).toHaveCount(3);

  // La primera muestra su versión y su familia: la referencia es a una versión
  // publicada exacta, no «la última».
  const primera = page.getByTestId('automation-binding').first();
  await expect(primera).toContainText('Version 3');
  await expect(primera).toContainText('fam-asignacion');

  // Apagar NO la quita: la referencia se conserva.
  await primera.getByTestId('automation-binding-enabled').uncheck();
  await expect(page.getByTestId('automation-binding')).toHaveCount(3);
  await expect(primera.getByTestId('automation-binding-enabled')).not.toBeChecked();

  // Una ya vinculada deja de ofrecerse: vincular dos veces la misma versión
  // ejecutaría lo mismo dos veces.
  await expect(page.getByTestId('automations-available').locator('option')).toHaveCount(1);
});

test('una referencia que ya no está publicada se marca y no se borra sola', async ({ page }) => {
  // Una definición GUARDADA que vincula una versión que Automations ya archivó:
  // exactamente lo que queda cuando alguien publica una versión nueva del
  // workflow —o lo desactiva— después de haber vinculado la anterior.
  const conReferenciaArchivada = {
    items: [{
      ...definicionINC.items[0],
      specification: {
        ...definicionINC.items[0].specification,
        bindings: [{
          module: 'automations', resourceType: 'workflow',
          resourceId: 'fam-archivada', resourceInstanceId: 'wf-archivada',
          resourceVersion: '2', contractVersion: '1', enabled: true,
        }],
      },
    }],
  };

  await page.setViewportSize({ width: 1600, height: 1100 });
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/catalog/resources', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(automatizacionesPublicadas) }));
  await page.route('**/catalog/definitions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conReferenciaArchivada) }));
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-resources').click();

  await expect(page.getByTestId('automation-binding')).toHaveCount(1);
  await expect(page.getByTestId('automation-binding-missing')).toBeVisible();
  await expect(page.getByTestId('automation-binding-missing')).toContainText('archived');
  // La referencia sigue ahí, con su versión y su familia: quitarla sola
  // cambiaría el comportamiento de la plantilla sin que nadie lo decidiera.
  await expect(page.getByTestId('automation-binding')).toContainText('Version 2');
  await expect(page.getByTestId('automation-binding')).toContainText('fam-archivada');
});

test('si el catálogo de automatizaciones no responde, se avisa y no se pierde nada', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/catalog/resources', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'automations no disponible' }) }));
  await page.route('**/catalog/definitions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(definicionINC) }));
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-resources').click();

  await expect(page.getByTestId('automations-bindings-error')).toBeVisible();
  await expect(page.getByTestId('automations-bindings-error')).toContainText('will be blocked');
});

test('vincular una versión nueva de la misma familia reemplaza a la anterior en vez de duplicarla', async ({ page }) => {
  const dosVersionesMismaFamilia = {
    items: [
      {
        reference: {
          module: 'automations', resourceType: 'workflow',
          resourceId: 'fam-asignacion', resourceInstanceId: 'wf-asignacion-v3',
          resourceVersion: '3', contractVersion: '1', required: false,
        },
        displayName: 'INC v3 · asignar_automatico',
        description: 'Automatización v3. Disparador: ticket_created.',
      },
      {
        reference: {
          module: 'automations', resourceType: 'workflow',
          resourceId: 'fam-asignacion', resourceInstanceId: 'wf-asignacion-v4',
          resourceVersion: '4', contractVersion: '1', required: false,
        },
        displayName: 'INC v4 · asignar_automatico',
        description: 'Automatización v4. Disparador: ticket_created.',
      },
    ],
  };

  await abrirModulosConectados(page, dosVersionesMismaFamilia);

  // Vincular versión 3
  await page.getByTestId('automations-available').selectOption('wf-asignacion-v3');
  await expect(page.getByTestId('automation-binding')).toHaveCount(1);
  await expect(page.getByTestId('automation-binding')).toContainText('Version 3');
  await expect(page.getByTestId('automation-binding')).toContainText('fam-asignacion');

  // Vincular versión 4 de la MISMA familia: debe reemplazar a v3 (no crear una 2da entrada)
  await page.getByTestId('automations-available').selectOption('wf-asignacion-v4');
  await expect(page.getByTestId('automation-binding')).toHaveCount(1);
  await expect(page.getByTestId('automation-binding')).toContainText('Version 4');
  await expect(page.getByTestId('automation-binding')).toContainText('fam-asignacion');
});

test('el selector de automatizaciones filtra por categoria compatible y disparador soportado', async ({ page }) => {
  const recursosMixtos = {
    items: [
      {
        reference: { module: 'automations', resourceType: 'workflow', resourceId: 'fam-inc', resourceInstanceId: 'wf-inc-1', resourceVersion: '1', contractVersion: '1', required: false },
        displayName: 'INC Compatible Workflow',
        automationCapability: { categoryId: 'INC', trigger: 'ticket_created', workflowId: 'wf-inc-1', familyId: 'fam-inc', version: 1, selectable: true },
      },
      {
        reference: { module: 'automations', resourceType: 'workflow', resourceId: 'fam-service', resourceInstanceId: 'wf-service-1', resourceVersion: '1', contractVersion: '1', required: false },
        displayName: 'INC Service Escalation Workflow',
        automationCapability: { categoryId: 'INC', trigger: 'incident_service_required', workflowId: 'wf-service-1', familyId: 'fam-service', version: 1, selectable: true },
      },
      {
        reference: { module: 'automations', resourceType: 'workflow', resourceId: 'fam-prb', resourceInstanceId: 'wf-prb-1', resourceVersion: '1', contractVersion: '1', required: false },
        displayName: 'PRB Investigation Workflow',
        automationCapability: { categoryId: 'PRB', trigger: 'ticket_created', workflowId: 'wf-prb-1', familyId: 'fam-prb', version: 1, selectable: true },
      },
      {
        reference: { module: 'automations', resourceType: 'workflow', resourceId: 'fam-archived', resourceInstanceId: 'wf-archived-1', resourceVersion: '1', contractVersion: '1', required: false },
        displayName: 'INC Archived Workflow',
        automationCapability: { categoryId: 'INC', trigger: 'ticket_created', workflowId: 'wf-archived-1', familyId: 'fam-archived', version: 1, selectable: false },
      },
    ],
  };

  await abrirModulosConectados(page, recursosMixtos);

  const selector = page.getByTestId('automations-available');
  const optionTexts = await selector.locator('option').allTextContents();

  // INC compatible workflows are present
  expect(optionTexts.some((t) => t.includes('INC Compatible Workflow'))).toBe(true);
  expect(optionTexts.some((t) => t.includes('INC Service Escalation Workflow'))).toBe(true);

  // PRB and non-selectable workflows are strictly excluded
  expect(optionTexts.some((t) => t.includes('PRB Investigation Workflow'))).toBe(false);
  expect(optionTexts.some((t) => t.includes('INC Archived Workflow'))).toBe(false);
});


