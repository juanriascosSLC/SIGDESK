import { type Page } from '@playwright/test';
import { SIG_DESK_API_PORT } from './support';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const BASELINE_DIR = path.resolve(__dirname, '../test-results/theme-baseline');
export const FINAL_DIR = path.resolve(__dirname, '../test-results/theme-final');

export async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        -moz-transition-property: none !important;
        -webkit-transition-property: none !important;
        transition-property: none !important;
        -moz-animation: none !important;
        -webkit-animation: none !important;
        animation: none !important;
        transition-duration: 0s !important;
        animation-duration: 0s !important;
      }
    `,
  });
}

export async function waitForPageReady(page: Page) {
  await page.evaluate(async () => {
    if (document.fonts) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(200);
}

export async function setThemePreference(page: Page, theme: 'light' | 'dark' | 'system') {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: t }, version: 0 }));
    } catch {
      // Storage unavailable
    }
  }, theme);
}

const mockIncSpec = {
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

export async function setupThemeTestMocks(page: Page) {
  await page.route(
    (url) => url.port === String(SIG_DESK_API_PORT),
    async (route) => {
      const url = new URL(route.request().url());
      const { pathname } = url;

      if (pathname.startsWith('/v1/session') || pathname.startsWith('/me')) {
        return route.fallback();
      }
      if (pathname.startsWith('/notifications')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'notif-1',
                tipoEvento: 'ticket_created',
                canal: 'in_app',
                estado: 'sent',
                idioma: 'en',
                titulo: 'New Incident Assigned',
                cuerpo: 'INC-000001 has been assigned to your queue.',
                leida: false,
                creadaEn: '2026-09-01T10:00:00Z',
              },
            ],
            noLeidas: 1,
            unread: 1,
          }),
        });
      }

      if (pathname.match(/^\/tickets\/[^/]+\/merged/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: '2', title: 'Secondary latency spike', requesterDisplayName: 'Bob Smith' },
            ],
          }),
        });
      }

      if (pathname.match(/^\/tickets\/[^/]+\/activity/) || pathname.match(/^\/tickets\/[^/]+\/actividades/)) {
        const list = [
          {
            id: 'act-1',
            kind: 'status_changed',
            payload: { from: 'Open', to: 'In Progress' },
            createdAt: '2026-09-01T10:00:00Z',
          },
        ];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: list, entries: list, timeline: [] }),
        });
      }

      if (pathname.match(/^\/tickets\/[^/]+\/(comments|attachments|watchers)/)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      }

      if (pathname.match(/^\/entities\/INC\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'inc-v1',
            entityKey: 'INC',
            version: 1,
            specification: mockIncSpec,
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
            layouts: { detail: mockIncSpec.detailPage },
          }),
        });
      }

      if (pathname.match(/^\/entities\/INC\/[^/]+$/)) {
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
            mergedCount: 1,
            creadorNombre: 'Jane Doe',
            data: {
              title: 'Database connection pool timeout',
              description: 'Connection pool exhausted under high peak traffic.',
              priority: 'high',
            },
            assetContext: {
              links: [
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
            createdAt: '2026-09-01T08:00:00Z',
            updatedAt: '2026-09-01T09:30:00Z',
          }),
        });
      }

      if (pathname === '/entities/INC' || pathname.startsWith('/entities/INC?')) {
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
                createdAt: '2026-09-01T08:00:00Z',
                data: { title: 'Database connection pool timeout' },
              },
            ],
            total: 1,
          }),
        });
      }

      if (pathname.startsWith('/notifications')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'notif-1',
                title: 'Critical SLA alert',
                message: 'Ticket INC-000001 is approaching SLA response deadline.',
                read: false,
                createdAt: '2026-09-01T10:00:00Z',
                channel: 'in_app',
              },
            ],
            unread: 1,
          }),
        });
      }

      if (pathname.startsWith('/admin/permissions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entidades: ['tickets', 'cambios', 'problemas', 'roles', 'usuarios'],
            acciones: ['create', 'read', 'update', 'delete'],
            alcances: ['propio', 'equipo', 'depto', 'global'],
          }),
        });
      }

      if (pathname.startsWith('/admin/roles')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'role-admin',
                nombre: 'Administrator',
                descripcion: 'Full administrative access across all SIG-DESK entities.',
                permisos: ['tickets:read:global', 'roles:update:global', 'usuarios:update:global'],
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/admin/companies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'comp-1',
                nombre: 'SIG Systems',
                tipo: 'empresa',
                parent_id: null,
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/admin/users')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'user-1',
                nombre: 'Jane Doe',
                email: 'jane.doe@sig.systems',
                username: 'jdoe',
                company_id: 'comp-1',
                role_id: 'role-admin',
                roles: [{ id: 'role-admin', name: 'Administrator' }],
              },
            ],
          }),
        });
      }

      if (pathname.match(/^\/entities\/PRB\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'prb-v1',
            entityKey: 'PRB',
            version: 1,
            specification: {
              identity: { prefix: 'PRB' },
              lifecycle: {
                initialState: 'under_investigation',
                states: [
                  { key: 'under_investigation', label: 'Under investigation' },
                  { key: 'known_error', label: 'Known error' },
                  { key: 'resolved', label: 'Resolved' },
                ],
                transitions: [
                  { key: 'identify_workaround', from: 'under_investigation', to: 'known_error', label: 'Identify workaround' },
                  { key: 'resolve', from: 'under_investigation', to: 'resolved', label: 'Resolve' },
                ],
              },
              fields: [
                { key: 'title', label: 'Title', type: 'text', required: true },
                { key: 'rootCause', label: 'Root Cause', type: 'textarea' },
                { key: 'workaround', label: 'Workaround', type: 'textarea' },
              ],
              views: {
                edit: ['title', 'rootCause', 'workaround'],
              },
            },
          }),
        });
      }

      if (pathname.match(/^\/entities\/PRB\/[^/]+$/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            humanId: 'PRB-000001',
            entityKey: 'PRB',
            state: 'under_investigation',
            data: {
              title: 'Recurring DB connection saturation',
              rootCause: 'Connection pool leak under burst WebSocket requests.',
              workaround: 'Restart backend workers pool periodically.',
            },
            createdAt: '2026-09-01T08:00:00Z',
            updatedAt: '2026-09-01T09:30:00Z',
          }),
        });
      }

      if (pathname.startsWith('/entities/PRB')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'PRB-000001',
                entityKey: 'PRB',
                state: 'under_investigation',
                data: { title: 'Recurring DB connection saturation' },
              },
            ],
            total: 1,
          }),
        });
      }

      if (pathname.match(/^\/changes\/[^/]+\/manifest/) || pathname.match(/^\/entities\/RFC\/[^/]+\/manifest/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            definitionVersionId: 'rfc-v1',
            entityKey: 'RFC',
            version: 1,
            specification: {
              identity: { prefix: 'RFC' },
              lifecycle: {
                initialState: 'assessment',
                states: [
                  { key: 'draft', label: 'Draft' },
                  { key: 'assessment', label: 'Assessment' },
                  { key: 'cab_review', label: 'CAB Review' },
                  { key: 'scheduled', label: 'Scheduled' },
                  { key: 'implemented', label: 'Implemented' },
                ],
                transitions: [
                  { key: 'submit_to_cab', from: 'assessment', to: 'cab_review', label: 'Submit to CAB' },
                ],
              },
              fields: [
                { key: 'title', label: 'Title', type: 'text', required: true },
                { key: 'description', label: 'Description', type: 'textarea' },
                {
                  key: 'riskLevel',
                  label: 'Risk Level',
                  type: 'select',
                  options: [
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'critical', label: 'Critical' },
                  ],
                },
              ],
              detailLayout: {
                fields: [
                  { source: 'catalog', fieldKey: 'title', width: 'full' },
                  { source: 'catalog', fieldKey: 'description', width: 'full' },
                ],
              },
            },
          }),
        });
      }

      if (pathname.match(/^\/changes\/[^/]+$/) || pathname.match(/^\/entities\/RFC\/[^/]+$/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            humanId: 'RFC-000001',
            entityKey: 'RFC',
            state: 'assessment',
            data: {
              title: 'Upgrade PostgreSQL connection pool max_connections',
              description: 'Increase pool limit to 250 connections and add PgBouncer.',
              riskLevel: 'medium',
            },
            createdAt: '2026-09-01T08:00:00Z',
            updatedAt: '2026-09-01T09:30:00Z',
          }),
        });
      }

      if (pathname.startsWith('/entities/RFC')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'RFC-000001',
                entityKey: 'RFC',
                state: 'assessment',
                data: {
                  title: 'Upgrade PostgreSQL connection pool max_connections',
                  riskLevel: 'medium',
                },
              },
            ],
            total: 1,
          }),
        });
      }

      if (pathname.match(/^\/changes\/[^/]+\/tasks/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'task-1',
                humanId: 'TSK-001',
                title: 'Apply configuration tuning in staging',
                status: 'ready',
                priority: 'high',
                departmentId: 'department-it',
                teamId: 'team-it',
                assigneeUserId: 'user-it-1',
                required: true,
                dependencyIds: [],
                evidence: [],
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/sla/assessments')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entityId: '1',
            humanId: 'INC-000001',
            policyId: 'sla-gold',
            policyVersion: 1,
            definitionVersion: 1,
            priority: 'high',
            startedAt: '2026-09-01T08:00:00Z',
            responseDueAt: '2026-09-01T11:00:00Z',
            resolutionDueAt: '2026-09-01T16:00:00Z',
            responseTargetMinutes: 180,
            resolutionTargetMinutes: 480,
            respondedAt: '2026-09-01T10:00:00Z',
            resolvedAt: '2026-09-01T15:00:00Z',
            responseBreached: false,
            resolutionBreached: false,
            lastEventId: 'evt-1',
          }),
        });
      }

      if (pathname.startsWith('/sla/policies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'pol-1',
                resourceId: 'sla:gold',
                version: 1,
                calendar: { timezone: 'America/Bogota', alwaysOn: true },
                targets: [
                  { priority: 'critical', responseMinutes: 30, resolutionMinutes: 120 },
                  { priority: 'high', responseMinutes: 60, resolutionMinutes: 240 },
                ],
              },
            ],
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
                id: 'cat-inc',
                entityKey: 'INC',
                name: 'Incident Management',
                status: 'published',
                version: 1,
                specification: mockIncSpec,
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/organization/assignment-directory')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            departments: [
              { id: 'department-it', nombre: 'IT' },
              { id: 'department-services', nombre: 'Servicios' },
            ],
            teams: [
              { id: 'team-it', nombre: 'IT', department_id: 'department-it' },
              { id: 'team-services', nombre: 'Servicios', department_id: 'department-services' },
            ],
            assignees: [
              { id: 'user-it-1', nombre: 'Agente IT', email: 'it@sig.systems', team_id: 'team-it' },
              { id: 'user-services-1', nombre: 'Agente Services', email: 'services@sig.systems', team_id: 'team-services' },
            ],
          }),
        });
      }

      if (pathname.startsWith('/catalog/resources')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [] }),
        });
      }

      if (pathname === '/catalog' || pathname.startsWith('/catalog?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'cat-inc',
                entityKey: 'INC',
                name: 'Incident Management',
                status: 'published',
                version: 1,
                specification: mockIncSpec,
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/admin/catalog')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'cat-inc',
                entityKey: 'INC',
                name: 'Incident Management',
                status: 'published',
                version: 1,
                specification: mockIncSpec,
              },
            ],
          }),
        });
      }

      if (pathname.startsWith('/automations') || pathname.startsWith('/workflows')) {
        const triggerID = 'trigger-1';
        const conditionID = 'condition-1';
        const actionID = 'action-1';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'wf-1',
                categoria_id: 'INC',
                version: 1,
                estado: 'publicado',
                fecha_publicacion: '2026-09-01T12:00:00Z',
                layout: {
                  nodes: [
                    {
                      id: triggerID,
                      type: 'trigger',
                      position: { x: 80, y: 190 },
                      data: { catalogKey: 'ticket.created', label: 'Ticket Created', supportStatus: 'operational', color: 'cyan' },
                    },
                    {
                      id: conditionID,
                      type: 'condition',
                      position: { x: 420, y: 190 },
                      data: { catalogKey: 'condition.priority', label: 'Priority Check', supportStatus: 'operational', color: 'amber', priority: 'high' },
                    },
                    {
                      id: actionID,
                      type: 'action',
                      position: { x: 760, y: 190 },
                      data: { catalogKey: 'action.notify_stakeholders', label: 'Notify Team', supportStatus: 'operational', color: 'emerald' },
                    },
                  ],
                  edges: [
                    { id: 'e1', source: triggerID, target: conditionID },
                    { id: 'e2', source: conditionID, target: actionID, sourceHandle: 'yes' },
                  ],
                },
              },
            ],
          }),
        });
      }

      if (pathname === '/changes/tasks/assigned' || pathname.startsWith('/changes/tasks/assigned?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                task: {
                  id: 'task-services-theme',
                  humanId: 'TSK-000101',
                  changeId: 'rfc-theme',
                  title: 'Restore site connectivity',
                  description: 'Replace the failed switch and validate every camera.',
                  area: 'Services',
                  team: 'Field Services',
                  assigneeId: 'user-services-1',
                  departmentId: 'department-services',
                  teamId: 'team-services',
                  assigneeUserId: 'user-services-1',
                  organization: {
                    departmentId: 'department-services', departmentName: 'Services',
                    teamId: 'team-services', teamName: 'Field Services',
                    assigneeUserId: 'user-services-1', assigneeName: 'Morgan Lee',
                    assigneeEmail: 'services@sig.systems', capturedAt: '2026-09-01T08:00:00Z',
                  },
                  priority: 'high', required: true, status: 'ready', dependencyIds: [],
                  dueAt: null, blockedReason: '', evidence: [],
                  createdBy: 'user-it-1', createdAt: '2026-09-01T08:00:00Z',
                  updatedAt: '2026-09-01T08:00:00Z', completedAt: null,
                  assetContext: { siteAssetId: 'site-1', links: [] },
                },
                change: { id: 'rfc-theme', humanId: 'RFC-000050', state: 'implementing', title: 'Restore site connectivity' },
              },
            ],
          }),
        });
      }

      if (pathname === '/assets/sites' || pathname.startsWith('/assets/sites?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'site-1',
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
        });
      }

      if (pathname.match(/^\/assets\/sites\/[^/]+\/assets/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'SRV-001',
                sourceSystem: 'sig_inventory',
                externalEntity: 'camera',
                externalId: '23',
                externalKey: 'sig_inventory/camera/23',
                kind: 'device',
                siteAssetId: 'site-1',
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
        });
      }

      if (pathname.startsWith('/assets')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'SRV-001',
                displayName: 'Primary DB Server',
                category: 'Server',
                lifecycle: 'operational',
                site: 'Bogota DC',
                manufacturer: 'Dell Inc.',
                model: 'PowerEdge R740',
                serialNumber: 'SRV-DL-9921',
              },
            ],
            total: 1,
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    },
  );
}

export interface ContrastFailure {
  selector: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  threshold: number;
  fontSize: string;
  fontWeight: string;
}

export interface ContrastEvaluationResult {
  text: string;
  contrast: number;
  passNormal: boolean;
  passed: boolean;
  elementsTested: number;
  fg: string;
  bg: string;
  failures: ContrastFailure[];
}

// Contrast evaluation helper using relative luminance and ancestor alpha compositing
export async function evaluateElementContrast(
  page: Page,
  selector: string,
): Promise<ContrastEvaluationResult> {
  const result = await page.evaluate((sel) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    function parseColor(color: string): [number, number, number, number] {
      if (!color || color === 'transparent') return [0, 0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#00000000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    }

    function relativeLuminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function getEffectiveBackgroundColor(element: HTMLElement): [number, number, number] {
      let r = 241, g = 245, b = 249; // light theme default base (#f1f5f9)
      if (document.documentElement.classList.contains('dark')) {
        r = 2; g = 6; b = 23; // dark theme default base (#020617)
      }

      // Collect ancestor chain from documentElement down to element
      const chain: HTMLElement[] = [];
      let cur: HTMLElement | null = element;
      while (cur && cur !== document.documentElement) {
        chain.unshift(cur);
        cur = cur.parentElement;
      }

      for (const el of chain) {
        const bg = window.getComputedStyle(el).backgroundColor;
        const [cr, cg, cb, a] = parseColor(bg);
        if (a > 0) {
          r = Math.round(cr * a + r * (1 - a));
          g = Math.round(cg * a + g * (1 - a));
          b = Math.round(cb * a + b * (1 - a));
        }
      }

      return [r, g, b];
    }

    const elements = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const visibleElements = elements.filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    });

    if (visibleElements.length === 0) {
      return {
        missing: true,
        matchedCount: elements.length,
        visibleCount: 0,
      };
    }

    const failures: {
      selector: string;
      text: string;
      fg: string;
      bg: string;
      ratio: number;
      threshold: number;
      fontSize: string;
      fontWeight: string;
    }[] = [];

    let minRatio = Infinity;
    let sampleText = '';
    let sampleFg = '';
    let sampleBg = '';

    visibleElements.forEach((el, index) => {
      const style = window.getComputedStyle(el);
      const [fr, fg, fb] = parseColor(style.color);
      const [br, bgVal, bb] = getEffectiveBackgroundColor(el);

      const l1 = relativeLuminance(fr, fg, fb);
      const l2 = relativeLuminance(br, bgVal, bb);
      const ratio = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;

      if (ratio < minRatio) {
        minRatio = ratio;
      }

      const fontSizePx = parseFloat(style.fontSize) || 16;
      const fontWeight = parseInt(style.fontWeight, 10) || 400;
      // WCAG 2.1: Large text is >= 24px (18pt) or >= 18.66px (14pt) if bold (>= 700)
      const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
      const requiredThreshold = isLargeText ? 3.0 : 4.5;

      const rawText = el.innerText ? el.innerText.trim().slice(0, 50) : (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || '';

      if (index === 0) {
        sampleText = rawText;
        sampleFg = `rgb(${fr}, ${fg}, ${fb})`;
        sampleBg = `rgb(${br}, ${bgVal}, ${bb})`;
      }

      if (ratio < requiredThreshold) {
        failures.push({
          selector: sel,
          text: rawText,
          fg: `rgb(${fr}, ${fg}, ${fb})`,
          bg: `rgb(${br}, ${bgVal}, ${bb})`,
          ratio,
          threshold: requiredThreshold,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        });
      }
    });

    return {
      missing: false,
      text: sampleText,
      contrast: minRatio === Infinity ? 21 : minRatio,
      passNormal: failures.length === 0,
      passed: failures.length === 0,
      elementsTested: visibleElements.length,
      fg: sampleFg,
      bg: sampleBg,
      failures,
    };
  }, selector);

  if (result.missing) {
    throw new Error(
      `evaluateElementContrast: Selector "${selector}" did not match any visible elements (DOM matches: ${result.matchedCount}, visible: 0).`,
    );
  }

  return result as ContrastEvaluationResult;
}
