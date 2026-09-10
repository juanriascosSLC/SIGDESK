import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin, mockAuthenticatedRequester, SIG_DESK_API_PORT } from './support';
import {
  formatOperationalIssue,
  KNOWN_OPERATIONAL_ISSUES,
  UNKNOWN_OPERATIONAL_ISSUE_FALLBACK,
} from '../src/features/assets/operational-history-presentation';

// Common mojibake / encoding corruption patterns
const MOJIBAKE_REGEX = /[\uFFFD]|Ã[\x80-\xBF]|Â[\x80-\xBF]|â€[^\s]/;

// Forbidden Spanish phrases in system UI chrome
const FORBIDDEN_SPANISH_PHRASES = [
  'Guardar',
  'Cancelar',
  'Volver',
  'Cargando',
  'Buscar tickets',
  'Eliminar',
  'Editar datos',
  'Editar investigación',
  'Nuevo ticket',
  'Nueva RFC',
  'Nuevo flujo',
  'Nueva regla',
  'Crear entidad',
  'Separar',
  'Desvincular',
  'Vincular',
  'Resumen del registro',
  'Sin relaciones registradas',
  'No hay activos vinculados',
  'Activos relacionados',
  'Relaciones de negocio',
  'Tickets combinados',
  'Soluciones sugeridas',
  'Datos del solicitante',
  'Historial de estado',
  'Plan de trabajo',
  'Acuerdo de nivel de servicio',
  'Problema relacionado',
  'Faltan:',
  'campos completados',
  'Sin rol asignado',
  'Rol asignado',
  'Administrador',
  'Cambios abiertos',
  'Esperando CAB',
  'Programados / activos',
  'Sin RFC en esta etapa',
  'No hay acciones disponibles',
  'La RFC solicitada no existe',
  'Estado actualizado a',
  'Automatizaciones',
  'Políticas de SLA',
  'Solicitudes de cambio',
  'Tareas ejecutables',
  'Nuevo rol',
  'Sin unidad',
  'restantes',
  'Incumplido',
  'Cumplido',
  'Vencido hace',
  'al pausar',
  'RELOJ PAUSADO',
  'Calculando objetivos SLA',
  'Primera respuesta',
  'Acciones',
  'Inventario operativo',
  'Sitios disponibles',
  'Buscar sitio',
  'Quitar selección',
  'Configurar acceso',
  'Todos los tipos',
  'Historial operativo de',
  'Consultando dominios',
  'Sin incidentes relacionados',
  'Sin problemas relacionados',
  'Sin cambios relacionados',
  'Historial parcial',
  'Acceso por área o equipo',
  'Asignar área a',
  'Reemplazar deja exactamente',
  'Asignación masiva de acceso',
];

const mockIncSpecification = {
  identity: { prefix: 'INC' },
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'high', label: 'High' }] },
  ],
  lifecycle: {
    states: [
      { key: 'abierto', label: 'Open', initial: true },
      { key: 'en_progreso', label: 'In Progress' },
      { key: 'resuelto', label: 'Resolved' },
      { key: 'cerrado', label: 'Closed' },
    ],
    transitions: [
      { key: 'start', label: 'Start Progress', from: 'abierto', to: 'en_progreso' },
      { key: 'resolve', label: 'Resolve', from: 'en_progreso', to: 'resuelto' },
    ],
  },
  detailPage: {
    default: {
      sidebarColumns: 4,
      header: {
        columns: 12,
        placements: [{ id: 'header', kind: 'widget', widgetKey: 'ticketHeader', column: 0, columnSpan: 12, row: 0, locked: true }],
      },
      actions: {
        columns: 12,
        placements: [{ id: 'actions', kind: 'widget', widgetKey: 'ticketActions', column: 0, columnSpan: 12, row: 0, locked: true }],
      },
      main: {
        columns: 12,
        placements: [
          { id: 'desc', kind: 'widget', widgetKey: 'description', column: 0, columnSpan: 12, row: 0 },
          { id: 'sla', kind: 'widget', widgetKey: 'sla', column: 0, columnSpan: 12, row: 1 },
          { id: 'assets', kind: 'widget', widgetKey: 'assetDetails', column: 0, columnSpan: 12, row: 2 },
          { id: 'solutions', kind: 'widget', widgetKey: 'suggestedSolutions', column: 0, columnSpan: 12, row: 3 },
          { id: 'merged', kind: 'widget', widgetKey: 'mergedTickets', column: 0, columnSpan: 12, row: 4 },
          { id: 'relations', kind: 'widget', widgetKey: 'itsmRelations', column: 0, columnSpan: 12, row: 5 },
          { id: 'status-hist', kind: 'widget', widgetKey: 'statusHistory', column: 0, columnSpan: 12, row: 6 },
        ],
      },
      sidebar: { columns: 4, placements: [] },
      footer: { columns: 12, placements: [] },
    },
  },
};

const mockRfcSpecification = {
  identity: { prefix: 'RFC' },
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'serviceAffected', label: 'Service Affected', type: 'text' },
    { key: 'riskLevel', label: 'Risk Level', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }] },
    { key: 'description', label: 'Plan and Description', type: 'textarea' },
  ],
  lifecycle: {
    states: [
      { key: 'draft', label: 'Draft', initial: true },
      { key: 'assessment', label: 'Assessment' },
      { key: 'pending_approval', label: 'Pending Approval' },
      { key: 'approved', label: 'Approved' },
      { key: 'implementing', label: 'Implementing' },
      { key: 'completed', label: 'Completed' },
      { key: 'rejected', label: 'Rejected' },
    ],
    transitions: [
      { key: 'assess', label: 'Submit for assessment', from: 'draft', to: 'assessment' },
      { key: 'reject', label: 'Reject RFC', from: 'draft', to: 'rejected' },
    ],
  },
};

const mockPrbSpecification = {
  identity: { prefix: 'PRB' },
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'description', label: 'Root cause analysis', type: 'textarea' },
  ],
  relations: [
    { key: 'resolved_by', label: 'Resolved by RFC', targetEntityKey: 'RFC' },
  ],
  lifecycle: {
    states: [
      { key: 'under_investigation', label: 'Under investigation', initial: true },
      { key: 'known_error', label: 'Known error' },
      { key: 'resolved', label: 'Resolved' },
    ],
    transitions: [
      { key: 'resolve', label: 'Mark resolved', from: 'under_investigation', to: 'resolved' },
    ],
  },
};

type MockSlaAssessment = {
  entityId: string;
  humanId: string;
  definitionVersionId?: string;
  definitionVersion?: number;
  policyId: string;
  policyVersion: number;
  priority: string;
  responseTargetMinutes?: number;
  resolutionTargetMinutes?: number;
  startedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  pausedAt?: string;
  responseBreached: boolean;
  resolutionBreached: boolean;
  lastEventId: string;
};

const defaultSlaAssessment: MockSlaAssessment = {
  entityId: '1',
  humanId: 'INC-000001',
  policyId: 'sla-gold',
  policyVersion: 1,
  definitionVersion: 1,
  priority: 'high',
  startedAt: new Date(Date.now() - 3600_000).toISOString(),
  responseDueAt: new Date(Date.now() + 7200_000).toISOString(),
  resolutionDueAt: new Date(Date.now() + 14400_000).toISOString(),
  responseTargetMinutes: 180,
  resolutionTargetMinutes: 300,
  responseBreached: false,
  resolutionBreached: false,
  lastEventId: 'evt-1',
};

interface SetupApiMocksOptions {
  emptyWidgets?: boolean;
  slaAssessment?: Partial<MockSlaAssessment> | null;
  slaLoading?: boolean;
  users?: Array<Record<string, unknown>>;
  roles?: Array<Record<string, unknown>>;
  companies?: Array<Record<string, unknown>>;
}

async function setupApiMocks(page: Page, options?: SetupApiMocksOptions) {
  const emptyWidgets = options?.emptyWidgets ?? false;

  await page.route(
    (url) => url.port === String(SIG_DESK_API_PORT),
    async (route) => {
      const url = new URL(route.request().url());
      const { pathname } = url;

      if (pathname.startsWith('/v1/session') || pathname.startsWith('/me')) {
        return route.fallback();
      }
      if (pathname.startsWith('/notifications')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) });
      }

      // Ticket sub-routes
      if (pathname.match(/^\/tickets\/[^/]+\/merged/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: emptyWidgets
              ? []
              : [
                  {
                    id: '2',
                    title: 'Secondary database latency spike',
                    requesterDisplayName: 'Bob Smith',
                  },
                ],
          }),
        });
      }
      if (pathname.match(/^\/tickets\/[^/]+\/activity/) || pathname.match(/^\/tickets\/[^/]+\/actividades/)) {
        const list = emptyWidgets
          ? []
          : [
              {
                id: 'act-1',
                kind: 'status_changed',
                payload: { from: 'Open', to: 'In Progress' },
                createdAt: new Date().toISOString(),
              },
            ];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: list,
            entries: list,
            timeline: [],
          }),
        });
      }
      if (pathname.match(/^\/tickets\/[^/]+\/comments/)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      }
      if (pathname.match(/^\/tickets\/[^/]+\/attachments/)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      }
      if (pathname.match(/^\/tickets\/[^/]+\/watchers/)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      }

      // Single ticket /entities/INC/:id
      if (pathname.match(/^\/entities\/INC\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'inc-v1',
            entityKey: 'INC',
            version: 1,
            specification: mockIncSpecification,
          }),
        });
      }
      if (pathname.match(/^\/entities\/INC\/[^/]+\/resolved-definition/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entityId: '1',
            humanId: 'INC-000001',
            entityKey: 'INC',
            definitionVersionId: 'inc-v1',
            schemaVersion: '1.5',
            workflowVersion: '1.0',
            metamodelVersion: '1.5',
            layoutVersionId: 'v1',
            layoutVersion: 1,
            layoutResolution: 'latest-compatible',
            layouts: { detail: mockIncSpecification.detailPage },
          }),
        });
      }
      if (pathname.match(/^\/entities\/INC\/[^/]+$/)) {
        const id = pathname.split('/').pop();
        if (id === 'nonexistent') {
          return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'The requested ticket could not be found.' }) });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            humanId: 'INC-000001',
            entityKey: 'INC',
            state: 'abierto',
            recursoId: 'SRV-001',
            definitionVersion: 1,
            mergedCount: emptyWidgets ? 0 : 1,
            creadorNombre: 'Jane Doe',
            data: {
              title: 'Database connection pool timeout',
              description: 'Connection pool exhausted under high peak traffic.',
              priority: 'high',
            },
            assetContext: {
              links: emptyWidgets
                ? []
                : [
                    {
                      assetId: 'SRV-001',
                      role: 'primary',
                      snapshot: {
                        displayName: 'Primary DB Server',
                        manufacturer: 'Dell Inc.',
                        model: 'PowerEdge R740',
                        lifecycle: 'operational',
                        ipAddress: '10.0.1.5',
                      },
                    },
                  ],
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
      }

      // /entities/INC list
      if (pathname === '/entities/INC' || pathname.startsWith('/entities/INC?')) {
        const mergedInto = url.searchParams.get('mergedInto');
        if (mergedInto) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: emptyWidgets
                ? []
                : [
                    {
                      id: '2',
                      humanId: 'INC-000002',
                      entityKey: 'INC',
                      state: 'abierto',
                      data: { title: 'Secondary database latency spike' },
                      creadorNombre: 'Bob Smith',
                      mergedIntoId: '1',
                      createdAt: new Date().toISOString(),
                    },
                  ],
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'INC-000001',
                entityKey: 'INC',
                state: 'abierto',
                prioridad: 'high',
                recursoId: 'SRV-001',
                creadorNombre: 'Jane Doe',
                createdAt: new Date().toISOString(),
                data: { title: 'Database connection pool timeout' },
              },
            ],
            total: 1,
          }),
        });
      }

      // Problem sub-routes
      if (pathname.match(/^\/entities\/PRB\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'prb-v1',
            entityKey: 'PRB',
            version: 1,
            specification: mockPrbSpecification,
          }),
        });
      }
      if (pathname.match(/^\/entities\/PRB\/[^/]+$/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            humanId: 'PRB-000101',
            entityKey: 'PRB',
            state: 'under_investigation',
            definitionVersion: 1,
            data: {
              title: 'Memory leak in cache tier',
              description: 'Threads blocking on connection acquisition during garbage collection.',
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
      }
      if (pathname === '/entities/PRB' || pathname.startsWith('/entities/PRB?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'PRB-000101',
                entityKey: 'PRB',
                state: 'under_investigation',
                definitionVersion: 1,
                data: { title: 'Memory leak in cache tier' },
              },
            ],
            total: 1,
          }),
        });
      }
      if (pathname.startsWith('/problems')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            problems: [
              {
                id: '1',
                humanId: 'PRB-000101',
                title: 'Memory leak in cache tier',
                state: 'under_investigation',
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        });
      }

      // Changes routes
      if (pathname === '/changes/definition') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'rfc-def',
            entityKey: 'RFC',
            name: 'Change Request',
            version: 1,
            specification: mockRfcSpecification,
          }),
        });
      }
      if (pathname.match(/^\/changes\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'rfc-def-v1',
            entityKey: 'RFC',
            version: 1,
            specification: mockRfcSpecification,
          }),
        });
      }
      if (pathname.match(/^\/changes\/[^/]+\/tasks/)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (pathname.match(/^\/changes\/[^/]+$/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            humanId: 'RFC-000101',
            entityKey: 'RFC',
            state: 'draft',
            definitionVersion: 1,
            manifestChecksum: 'checksum-rfc-101',
            data: {
              title: 'Upgrade database cluster to PostgreSQL 16',
              serviceAffected: 'Core Financial Engine',
              riskLevel: 'medium',
              plannedStart: new Date().toISOString(),
              description: 'Controlled upgrade during maintenance window.',
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
      }
      if (pathname === '/changes' || pathname.startsWith('/changes?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'RFC-000101',
                entityKey: 'RFC',
                state: 'draft',
                definitionVersion: 1,
                data: {
                  title: 'Upgrade database cluster to PostgreSQL 16',
                  serviceAffected: 'Core Financial Engine',
                  riskLevel: 'medium',
                  plannedStart: new Date().toISOString(),
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        });
      }

      // Relationships & change-relationships
      if (pathname.startsWith('/relationships') || pathname.startsWith('/change-relationships')) {
        if (emptyWidgets) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'rel-1',
                sourceEntityKey: 'INC',
                sourceEntityId: '1',
                sourceHumanId: 'INC-000001',
                targetEntityKey: 'PRB',
                targetEntityId: '1',
                targetHumanId: 'PRB-000101',
                relationKey: 'caused_by',
                relationLabel: 'Caused by',
                inverseLabel: 'Causes',
                contractVersion: 1,
              },
            ],
          }),
        });
      }

      // Automations routes
      if (pathname.match(/^\/workflows\/[^/]+\/ejecuciones/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'exec-1',
              ticket_id: 'INC-000001',
              accion: 'asignar_automatico',
              workflow_version: 1,
              iniciada_en: new Date().toISOString(),
              finalizada_en: new Date().toISOString(),
              intentos: 1,
              estado: 'completada',
            },
          ]),
        });
      }
      if (pathname.match(/^\/workflows\/[^/]+$/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'flow-1',
            categoria_id: 'INC',
            version: 1,
            estado: 'publicado',
            reglas: [{ id: 'r1', accion: 'asignar_automatico' }],
            layout: { nodes: [], edges: [] },
          }),
        });
      }
      if (pathname.startsWith('/workflows')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'flow-1',
                categoria_id: 'INC',
                version: 1,
                estado: 'publicado',
                reglas: [{ id: 'r1', accion: 'asignar_automatico' }],
              },
            ],
          }),
        });
      }

      // Catalog definitions
      if (pathname.match(/^\/catalog\/definitions\/INC\/versions\/[^/]+\/manifest/) || pathname === '/catalog/definitions/INC/manifest') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'inc-v1',
            entityKey: 'INC',
            version: 1,
            specification: mockIncSpecification,
          }),
        });
      }
      if (pathname === '/catalog/definitions/INC') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'def-inc',
            entityKey: 'INC',
            name: 'Incident',
            version: 1,
            status: 'published',
            specification: mockIncSpecification,
          }),
        });
      }
      if (pathname.startsWith('/catalog/definitions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'def-inc',
                entityKey: 'INC',
                name: 'Incident',
                version: 1,
                status: 'published',
                specification: mockIncSpecification,
              },
              {
                id: 'def-prb',
                entityKey: 'PRB',
                name: 'Problem',
                version: 1,
                status: 'published',
                specification: mockPrbSpecification,
              },
              {
                id: 'def-rfc',
                entityKey: 'RFC',
                name: 'Change Request',
                version: 1,
                status: 'published',
                specification: mockRfcSpecification,
              },
            ],
          }),
        });
      }

      // SLA assessments
      if (pathname.match(/^\/sla\/assessments\/[^/]+$/)) {
        if (options?.slaLoading) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(defaultSlaAssessment),
          });
        }
        if (emptyWidgets || options?.slaAssessment === null) {
          return route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'No SLA assessment found' }),
          });
        }
        const assessment = options?.slaAssessment
          ? { ...defaultSlaAssessment, ...options.slaAssessment }
          : defaultSlaAssessment;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(assessment),
        });
      }

      // SLA policies
      if (pathname.startsWith('/sla/policies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sla-1',
              resourceId: 'sla-gold',
              name: 'Gold SLA Policy',
              version: 1,
              status: 'active',
            },
          ]),
        });
      }
      if (pathname.startsWith('/catalog/resources')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }

      // Users & Roles / RBAC routes
      if (pathname === '/admin/roles') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: options?.roles ?? [
              {
                id: 'admin',
                nombre: 'Admin',
                descripcion: 'System Administrator',
                permisos: [{ entidad: '*', accion: 'read', alcance: 'global' }],
              },
            ],
          }),
        });
      }
      if (pathname === '/admin/permissions') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            acciones: ['create', 'read', 'update', 'delete'],
            alcances: ['global', 'depto', 'propio'],
            entidades: ['roles', 'usuarios', 'companies', 'tickets'],
          }),
        });
      }
      if (pathname === '/admin/users') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: options?.users ?? [
              {
                username: 'unassigned.user',
                usuario_id: 'u-1',
                nombre: 'Unassigned User',
                email: 'unassigned@example.com',
                role_id: 'admin',
                company_id: '',
                tiene_usuario: true,
              },
            ],
          }),
        });
      }
      if (pathname === '/admin/companies') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: options?.companies ?? [],
          }),
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    },
  );
}

async function assertPageIsCleanEnglish(page: Page, expectedHeading?: string | RegExp) {
  if (expectedHeading) {
    await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible({ timeout: 7000 });
  }

  // Verify no mojibake exists anywhere in the body text
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toMatch(MOJIBAKE_REGEX);

  // Check against forbidden Spanish chrome phrases
  for (const phrase of FORBIDDEN_SPANISH_PHRASES) {
    expect(bodyText, `Found forbidden Spanish phrase "${phrase}" on page`).not.toContain(phrase);
  }
}

test.describe('Localization & UTF-8 Encoding Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Tickets board & list (/app/tickets) renders clean English UI with asset field', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/tickets');
    await expect(page.getByRole('heading', { name: 'Ticket Board' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Asset:', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByTestId('tickets-list')).toBeVisible({ timeout: 7000 });
    await expect(page.getByPlaceholder('Search by title, description or ID…')).toBeVisible();
    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail page (/app/tickets/1) renders all widgets in exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/tickets/1');

    // Verify ticket header & content
    await expect(page.getByText('Database connection pool timeout')).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId('page-layout-region-header').getByText('Open')).toBeVisible();

    // Verify SLA widget
    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible();
    await expect(page.getByText('First response')).toBeVisible();
    await expect(page.getByText('Resolution')).toBeVisible();

    // Verify Asset Details widget
    await expect(page.getByRole('heading', { name: 'Related Assets' })).toBeVisible();
    await expect(page.getByText('Primary DB Server')).toBeVisible();
    await expect(page.getByText('Manufacturer')).toBeVisible();
    await expect(page.getByText('Dell Inc.')).toBeVisible();
    await expect(page.getByText('Model')).toBeVisible();
    await expect(page.getByText('PowerEdge R740')).toBeVisible();

    // Verify Suggested Solutions widget
    await expect(page.getByRole('heading', { name: 'Suggested solutions' })).toBeVisible();
    await expect(page.getByText('Related problem')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Related problem PRB-000101' })).toBeVisible();

    // Verify Merged Tickets widget
    await expect(page.getByText('Tickets merged into 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unmerge' })).toBeAttached();

    // Verify Status History widget
    await expect(page.getByRole('heading', { name: 'Status history' })).toBeVisible();
    await expect(page.getByText('Open → In Progress')).toBeVisible();

    // Verify Relations widget
    await expect(page.getByRole('heading', { name: 'Related Cases' })).toBeVisible();
    await expect(page.getByText('contract v1')).toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail empty & error states render clean English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, { emptyWidgets: true });

    // Empty widgets on ticket
    await page.goto('/app/tickets/1');
    await expect(page.getByText('Database connection pool timeout')).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('No assets linked to this record.')).toBeVisible();
    await expect(page.getByText('No related problems yet')).toBeVisible();
    await expect(page.getByText('No status changes yet.')).toBeVisible();
    await expect(page.getByText('No relations recorded.')).toBeVisible();

    // Error state on nonexistent ticket
    await page.goto('/app/tickets/nonexistent');
    await expect(page.getByText('The requested ticket could not be found.')).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Problem Detail page (/app/problems/PRB-000101) & dialogs render exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/problems/PRB-000101');

    await expect(page.getByRole('heading', { name: 'Memory leak in cache tier' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Under investigation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit investigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create RFC to resolve' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Business relations' })).toBeVisible();

    // Exercise Edit Investigation form & Cancel
    await page.getByRole('button', { name: 'Edit investigation' }).click();
    await expect(page.getByRole('heading', { name: 'Update analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Update analysis' })).not.toBeVisible();

    // Exercise Create RFC to resolve modal & Cancel
    await page.getByRole('button', { name: 'Create RFC to resolve' }).click();
    await expect(page.getByRole('heading', { name: 'Create a change to resolve the root cause' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create a change to resolve the root cause' })).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Changes Board (/app/changes) & Create RFC Modal render exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/changes');

    await expect(page.getByRole('heading', { name: 'Change Management' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Open changes')).toBeVisible();
    await expect(page.getByText('Awaiting CAB')).toBeVisible();
    await expect(page.getByText('Scheduled / active')).toBeVisible();

    // Columns
    await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assessment' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CAB' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Execution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Closed' })).toBeVisible();

    // Create RFC modal
    await page.getByRole('button', { name: 'New RFC' }).click();
    await expect(page.getByRole('heading', { name: 'Create change request' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create RFC' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create change request' })).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Change Detail page (/app/changes/RFC-000101) & transition dialog render exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/changes/RFC-000101');

    await expect(page.getByRole('heading', { name: 'Upgrade database cluster to PostgreSQL 16' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('heading', { name: 'Lifecycle' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change definition and plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Traceability' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Related Cases' })).toBeVisible();

    // Transition buttons & ConfirmDialog
    await expect(page.getByRole('button', { name: 'Reject RFC' })).toBeVisible();
    await page.getByRole('button', { name: 'Reject RFC' }).click();
    await expect(page.getByText('A justification is required to reject this RFC.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('A justification is required to reject this RFC.')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Automations Designer editor (/app/automations/flow-1) renders exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/automations/flow-1');

    await expect(page.getByRole('heading', { name: 'Workflow INC' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Published · v1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new draft from this version' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Validate (1)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contract' })).toBeVisible();

    // Library items
    await expect(page.getByText('Library')).toBeVisible();
    await expect(page.getByRole('button', { name: /Notify Stakeholders/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Assign Automatically/i })).toBeVisible();

    // Live Execution History modal
    await page.getByRole('button', { name: 'View executions' }).click();
    await expect(page.getByRole('heading', { name: 'Live execution history' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Ticket' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Attempts' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Live execution history' })).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Catalog Builder editor (/app/admin/catalog-builder) renders tabs and Page Designer palette in exact English', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/admin/catalog-builder');

    await expect(page.getByTestId('catalog-builder')).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Create entity' })).toBeVisible();

    // Select Incident entity
    await page.getByRole('button', { name: /Incident/i }).first().click();

    // Verify configuration tabs in exact English
    await expect(page.getByRole('button', { name: /General Information/i })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: /Form Fields/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Visual Design/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /States & Transitions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Related Cases/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Validate & Publish/i })).toBeVisible();

    // Switch to Visual Design and verify Detail palette in exact English
    await page.getByRole('button', { name: /Visual Design/i }).click();
    await page.getByTestId('template-designer-kind-detail').click();
    const palette = page.getByTestId('page-designer-palette');
    await expect(palette.getByText('Service Level Agreement (SLA)', { exact: true })).toBeVisible({ timeout: 7000 });
    await expect(palette.getByText('Attachments', { exact: true }).first()).toBeVisible();
    await expect(palette.getByText('Activity & Comments', { exact: true })).toBeVisible();
    await expect(palette.getByText('Merged Tickets', { exact: true })).toBeVisible();
    await expect(palette.getByText('Related Cases', { exact: true })).toBeVisible();
    await expect(palette.getByText('Asset Details', { exact: true })).toBeVisible();
    await expect(palette.getByText('Suggested Solutions', { exact: true })).toBeVisible();
    await expect(palette.getByText('Requester Details', { exact: true })).toBeVisible();
    await expect(palette.getByText('Status History', { exact: true })).toBeVisible();

    // Switch to Form Fields
    await page.getByTestId('catalog-section-fields').click();
    await expect(page.getByRole('button', { name: /Add field/i })).toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('SLA Policies module (/app/settings/sla) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/settings/sla');
    await expect(page.getByRole('heading', { name: 'SLA Policies' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'New policy' })).toBeVisible();
    await expect(page.getByText('Policy name')).toBeVisible();
    await expect(page.getByText('Targets by priority')).toBeVisible();
    await assertPageIsCleanEnglish(page);
  });

  test('Requester Portal renders clean English navigation and actions', async ({ page }) => {
    await mockAuthenticatedRequester(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/portal');
    await assertPageIsCleanEnglish(page);
  });

  // --- Focused SLA widget states ---

  test('Ticket Detail SLA widget: active SLA with time remaining', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      slaAssessment: {
        startedAt: new Date(Date.now() - 3600_000).toISOString(),
        responseDueAt: new Date(Date.now() + 7200_000).toISOString(),
        resolutionDueAt: new Date(Date.now() + 14400_000).toISOString(),
        responseTargetMinutes: 180,
        resolutionTargetMinutes: 300,
        responseBreached: false,
        resolutionBreached: false,
      },
    });
    await page.goto('/app/tickets/1');

    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('First response')).toBeVisible();
    await expect(page.getByText('Resolution')).toBeVisible();
    await expect(page.getByText(/remaining$/i).first()).toBeVisible();
    // Verify explicit English date format on deadline
    await expect(page.getByText(/Deadline:\s+[A-Za-z]{3}\s+\d+/i).first()).toBeVisible();

    // Assert absence of former Spanish strings
    await expect(page.getByText('restantes')).not.toBeVisible();
    await expect(page.getByText('Primera respuesta')).not.toBeVisible();
    await expect(page.getByText('RELOJ PAUSADO')).not.toBeVisible();
    await expect(page.getByText('Incumplido')).not.toBeVisible();
    await expect(page.getByText('Cumplido')).not.toBeVisible();
    await expect(page.getByText('Vencido hace')).not.toBeVisible();
    await expect(page.getByText('al pausar')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail SLA widget: paused SLA shows CLOCK PAUSED and time remaining when paused', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      slaAssessment: {
        startedAt: new Date(Date.now() - 7200_000).toISOString(),
        responseDueAt: new Date(Date.now() + 3600_000).toISOString(),
        resolutionDueAt: new Date(Date.now() + 10800_000).toISOString(),
        pausedAt: new Date(Date.now() - 1800_000).toISOString(),
        responseBreached: false,
        resolutionBreached: false,
      },
    });
    await page.goto('/app/tickets/1');

    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('CLOCK PAUSED')).toBeVisible();
    await expect(page.getByText(/remaining when paused/i).first()).toBeVisible();

    // Assert absence of former Spanish strings
    await expect(page.getByText('RELOJ PAUSADO')).not.toBeVisible();
    await expect(page.getByText('al pausar')).not.toBeVisible();
    await expect(page.getByText('restantes')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail SLA widget: overdue SLA shows Overdue by and Breached', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      slaAssessment: {
        startedAt: new Date(Date.now() - 14400_000).toISOString(),
        responseDueAt: new Date(Date.now() - 7200_000).toISOString(),
        resolutionDueAt: new Date(Date.now() - 3600_000).toISOString(),
        responseBreached: true,
        resolutionBreached: true,
      },
    });
    await page.goto('/app/tickets/1');

    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText(/Overdue by/i).first()).toBeVisible();

    // Assert absence of former Spanish strings
    await expect(page.getByText(/Vencido hace/i)).not.toBeVisible();
    await expect(page.getByText('restantes')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail SLA widget: completed and met SLA shows Met', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      slaAssessment: {
        startedAt: new Date(Date.now() - 14400_000).toISOString(),
        responseDueAt: new Date(Date.now() + 3600_000).toISOString(),
        resolutionDueAt: new Date(Date.now() + 7200_000).toISOString(),
        respondedAt: new Date(Date.now() - 7200_000).toISOString(),
        resolvedAt: new Date(Date.now() - 3600_000).toISOString(),
        responseBreached: false,
        resolutionBreached: false,
      },
    });
    await page.goto('/app/tickets/1');

    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Met').first()).toBeVisible();

    // Assert absence of former Spanish strings
    await expect(page.getByText('Cumplido')).not.toBeVisible();
    await expect(page.getByText('Incumplido')).not.toBeVisible();
    await expect(page.getByText('restantes')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail SLA widget: completed but breached SLA shows Breached', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      slaAssessment: {
        startedAt: new Date(Date.now() - 14400_000).toISOString(),
        responseDueAt: new Date(Date.now() - 7200_000).toISOString(),
        resolutionDueAt: new Date(Date.now() - 3600_000).toISOString(),
        respondedAt: new Date(Date.now() - 3600_000).toISOString(),
        resolvedAt: new Date(Date.now() - 1800_000).toISOString(),
        responseBreached: true,
        resolutionBreached: true,
      },
    });
    await page.goto('/app/tickets/1');

    await expect(page.getByRole('heading', { name: 'Service Level Agreement' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByText('Breached').first()).toBeVisible();

    // Assert absence of former Spanish strings
    await expect(page.getByText('Incumplido')).not.toBeVisible();
    await expect(page.getByText('Cumplido')).not.toBeVisible();
    await expect(page.getByText('restantes')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Ticket Detail SLA widget: loading state shows Calculating SLA targets…', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, { slaLoading: true });
    await page.goto('/app/tickets/1');

    await expect(page.getByText('Calculating SLA targets…')).toBeVisible({ timeout: 5000 });

    // Assert absence of former Spanish strings
    await expect(page.getByText('Calculando objetivos SLA…')).not.toBeVisible();
    await expect(page.getByText('Calculando objetivos SLA')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  // --- Focused Users & Roles scenarios ---

  test('Users & Roles: role creation form opens and renders "New role" header', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/admin/users');

    await expect(page.getByRole('heading', { name: 'Users, roles and organization' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Roles and permissions' })).toBeVisible();

    // Open the role creation form
    await page.getByTitle('Create role').click();
    await expect(page.getByRole('heading', { name: 'New role' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder('Name (e.g. CAB Approver)')).toBeVisible();

    // Assert absence of former Spanish string
    await expect(page.getByText('Nuevo rol')).not.toBeVisible();

    // Close form via Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'New role' })).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Users & Roles: user without organizational unit renders "No organizational unit"', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      users: [
        {
          username: 'no.unit.user',
          usuario_id: 'u-no-unit',
          nombre: 'No Unit User',
          email: 'nounit@example.com',
          role_id: 'admin',
          company_id: '',
          tiene_usuario: true,
        },
      ],
    });
    await page.goto('/app/admin/users');

    await expect(page.getByRole('heading', { name: 'Users, roles and organization' })).toBeVisible({ timeout: 7000 });

    // Switch to Users tab
    await page.getByRole('button', { name: 'Users' }).click();
    await expect(page.getByPlaceholder('Search by username, name or email…')).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('columnheader', { name: 'User' })).toBeVisible();
    await expect(page.getByText('No Unit User')).toBeVisible();

    // Assert exact English label and absence of Spanish
    await expect(page.getByText('No organizational unit')).toBeVisible();
    await expect(page.getByText('Sin unidad')).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  // --- Focused Assets / CMDB scenarios ---

  test('Assets / CMDB: formatOperationalIssue presentation helper maps all 5 known issues and unknown fallback', () => {
    // 1. INC failure
    expect(formatOperationalIssue('No se pudo consultar INC para este activo.')).toBe('Could not query INC for this asset.');
    // 2. PRB/RFC cascading issue when INC fails
    expect(formatOperationalIssue('INC no disponible: las coincidencias vía incidente pueden faltar.')).toBe('INC unavailable: matches via incident may be missing.');
    // 3. PRB direct failure
    expect(formatOperationalIssue('No se pudo consultar PRB directamente para este activo.')).toBe('Could not query PRB directly for this asset.');
    // 4. RFC cascading issue when PRB fails
    expect(formatOperationalIssue('PRB no disponible: las referencias PRB→RFC pueden faltar.')).toBe('PRB unavailable: PRB→RFC references may be missing.');
    // 5. RFC direct failure
    expect(formatOperationalIssue('No se pudo consultar RFC directamente para este activo.')).toBe('Could not query RFC directly for this asset.');

    // Unknown issue fallbacks: empty, Spanish, technical, and unspecified values
    expect(formatOperationalIssue('')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('   ')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('Error desconocido de conexión al microservicio')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('Fallo no documentado del servicio')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('HTTP 503 Service Unavailable: upstream timeout')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('ECONNREFUSED 127.0.0.1:8080')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(formatOperationalIssue('UNKNOWN_INTERNAL_ERROR_CODE')).toBe(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK);
    expect(UNKNOWN_OPERATIONAL_ISSUE_FALLBACK).toBe('Some operational history information is currently unavailable.');
    expect(Object.keys(KNOWN_OPERATIONAL_ISSUES)).toHaveLength(5);
  });

  test('Assets / CMDB: renders clean English UI chrome, controls, and card labels with Spanish business data separated', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);

    const siteId = '11111111-1111-1111-1111-111111111111';
    const cameraId = '22222222-2222-2222-2222-222222222222';

    await page.route('**/notifications?*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], noLeidas: 0 }) }),
    );
    await page.route('**/assets/sites?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: siteId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'site',
              externalId: '159',
              externalKey: 'sig_inventory/site/159',
              kind: 'site',
              assetType: 'site',
              displayName: 'Planta de Producción Medellín', // Business data legitimately in Spanish
              lifecycle: 'active',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
            {
              id: '33333333-3333-3333-3333-333333333333',
              sourceSystem: 'sig_inventory',
              externalEntity: 'site',
              externalId: '160',
              externalKey: 'sig_inventory/site/160',
              kind: 'site',
              assetType: 'site',
              displayName: 'Sede Administrativa Bogotá',
              lifecycle: 'active',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );
    await page.route(`**/assets/sites/${siteId}/assets?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: cameraId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'camera',
              externalId: '23',
              externalKey: 'sig_inventory/camera/23',
              kind: 'device',
              siteAssetId: siteId,
              assetType: 'camera',
              displayName: 'Cámara Térmica Puerta Norte', // Business data legitimately in Spanish
              lifecycle: 'active',
              manufacturer: 'Fábrica de Sensores Andina', // Business data legitimately in Spanish
              model: 'Modelo Serie 5',
              serial: 'SN-00921',
              ipAddress: '10.1.2.23',
              status: 'online',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );

    await page.goto('/app/assets');

    // Verify application chrome in English
    await expect(page.getByRole('heading', { name: 'Operational Inventory' })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Sync' })).toBeVisible();
    await expect(page.getByText('Available sites')).toBeVisible();
    await expect(page.getByPlaceholder('Search site…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure access' })).toBeVisible();

    // Verify filter dropdown
    const typeSelect = page.locator('select');
    await expect(typeSelect).toBeVisible();
    await expect(typeSelect.locator('option').first()).toHaveText('All types');

    // Verify device card definition terms (dt) strictly English and not Spanish
    const dtTexts = await page.locator('dt').allInnerTexts();
    expect(dtTexts).toContain('Type');
    expect(dtTexts).toContain('IP');
    expect(dtTexts).toContain('Manufacturer');
    expect(dtTexts).toContain('Model / serial');
    expect(dtTexts).not.toContain('Tipo');
    expect(dtTexts).not.toContain('Fabricante');

    // Verify bulk selection controls & labels
    const selectCheckbox = page.getByRole('checkbox', { name: 'Select Planta de Producción Medellín' });
    await expect(selectCheckbox).toBeVisible();
    await selectCheckbox.check();

    // Button label: "Select all ${sites.length} filtered sites"
    await expect(page.getByTestId('assets-select-all-filtered')).toHaveText('Select all 2 filtered sites');
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign organizational unit…' })).toBeVisible();

    // Verify clicking "Select all 2 filtered sites" changes label to "Clear selection"
    await page.getByTestId('assets-select-all-filtered').click();
    await expect(page.getByTestId('assets-select-all-filtered')).toHaveText('Clear selection');
    await expect(page.getByText('2 selected')).toBeVisible();

    // Verify "seleccionados" does not appear in selection controls
    const selectionCountText = (await page.getByText(/selected/).innerText()) ?? '';
    expect(selectionCountText).not.toContain('seleccionados');

    // Verify Spanish business data displays correctly without failing the page
    await expect(page.getByText('Planta de Producción Medellín').first()).toBeVisible();
    await expect(page.getByText('Fábrica de Sensores Andina')).toBeVisible();

    // Global forbidden check for unmistakable application chrome passes
    await assertPageIsCleanEnglish(page, 'Operational Inventory');
  });

  test('Assets / CMDB: operational history renders clean English explanation and provenance labels', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);

    const siteId = '11111111-1111-1111-1111-111111111111';
    const cameraId = '22222222-2222-2222-2222-222222222222';

    await page.route('**/notifications?*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], noLeidas: 0 }) }),
    );
    await page.route('**/assets/sites?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: siteId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'site',
              externalId: '159',
              externalKey: 'sig_inventory/site/159',
              kind: 'site',
              assetType: 'site',
              displayName: 'Bolton Volvo',
              lifecycle: 'active',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );
    await page.route(`**/assets/sites/${siteId}/assets?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: cameraId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'camera',
              externalId: '23',
              externalKey: 'sig_inventory/camera/23',
              kind: 'device',
              siteAssetId: siteId,
              assetType: 'camera',
              displayName: 'Camera 23',
              lifecycle: 'active',
              manufacturer: 'HIKVISION',
              model: 'DS-2CD2143G2-I',
              serial: 'ABC123',
              ipAddress: '10.1.2.23',
              status: 'online',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );

    // Complete operational history with 1 INC (direct), 1 PRB (via INC), 1 RFC (via PRB)
    await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '90042',
              humanId: 'INC-000582',
              entityKey: 'INC',
              state: 'abierto',
              data: { title: 'Network stream loss' },
              prioridad: 'alta',
              createdAt: '2026-08-30T10:00:00Z',
              assetContext: { siteAssetId: siteId, links: [] },
            },
          ],
          hasMore: false,
        }),
      }),
    );
    await page.route('**/problems/by-asset-context', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '90098',
              humanId: 'PRB-000098',
              entityKey: 'PRB',
              state: 'under_investigation',
              data: { title: 'Recurring switch reboot' },
              createdAt: '2026-08-30T10:00:00Z',
              updatedAt: '2026-08-30T10:00:00Z',
              associationPath: 'via_incident',
              viaEntityKey: 'INC',
              viaHumanId: 'INC-000582',
            },
          ],
          resolvedByRfcRefs: [{ rfcHumanId: 'RFC-000196', viaProblemHumanId: 'PRB-000098' }],
        }),
      }),
    );
    await page.route('**/changes/by-asset-context', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '90196',
              humanId: 'RFC-000196',
              entityKey: 'RFC',
              state: 'draft',
              data: { title: 'Firmware upgrade' },
              createdAt: '2026-08-30T10:00:00Z',
              updatedAt: '2026-08-30T10:00:00Z',
              associationPath: 'via_problem',
              viaEntityKey: 'PRB',
              viaHumanId: 'PRB-000098',
            },
          ],
        }),
      }),
    );

    await page.goto('/app/assets');
    await page.getByRole('button', { name: /Camera 23/ }).click();

    // Operational history heading & exact refined sentence
    await expect(page.getByText('Operational history of Camera 23')).toBeVisible();
    await expect(
      page.getByText('INC, PRB, and RFC records related to this asset—either directly or through an incident or problem whose snapshot contains it.'),
    ).toBeVisible();

    // Domain counters
    await expect(page.getByText('INC · 1')).toBeVisible();
    await expect(page.getByText('PRB · 1')).toBeVisible();
    await expect(page.getByText('RFC · 1')).toBeVisible();

    // Provenance labels
    await expect(page.getByText('Via INC-000582')).toBeVisible();
    await expect(page.getByText('Via PRB-000098')).toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Assets / CMDB: maps every known incomplete-history issue to clean English in tooltips and summary without raw Spanish', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);

    const siteId = '11111111-1111-1111-1111-111111111111';
    const cameraId = '22222222-2222-2222-2222-222222222222';

    await page.route('**/notifications?*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], noLeidas: 0 }) }),
    );
    await page.route('**/assets/sites?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: siteId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'site',
              externalId: '159',
              externalKey: 'sig_inventory/site/159',
              kind: 'site',
              assetType: 'site',
              displayName: 'Bolton Volvo',
              lifecycle: 'active',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );
    await page.route(`**/assets/sites/${siteId}/assets?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: cameraId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'camera',
              externalId: '23',
              externalKey: 'sig_inventory/camera/23',
              kind: 'device',
              siteAssetId: siteId,
              assetType: 'camera',
              displayName: 'Camera 23',
              lifecycle: 'active',
              manufacturer: 'HIKVISION',
              model: 'DS-2CD2143G2-I',
              serial: 'ABC123',
              ipAddress: '10.1.2.23',
              status: 'online',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );

    // Fail all three service domains to cause api.ts to produce all 5 known issues:
    // - INC fail: 'No se pudo consultar INC para este activo.'
    // - PRB cascade + direct fail: 'INC no disponible: las coincidencias vía incidente pueden faltar.', 'No se pudo consultar PRB directamente para este activo.'
    // - RFC cascade + direct fail: 'INC no disponible: las coincidencias vía incidente pueden faltar.', 'PRB no disponible: las referencias PRB→RFC pueden faltar.', 'No se pudo consultar RFC directamente para este activo.'
    await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) }),
    );
    await page.route('**/problems/by-asset-context', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) }),
    );
    await page.route('**/changes/by-asset-context', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) }),
    );

    await page.goto('/app/assets');
    await page.getByRole('button', { name: /Camera 23/ }).click();

    await expect(page.getByText('Operational history of Camera 23')).toBeVisible();

    // Verify each domain's warning badge text is "Partial" and not "Parcial"
    const incDomain = page.getByTestId('domain-inc');
    const prbDomain = page.getByTestId('domain-prb');
    const rfcDomain = page.getByTestId('domain-rfc');

    const incWarning = incDomain.getByTestId('domain-incomplete-warning');
    const prbWarning = prbDomain.getByTestId('domain-incomplete-warning');
    const rfcWarning = rfcDomain.getByTestId('domain-incomplete-warning');

    await expect(incWarning).toBeVisible();
    await expect(prbWarning).toBeVisible();
    await expect(rfcWarning).toBeVisible();

    expect(await incWarning.textContent()).toContain('Partial');
    expect(await prbWarning.textContent()).toContain('Partial');
    expect(await rfcWarning.textContent()).toContain('Partial');
    expect(await incWarning.textContent()).not.toContain('Parcial');
    expect(await prbWarning.textContent()).not.toContain('Parcial');
    expect(await rfcWarning.textContent()).not.toContain('Parcial');

    // Verify translated tooltips (title attributes)
    const incTitle = (await incWarning.getAttribute('title')) ?? '';
    const prbTitle = (await prbWarning.getAttribute('title')) ?? '';
    const rfcTitle = (await rfcWarning.getAttribute('title')) ?? '';

    expect(incTitle).toContain('Could not query INC for this asset.');
    expect(incTitle).not.toContain('No se pudo consultar');

    expect(prbTitle).toContain('INC unavailable: matches via incident may be missing.');
    expect(prbTitle).toContain('Could not query PRB directly for this asset.');
    expect(prbTitle).not.toContain('No se pudo consultar');
    expect(prbTitle).not.toContain('no disponible');

    expect(rfcTitle).toContain('INC unavailable: matches via incident may be missing.');
    expect(rfcTitle).toContain('PRB unavailable: PRB→RFC references may be missing.');
    expect(rfcTitle).toContain('Could not query RFC directly for this asset.');
    expect(rfcTitle).not.toContain('No se pudo consultar');
    expect(rfcTitle).not.toContain('no disponible');

    // Verify partial summary banner in English
    const summary = page.getByTestId('operational-history-partial-summary');
    await expect(summary).toBeVisible();
    const summaryText = (await summary.innerText()) ?? '';

    expect(summaryText).toContain('Partial history:');
    expect(summaryText).toContain('Could not query INC for this asset.');
    expect(summaryText).toContain('INC unavailable: matches via incident may be missing.');
    expect(summaryText).toContain('Could not query PRB directly for this asset.');
    expect(summaryText).toContain('PRB unavailable: PRB→RFC references may be missing.');
    expect(summaryText).toContain('Could not query RFC directly for this asset.');

    // Confirm no raw Spanish issues exist in summary
    expect(summaryText).not.toContain('No se pudo consultar');
    expect(summaryText).not.toContain('no disponible');

    // Verify empty state messages for partial domains
    await expect(incDomain.getByText('Could not determine whether there are related incidents.')).toBeVisible();
    await expect(prbDomain.getByText('Could not determine whether there are related problems.')).toBeVisible();
    await expect(rfcDomain.getByText('Could not determine whether there are related changes.')).toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Assets / CMDB: single and bulk organizational access dialogs render clean English UI', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page, {
      companies: [
        { id: 'c-it', name: 'Information Technology', type: 'departamento' },
        { id: 'c-sec', name: 'Security Operations', type: 'equipo' },
      ],
    });

    const siteId = '11111111-1111-1111-1111-111111111111';

    await page.route('**/notifications?*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], noLeidas: 0 }) }),
    );
    await page.route('**/assets/sites?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: siteId,
              sourceSystem: 'sig_inventory',
              externalEntity: 'site',
              externalId: '159',
              externalKey: 'sig_inventory/site/159',
              kind: 'site',
              assetType: 'site',
              displayName: 'Bolton Volvo',
              lifecycle: 'active',
              attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z',
              deleted: false,
            },
          ],
          hasMore: false,
          stale: false,
        }),
      }),
    );
    await page.route(`**/assets/sites/${siteId}/assets?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], hasMore: false, stale: false }),
      }),
    );

    await page.goto('/app/assets');

    // 1. Single site access editor
    await page.getByRole('button', { name: 'Configure access' }).click();
    const singleSection = page.locator('section[aria-label="Site organizational access"]');
    await expect(singleSection).toBeVisible();
    await expect(singleSection.getByRole('heading', { name: 'Access by organizational unit or team' })).toBeVisible();
    await expect(
      singleSection.getByText('Devices at this site inherit these organizational units. You can select multiple organizational units.'),
    ).toBeVisible();
    await expect(singleSection.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(singleSection.getByRole('button', { name: 'Save access' })).toBeVisible();

    // Close via close icon
    await singleSection.getByRole('button', { name: 'Close access configuration' }).click();
    await expect(singleSection).not.toBeVisible();

    // 2. Bulk access editor
    await page.getByRole('checkbox', { name: 'Select Bolton Volvo' }).check();
    await page.getByRole('button', { name: 'Assign organizational unit…' }).click();

    const bulkSection = page.getByTestId('assets-bulk-editor');
    await expect(bulkSection).toBeVisible();
    await expect(bulkSection.getByRole('heading', { name: 'Assign organizational unit to 1 sites' })).toBeVisible();
    await expect(
      bulkSection.getByText("Devices at each site inherit these organizational units, so you don't need to configure them one by one."),
    ).toBeVisible();

    // Mode switches
    await expect(bulkSection.getByTestId('assets-bulk-mode-add')).toHaveText('Add');
    await expect(bulkSection.getByTestId('assets-bulk-mode-remove')).toHaveText('Remove');
    await expect(bulkSection.getByTestId('assets-bulk-mode-replace')).toHaveText('Replace');

    // Click Replace to check specific mode explanation copy
    await bulkSection.getByTestId('assets-bulk-mode-replace').click();
    await expect(
      bulkSection.getByText('Replace keeps exactly the selected organizational units and discards any units each site had before.'),
    ).toBeVisible();

    await expect(bulkSection.getByTestId('assets-bulk-apply')).toHaveText('Apply to 1 sites');
    await expect(bulkSection.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Close bulk editor
    await bulkSection.getByRole('button', { name: 'Close bulk assignment' }).click();
    await expect(bulkSection).not.toBeVisible();

    await assertPageIsCleanEnglish(page);
  });

  test('Regression guard: no source file under FRONTEND/src contains test-only window globals', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const filesToScan: string[] = [];

    function collectFiles(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          filesToScan.push(fullPath);
        }
      }
    }

    collectFiles(srcDir);
    expect(filesToScan.length).toBeGreaterThan(10);

    const forbiddenPatterns = [
      '__formatOperationalIssue',
      'window.__',
      'window.__test',
    ];

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        expect(
          content.includes(pattern),
          `Production source file ${path.relative(srcDir, filePath)} must not contain test-only global "${pattern}"`,
        ).toBe(false);
      }
    }
  });
});
