import { expect, test } from '@playwright/test';
import type { Edge } from '@xyflow/react';
import { catalogItem, compileVisualWorkflow, graphFromDefinition, nodeFromCatalog } from '../src/features/automations/visual-model';
import type { WorkflowNode } from '../src/features/automations/CustomNodes';

// El plan ejecutable compilado desde el canvas.
//
// Lo que se comprueba es la propiedad que da sentido a toda la vertical: que el
// ORDEN DIBUJADO sea el orden publicado. Antes, cada acción se publicaba como
// una regla independiente y el runtime las ordenaba por su espera, así que
// conectar «Asignar → Cambiar estado» no establecía nada.

/** grafo arma un diagrama con ids estables y legibles en los fallos. */
function grafo(): { nodes: WorkflowNode[]; edges: Edge[] } {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  trigger.id = 'trigger-1';
  const condition = nodeFromCatalog(catalogItem('condition.priority')!, { x: 200, y: 0 });
  condition.id = 'condition-1';
  condition.data.conditionMode = 'always';
  const assign = nodeFromCatalog(catalogItem('action.assign')!, { x: 400, y: 0 });
  assign.id = 'assignment-1';
  assign.data.departmentId = 'department-it';
  assign.data.teamId = 'team-it';
  const status = nodeFromCatalog(catalogItem('action.change_status')!, { x: 600, y: 0 });
  status.id = 'state-1';
  status.data.transitionKey = 'start-work';
  status.data.transitionFrom = 'open';
  status.data.transitionTo = 'in_progress';
  return {
    nodes: [trigger, condition, assign, status],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'condition-1' },
      { id: 'e2', source: 'condition-1', target: 'assignment-1', sourceHandle: 'yes' },
      { id: 'e3', source: 'assignment-1', target: 'state-1' },
    ],
  };
}

function porID(plan: { nodes: Array<{ id: string }> }) {
  return new Map(plan.nodes.map((nodo) => [nodo.id, nodo] as const));
}

test('el plan publicado sigue las conexiones: asignar y después cambiar estado', () => {
  const { nodes, edges } = grafo();

  const resultado = compileVisualWorkflow(nodes, edges, 1);

  expect(resultado.errors).toEqual([]);
  const plan = resultado.payload?.execution_plan;
  expect(plan).toBeTruthy();
  expect(plan!.version).toBe(1);
  expect(plan!.entrypoints).toEqual(['trigger-1']);

  const nodos = porID(plan!);
  expect(nodos.get('trigger-1')).toMatchObject({ kind: 'trigger', type: 'ticket_created', next: ['condition-1'] });
  expect(nodos.get('condition-1')).toMatchObject({ kind: 'condition', on_true: ['assignment-1'] });
  expect(nodos.get('assignment-1')).toMatchObject({ kind: 'action', action: 'asignar_automatico', next: ['state-1'] });
  expect(nodos.get('state-1')).toMatchObject({ kind: 'action', action: 'cambiar_estado_ticket' });
  expect((nodos.get('state-1') as { next?: string[] }).next ?? []).toEqual([]);
});

test('invertir las conexiones invierte el plan y nada más', () => {
  const { nodes } = grafo();
  const invertido: Edge[] = [
    { id: 'e1', source: 'trigger-1', target: 'condition-1' },
    { id: 'e2', source: 'condition-1', target: 'state-1', sourceHandle: 'yes' },
    { id: 'e3', source: 'state-1', target: 'assignment-1' },
  ];

  const plan = compileVisualWorkflow(nodes, invertido, 1).payload?.execution_plan;

  const nodos = porID(plan!);
  expect(nodos.get('condition-1')).toMatchObject({ on_true: ['state-1'] });
  expect(nodos.get('state-1')).toMatchObject({ next: ['assignment-1'] });
  expect((nodos.get('assignment-1') as { next?: string[] }).next ?? []).toEqual([]);
});

test('el id de cada regla es el id de su nodo', () => {
  const { nodes, edges } = compileGrafoConDosAcciones();

  const resultado = compileVisualWorkflow(nodes, edges, 1);

  expect(resultado.errors).toEqual([]);
  const ids = (resultado.payload?.reglas ?? []).map((regla) => regla.id).sort();
  expect(ids).toEqual(['assignment-1', 'state-1']);
  // Y el plan referencia exactamente esos ids: si no coincidieran, el backend
  // rechazaría la publicación porque el plan hablaría de acciones sin regla.
  const accionesDelPlan = (resultado.payload?.execution_plan?.nodes ?? [])
    .filter((nodo) => nodo.kind === 'action').map((nodo) => nodo.id).sort();
  expect(accionesDelPlan).toEqual(ids);
});

function compileGrafoConDosAcciones() {
  return grafo();
}

test('la rama falsa se publica como on_false y no como una salida más', () => {
  const { nodes } = grafo();
  const conRamaFalsa: Edge[] = [
    { id: 'e1', source: 'trigger-1', target: 'condition-1' },
    { id: 'e2', source: 'condition-1', target: 'assignment-1', sourceHandle: 'yes' },
    { id: 'e3', source: 'condition-1', target: 'state-1', sourceHandle: 'no' },
  ];

  const plan = compileVisualWorkflow(nodes, conRamaFalsa, 1).payload?.execution_plan;

  const condicion = porID(plan!).get('condition-1') as { on_true?: string[]; on_false?: string[]; next?: string[] };
  expect(condicion.on_true).toEqual(['assignment-1']);
  expect(condicion.on_false).toEqual(['state-1']);
  expect(condicion.next).toBeUndefined();
});

// Una conexión guardada SIN handle es la rama verdadera. Es como se dibujaban
// las condiciones antes de que existiera la salida «No», y un diagrama guardado
// entonces tiene que seguir significando lo mismo.
test('una conexión sin handle sigue siendo la rama verdadera', () => {
  const { nodes } = grafo();
  const sinHandle: Edge[] = [
    { id: 'e1', source: 'trigger-1', target: 'condition-1' },
    { id: 'e2', source: 'condition-1', target: 'assignment-1' },
    { id: 'e3', source: 'assignment-1', target: 'state-1' },
  ];

  const plan = compileVisualWorkflow(nodes, sinHandle, 1).payload?.execution_plan;

  expect(porID(plan!).get('condition-1')).toMatchObject({ on_true: ['assignment-1'] });
});

test('el plan es idéntico aunque cambie el orden del arreglo de nodos', () => {
  const { nodes, edges } = grafo();
  const revuelto = [nodes[3], nodes[0], nodes[2], nodes[1]];

  const uno = compileVisualWorkflow(nodes, edges, 1).payload?.execution_plan;
  const otro = compileVisualWorkflow(revuelto, edges, 1).payload?.execution_plan;

  expect(JSON.stringify(otro)).toBe(JSON.stringify(uno));
});

test('cambiar estado sin transición no se publica', () => {
  const { nodes, edges } = grafo();
  const sinTransicion = nodes.map((nodo) => (nodo.id === 'state-1'
    ? { ...nodo, data: { ...nodo.data, transitionKey: '' } }
    : nodo));

  const resultado = compileVisualWorkflow(sinTransicion, edges, 1);

  expect(resultado.payload).toBeUndefined();
  expect(resultado.errors.join(' ')).toContain('Select a transition');
  expect(resultado.issues.some((issue) => issue.nodeId === 'state-1')).toBe(true);
});

// Una transición que Catalog Builder ya no publica bloquea la publicación y NO
// se borra: limpiarla sola cambiaría lo que hace el flujo sin decidirlo nadie.
test('una transición que ya no existe bloquea la publicación y se conserva', () => {
  const { nodes, edges } = grafo();
  const conFantasma = nodes.map((nodo) => (nodo.id === 'state-1'
    ? { ...nodo, data: { ...nodo.data, transitionKey: 'transicion-borrada', missingReferences: ['la transición “transicion-borrada”'] } }
    : nodo));

  const resultado = compileVisualWorkflow(conFantasma, edges, 1);

  expect(resultado.payload).toBeUndefined();
  expect(resultado.errors.join(' ')).toContain('Entity Builder no longer publishes');
  // La configuración sigue en el nodo: el compilador no la toca.
  const nodo = conFantasma.find((candidato) => candidato.id === 'state-1');
  expect(nodo?.data.transitionKey).toBe('transicion-borrada');
});

test('la espera se publica como un nodo del plan, en su posición', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  trigger.id = 'trigger-1';
  const delay = nodeFromCatalog(catalogItem('control.delay')!, { x: 200, y: 0 });
  delay.id = 'delay-1';
  delay.data.delayValue = '15';
  delay.data.delayUnit = 'minutes';
  const status = nodeFromCatalog(catalogItem('action.change_status')!, { x: 400, y: 0 });
  status.id = 'state-1';
  status.data.transitionKey = 'start-work';

  const resultado = compileVisualWorkflow([trigger, delay, status], [
    { id: 'e1', source: 'trigger-1', target: 'delay-1' },
    { id: 'e2', source: 'delay-1', target: 'state-1' },
  ], 1);

  expect(resultado.errors).toEqual([]);
  const nodos = porID(resultado.payload!.execution_plan!);
  expect(nodos.get('delay-1')).toMatchObject({ kind: 'delay', delay_seconds: 900, next: ['state-1'] });
  // Y la regla conserva su demora por compatibilidad con el camino legado.
  expect(resultado.payload?.reglas[0].demora_segundos).toBe(900);
});

// Un bloque en preparación conectado ya bloquea la publicación; lo que se
// comprueba aquí es que uno SUELTO no entre en el plan, para que el backend no
// lo rechace por una acción que el canvas avisa que no se publicará.
test('un bloque en preparación suelto no entra en el plan', () => {
  const { nodes, edges } = grafo();
  const futuro = nodeFromCatalog(catalogItem('action.webhook')!, { x: 800, y: 200 });
  futuro.id = 'webhook-futuro';

  const resultado = compileVisualWorkflow([...nodes, futuro], edges, 1);

  expect(resultado.errors).toEqual([]);
  expect(resultado.warnings.join(' ')).toContain('future design');
  const ids = (resultado.payload?.execution_plan?.nodes ?? []).map((nodo) => nodo.id);
  expect(ids).not.toContain('webhook-futuro');
});

// Un workflow LEGADO sin layout se reconstruye con el id de la regla como id
// del nodo. Es lo que permite clonarlo, compilarlo al plan nuevo y conservar la
// identidad de sus reglas —y con ella, su historial.
test('un workflow legado sin layout se reconstruye con los ids de sus reglas', () => {
  const { nodes } = graphFromDefinition({
    id: 'wf-legado', categoria_id: 'INC', version: 4, estado: 'publicado',
    reglas: [{
      id: 'regla-historica', accion: 'asignar_automatico', condicion: 'siempre', demora_segundos: 0,
      config: { mode: 'team', department_id: 'department-it', team_id: 'team-it', overwrite_existing: false },
    }],
  });

  const accion = nodes.find((nodo) => nodo.type === 'action');
  expect(accion?.id).toBe('regla-historica');
});
