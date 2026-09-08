import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Diseñador de Automations contra la PILA REAL.
 *
 * Todo lo que hace el usuario en el diseñador son acciones reales: arrastrar
 * bloques, conectar nodos, mover nodos, elegir en los desplegables, guardar,
 * recargar y publicar. Ninguna de esas acciones se sustituye por una llamada a
 * la API.
 *
 * # Las dos rutas interceptadas, y por qué
 *
 * Solo las de AUTENTICACIÓN:
 *
 *   - `GET /api/v1/web-auth/me/` — la identidad corporativa de SIGTools.
 *   - `POST /v1/session` — el canje de esa credencial por una sesión de
 *     SIG-DESK.
 *
 * En este entorno SIGTools no está disponible (`api.sig.systems:8091` no
 * responde a la ruta de autenticación), así que no hay forma de hacer un login
 * de usuario de verdad. Se prepara la sesión y a partir de ahí TODO va al
 * backend real: el directorio de Organization, el guardado del borrador, la
 * relectura, la validación y la publicación.
 *
 * Es una desviación consciente del "no interceptar rutas", limitada al login y
 * anotada aquí para que nadie la confunda con un diseñador simulado. Ninguna
 * acción del diseñador se sustituye por una llamada a la API.
 *
 * # Requisitos
 *
 * La pila levantada (`BACKEND/scripts/start-local-services.ps1`) y
 * `PLAYWRIGHT_LIVE_STACK=1`. Sin esa variable la suite se salta: `npm run
 * test:e2e` en una máquina sin pila no debe fallar por algo que no es un
 * defecto del código.
 */

const PILA_REAL = process.env.PLAYWRIGHT_LIVE_STACK === '1';
const API = (process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const JWT_SECRET = process.env.PLAYWRIGHT_JWT_SECRET ?? 'dev-only-change-me-do-not-use-in-prod';
// Correction "ORGANIZATION RESIDUE, run-beta-release-gate.ps1" (2026-09-07):
// esta prueba limpia lo que siembra por psql directo contra la base real de
// Organization/Workflow (ver `limpiar` más abajo) — tiene que apuntar a la
// base DESECHABLE que la compuerta esté usando en esta corrida, nunca a
// '..._local' a secas. Sin PLAYWRIGHT_DATABASE_SUFFIX (un desarrollador
// corriendo `npm run test:e2e` a mano contra su propia pila local) el
// default 'local' sigue siendo correcto.
const DATABASE_SUFFIX = process.env.PLAYWRIGHT_DATABASE_SUFFIX ?? 'local';

test.skip(!PILA_REAL, 'Requiere la pila real: exporta PLAYWRIGHT_LIVE_STACK=1');

/** Firma un JWT HS256 con permiso total, igual que la compuerta beta.
 *
 *  Es la credencial de la sesión preparada; no sustituye ninguna acción del
 *  usuario dentro del diseñador. */
function firmarJWT(sub: string): string {
  const b64 = (valor: string) =>
    Buffer.from(valor).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cabecera = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = b64(JSON.stringify({
    sub,
    exp: Math.floor(Date.now() / 1000) + 7200,
    permissions: ['*'],
  }));
  const firma = createHmac('sha256', JWT_SECRET)
    .update(`${cabecera}.${cuerpo}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${cabecera}.${cuerpo}.${firma}`;
}

const TOKEN = firmarJWT('00000000-0000-0000-0000-000000000003');

/** prepararSesion intercepta ÚNICAMENTE las dos rutas del login. */
async function prepararSesion(page: Page) {
  // Identidad corporativa. SIGTools vive en su propio origen.
  await page.route('**/api/v1/web-auth/me/', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 1, name: 'Administrador Live', email: 'juan.riascos@sig.systems', username: 'jriascos',
    }),
  }));
  await page.route('**/v1/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: TOKEN,
      expires_in: 7200,
      role_id: '00000000-0000-0000-0000-000000000002',
      permissions: ['*'],
      access_level: 'global',
    }),
  }));
}

/** llamarAPI habla con el backend real. Se usa solo para PREPARAR datos y para
 *  COMPROBAR efectos, nunca para hacer lo que el usuario debe hacer con el
 *  ratón. */
async function llamarAPI<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) {
    throw new Error(`${metodo} ${ruta} devolvió ${respuesta.status}: ${await respuesta.text()}`);
  }
  return (await respuesta.json()) as T;
}

/** capturarConsola registra errores y fallos de red de la página.
 *
 *  Un `console.error` no rompe ninguna aserción por sí solo, así que sin esto
 *  la interfaz podría estar lanzando excepciones en cada render y la prueba
 *  pasaría igual. */
function capturarConsola(page: Page): string[] {
  const problemas: string[] = [];
  page.on('console', (mensaje: ConsoleMessage) => {
    if (mensaje.type() === 'error') problemas.push(`console.error: ${mensaje.text()}`);
  });
  page.on('pageerror', (error) => problemas.push(`pageerror: ${error.message}`));
  return problemas;
}

/** sembrarDestino crea un área, un equipo, un rol con capacidad de tickets y una
 *  persona, por las APIs reales de Organization. Es preparación de datos. */
async function sembrarDestino(marca: string) {
  // El departamento necesita su empresa como parent; se toma la que exista.
  const arbol = await llamarAPI<{ items?: Array<{ id: string; tipo: string }> }>('GET', '/admin/companies')
    .catch(() => ({ items: [] as Array<{ id: string; tipo: string }> }));
  const raiz = (arbol.items ?? []).find((nodo) => nodo.tipo === 'empresa');
  if (!raiz) throw new Error('no hay empresa raíz en Organization: siembra la estructura antes');

  const depto = await llamarAPI<{ id: string; nombre: string }>('POST', '/companies', {
    nombre: `Área ${marca}`, tipo: 'departamento', parent_id: raiz.id,
  });
  const equipo = await llamarAPI<{ id: string; nombre: string }>('POST', '/companies', {
    nombre: `Equipo ${marca}`, tipo: 'equipo', parent_id: depto.id,
  });
  const rol = await llamarAPI<{ id: string }>('POST', '/roles', {
    nombre: `Rol ${marca}`, descripcion: 'diseñador live',
  });
  await llamarAPI('PATCH', `/roles/${rol.id}/permisos`, {
    permisos: [
      { entidad: 'tickets', accion: 'update', alcance: 'global' },
      { entidad: 'tickets', accion: 'read', alcance: 'global' },
    ],
  });
  const persona = await llamarAPI<{ id: string; nombre: string }>('POST', '/usuarios', {
    nombre: `Persona ${marca}`, email: `${marca.toLowerCase()}@live.local`,
    company_id: equipo.id, role_id: rol.id,
  });
  return { depto, equipo, persona };
}

/** psql ejecuta SQL contra una base local. Se usa SOLO para limpiar lo que esta
 *  prueba creó, por id o por marca exacta: la compuerta exige no dejar residuo,
 *  y Organization no expone borrado de áreas ni de personas. */
function psql(base: string, sql: string) {
  execFileSync('docker', ['exec', '-i', 'backend-postgres-1', 'psql', '-U', 'sigdesk', '-d', base, '-q', '-c', sql],
    { stdio: 'pipe' });
}

/** limpiar borra EXCLUSIVAMENTE los registros de esta corrida. Ni un DELETE sin
 *  WHERE ni un borrado por patrón amplio. */
function limpiar(marca: string) {
  const como = `'%${marca}%'`;
  psql(`sigdesk_workflow_${DATABASE_SUFFIX}`, `
    DELETE FROM workflow_auditoria WHERE workflow_id IN (SELECT id FROM workflows WHERE categoria_id LIKE ${como});
    DELETE FROM workflow_outbox    WHERE workflow_id IN (SELECT id FROM workflows WHERE categoria_id LIKE ${como});
    DELETE FROM workflow_ejecuciones WHERE workflow_id IN (SELECT id FROM workflows WHERE categoria_id LIKE ${como});
    DELETE FROM workflow_reglas    WHERE workflow_id IN (SELECT id FROM workflows WHERE categoria_id LIKE ${como});
    DELETE FROM workflows WHERE categoria_id LIKE ${como};`);
  psql(`sigdesk_organization_${DATABASE_SUFFIX}`, `
    DELETE FROM usuarios WHERE nombre LIKE ${como};
    DELETE FROM permisos WHERE role_id IN (SELECT id FROM roles WHERE nombre LIKE ${como});
    DELETE FROM roles WHERE nombre LIKE ${como};
    DELETE FROM companies WHERE nombre LIKE ${como};`);
}

test.describe('diseñador de Automations sobre la pila real', () => {
  // La marca y los workflows creados se registran a medida que aparecen, y el
  // hook de limpieza corre SIEMPRE: si la prueba falla a mitad, lo ya creado se
  // borra igual y la compuerta no encuentra residuo.
  let marcaActual = '';
  const workflowsCreados: string[] = [];

  test.afterEach(() => {
    for (const id of workflowsCreados) {
      psql(`sigdesk_workflow_${DATABASE_SUFFIX}`, `
        DELETE FROM workflow_auditoria WHERE workflow_id = '${id}';
        DELETE FROM workflow_outbox WHERE workflow_id = '${id}';
        DELETE FROM workflow_ejecuciones WHERE workflow_id = '${id}';
        DELETE FROM workflow_reglas WHERE workflow_id = '${id}';
        DELETE FROM workflows WHERE id = '${id}';`);
    }
    workflowsCreados.length = 0;
    if (marcaActual) limpiar(marcaActual);
    marcaActual = '';
  });

  test('un administrador diseña, guarda, recarga, corrige y publica con el ratón', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const problemas = capturarConsola(page);
    const marca = `LIVE${Date.now().toString().slice(-6)}`;
    marcaActual = marca;
    const destino = await sembrarDestino(marca);

    await prepararSesion(page);
    await page.goto('/app/automations/new');
    await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();

    // ── Arrastrar el bloque de asignación al canvas, de verdad ────────────
    //
    // Primero se filtra la paleta escribiendo en su buscador —también una
    // acción real—. Sin filtrar, la lista larga se desplaza entre el mousedown
    // y el drop y termina arrastrándose un bloque distinto del que se agarró:
    // pasó, y el canvas acabó con un disparador "Estado modificado".
    const canvas = page.locator('.react-flow__pane');
    await page.getByPlaceholder('Search block…').fill('Assign autom');
    const bloque = page.getByRole('button', { name: /Assign Automatically/ });
    await expect(bloque).toHaveCount(1);
    await expect(bloque).toBeVisible();

    const nodos = page.locator('.react-flow__node');
    const antes = await nodos.count();
    await bloque.dragTo(canvas, { targetPosition: { x: 520, y: 260 } });
    await expect(nodos).toHaveCount(antes + 1);
    await expect(page.getByTestId('canvas-dirty')).toHaveText('Unsaved changes');

    // ── Conectar el disparador con la acción, arrastrando el conector ─────
    //
    // Sin esta conexión el compilador marca la acción como "no conectada al
    // disparador" y la publicación queda bloqueada — con razón: un bloque
    // suelto en el lienzo no se ejecuta.
    const nodoAsignacion = nodos.filter({ hasText: 'Assign Automatically' }).first();
    const nodoTrigger = nodos.filter({ hasText: 'INC Created' }).first();

    // "Ordenar" encuadra el diagrama antes de conectar.
    //
    // Es necesario, no cosmético: recién soltado el bloque, el conector de
    // salida del disparador quedaba en y≈1435 con un viewport de 720, o sea
    // fuera de vista, y el mousedown no caía sobre él —la línea de conexión no
    // llegaba a arrancar—. Es además lo que haría una persona: ordenar el
    // lienzo para ver lo que va a conectar.
    await page.getByRole('button', { name: 'Arrange' }).click();
    await page.waitForTimeout(700);
    const conexionesIniciales = await page.locator('.react-flow__edge').count();

    const salida = nodoTrigger.locator('.react-flow__handle-right').first();
    const entrada = nodoAsignacion.locator('.react-flow__handle-left').first();
    const cajaEntrada = await entrada.boundingBox();
    const cajaSalida = await salida.boundingBox();
    if (!cajaEntrada || !cajaSalida) throw new Error('los conectores no son visibles');
    await salida.hover();
    await page.mouse.down();
    // Un movimiento CORTO justo después de apretar arranca la línea de
    // conexión; sin él React Flow no considera que haya empezado a conectar y
    // el arrastre termina sin crear nada.
    await page.mouse.move(cajaSalida.x + 20, cajaSalida.y, { steps: 5 });
    await page.mouse.move(cajaEntrada.x + cajaEntrada.width / 2, cajaEntrada.y + cajaEntrada.height / 2, { steps: 15 });
    await page.waitForTimeout(150);
    // Y un hover final sobre el conector de destino: los conectores miden unos
    // seis píxeles, así que hay que asegurarse de estar encima antes de soltar.
    await entrada.hover({ force: true }).catch(() => undefined);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.locator('.react-flow__edge')).toHaveCount(conexionesIniciales + 1);

    // ── Configurar el destino con los desplegables reales ─────────────────
    await nodoAsignacion.click();
    await expect(page.getByTestId('assignment-editor')).toBeVisible();
    await page.getByTestId('assignment-mode-user').click();

    // El directorio viene de Organization REAL, sin interceptar nada.
    await page.getByRole('combobox', { name: 'Area' }).selectOption({ label: destino.depto.nombre });
    await page.getByRole('combobox', { name: 'Team' }).selectOption({ label: destino.equipo.nombre });
    await page.getByRole('combobox', { name: 'Person' })
      .selectOption({ label: `${destino.persona.nombre} · ${marca.toLowerCase()}@live.local` });
    await expect(nodoAsignacion).toContainText(destino.persona.nombre);

    // ── Mover el nodo con el ratón y recordar dónde quedó ─────────────────
    const cajaAntes = await nodoAsignacion.boundingBox();
    if (!cajaAntes) throw new Error('el nodo de asignación no es visible');
    // El arranque va con `hover()` y NO con un `mouse.move` a coordenadas.
    //
    // React Flow arrastra con d3-drag, que solo empieza si el puntero llegó al
    // nodo con la secuencia de movimiento que `hover()` produce. Con un
    // `mouse.move` directo —y también con `dragTo`— el nodo no se movía ni un
    // píxel, y la prueba parecía decir que arrastrar estaba roto cuando lo
    // roto era la forma de simularlo.
    await nodoAsignacion.hover();
    await page.mouse.down();
    const centroX = cajaAntes.x + cajaAntes.width / 2;
    const centroY = cajaAntes.y + cajaAntes.height / 2;
    await page.mouse.move(centroX + 10, centroY + 10);
    await page.mouse.move(centroX + 140, centroY + 110, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const cajaMovida = await nodoAsignacion.boundingBox();
    if (!cajaMovida) throw new Error('el nodo desapareció al moverlo');
    expect(Math.abs(cajaMovida.x - cajaAntes.x)).toBeGreaterThan(40);

    // ── Guardar el borrador: POST real ────────────────────────────────────
    await page.getByTestId('canvas-save-draft').click();
    await page.waitForURL(/\/app\/automations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByTestId('canvas-estado')).toContainText('Draft');

    // ── Recargar y comprobar que el diagrama vuelve igual ────────────────
    //
    // NO se comparan coordenadas de pantalla: al montar, React Flow reencuadra
    // el grafo (`fitView`), así que la misma posición del modelo aparece en
    // píxeles distintos. Comparar píxeles daba un desfase de 430 y parecía una
    // pérdida de posiciones que no existía.
    //
    // Lo que sí debe conservarse es la POSICIÓN DEL MODELO y la geometría
    // relativa entre nodos, que es lo que una persona reconoce como "el
    // diagrama está igual".
    const idBorrador = page.url().split('/').pop()!;
    workflowsCreados.push(idBorrador);
    type Layout = { nodes: Array<{ id: string; position: { x: number; y: number }; data: Record<string, unknown> }>; edges: unknown[] };
    const guardado = await llamarAPI<{ layout: Layout }>('GET', `/workflows/${idBorrador}`);
    const asignacionGuardada = guardado.layout.nodes.find((n) => n.data.catalogKey === 'action.assign');
    expect(asignacionGuardada, 'el layout guardado debe incluir el bloque de asignación').toBeTruthy();

    const conexionesAntes = await page.locator('.react-flow__edge').count();
    const cajaTriggerAntes = await page.locator('.react-flow__node').filter({ hasText: 'INC Created' }).first().boundingBox();

    await page.reload();
    await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
    const nodoTrasRecarga = page.locator('.react-flow__node').filter({ hasText: 'Assign Automatically' }).first();
    await expect(nodoTrasRecarga).toBeVisible();

    // Se deja constancia visual del diagrama recargado. No se asertan
    // coordenadas de pantalla: tras `fitView` dependen del zoom y del encuadre,
    // así que compararlas probaría la matemática del viewport de React Flow, no
    // que el diagrama se conservó. Lo que se asserta es el MODELO, más abajo.
    await testInfo.attach('diagrama-tras-recargar', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    const cajaRecargada = await nodoTrasRecarga.boundingBox();
    if (!cajaTriggerAntes || !cajaRecargada) throw new Error('faltan nodos tras recargar');
    // Y está dentro del área visible, no perdido fuera del lienzo.
    const viewport = page.viewportSize()!;
    expect(cajaRecargada.x).toBeGreaterThanOrEqual(0);
    expect(cajaRecargada.x).toBeLessThan(viewport.width);

    // Conexiones y configuración intactas.
    await expect(page.locator('.react-flow__edge')).toHaveCount(conexionesAntes);
    await expect(nodoTrasRecarga).toContainText(destino.persona.nombre);

    // Y la posición del MODELO no cambió: volver a guardar sin tocar nada deja
    // el mismo layout. Si el canvas hubiera recolocado los nodos al recargar,
    // este segundo guardado escribiría posiciones distintas.
    await nodoTrasRecarga.click();
    await page.getByTestId('canvas-save-draft').click();
    await expect(page.getByTestId('canvas-dirty')).toHaveText('Saved');
    const reguardado = await llamarAPI<{ layout: Layout }>('GET', `/workflows/${idBorrador}`);
    const asignacionReguardada = reguardado.layout.nodes.find((n) => n.data.catalogKey === 'action.assign');
    expect(asignacionReguardada!.position).toEqual(asignacionGuardada!.position);
    expect(reguardado.layout.nodes).toHaveLength(guardado.layout.nodes.length);
    expect(reguardado.layout.edges).toHaveLength((guardado.layout.edges as unknown[]).length);

    // ── Provocar un error, pulsarlo y ver que enfoca el nodo ──────────────
    await nodoTrasRecarga.click();
    await expect(page.getByTestId('assignment-editor')).toBeVisible();
    await page.getByRole('combobox', { name: 'Area' }).selectOption('');
    await page.getByTestId('canvas-validate').click();
    const errorAnclado = page.getByTestId('validation-issue-anchored').first();
    await expect(errorAnclado).toBeVisible();
    await errorAnclado.click();
    await expect(page.getByTestId('assignment-editor')).toBeVisible();
    await expect(page.getByTestId('workflow-node-invalid')).toBeVisible();

    // ── Corregirlo y publicar: POST real ─────────────────────────────────
    await page.getByRole('combobox', { name: 'Area' }).selectOption({ label: destino.depto.nombre });
    await page.getByRole('combobox', { name: 'Team' }).selectOption({ label: destino.equipo.nombre });
    await page.getByRole('combobox', { name: 'Person' })
      .selectOption({ label: `${destino.persona.nombre} · ${marca.toLowerCase()}@live.local` });
    await expect(page.getByTestId('workflow-node-invalid')).toHaveCount(0);

    await page.getByTestId('canvas-save-draft').click();
    await expect(page.getByTestId('canvas-dirty')).toHaveText('Saved');
    await page.getByTestId('canvas-publish').click();
    await expect(page.getByTestId('canvas-estado')).toContainText('Published', { timeout: 30_000 });

    // ── Comprobar el efecto en el backend real ───────────────────────────
    const publicado = await llamarAPI<{
      id: string; estado: string; version: number; workflow_family_id: string; revision: number;
      reglas: Array<{ id: string; accion: string; config?: Record<string, unknown> }>;
    }>('GET', `/workflows/${idBorrador}`);
    expect(publicado.estado).toBe('publicado');
    expect(publicado.workflow_family_id).toBe(publicado.id);
    expect(publicado.revision).toBeGreaterThan(1);
    const regla = publicado.reglas.find((r) => r.accion === 'asignar_automatico');
    expect(regla, 'la regla de asignación debe haberse publicado').toBeTruthy();
    expect(regla!.config).toMatchObject({
      mode: 'user',
      department_id: destino.depto.id,
      team_id: destino.equipo.id,
      assignee_user_id: destino.persona.id,
    });

    // ── Una versión publicada es inmutable; se clona ─────────────────────
    await expect(page.getByTestId('canvas-save-draft')).toHaveCount(0);
    await expect(page.getByTestId('canvas-new-draft')).toBeVisible();
    await page.getByTestId('canvas-new-draft').click();
    // Se espera a que la URL cambie a OTRO id. El patrón genérico coincidía con
    // la URL en la que ya estábamos, así que `waitForURL` volvía de inmediato y
    // la comprobación leía la versión publicada creyendo que era el clon.
    await page.waitForURL((url) => !url.pathname.endsWith(idBorrador), { timeout: 30_000 });
    workflowsCreados.push(page.url().split('/').pop()!);
    const clon = await llamarAPI<{
      id: string; estado: string; version: number; workflow_family_id: string;
      reglas: Array<{ id: string; accion: string }>;
    }>('GET', `/workflows/${page.url().split('/').pop()!}`);
    expect(clon.estado).toBe('borrador');
    expect(clon.workflow_family_id).toBe(publicado.workflow_family_id);
    expect(clon.version).toBe(publicado.version + 1);
    // Se busca la regla POR ACCIÓN, no por índice: el flujo lleva también la de
    // notificación del ejemplo inicial y el orden no es parte del contrato.
    const reglaClonada = clon.reglas.find((r) => r.accion === 'asignar_automatico');
    expect(reglaClonada, 'el clon debe conservar la regla de asignación').toBeTruthy();
    // El rule_id se conserva entre versiones: su identidad completa es
    // (workflow_id, rule_id), así que repetirlo bajo otra versión no colisiona
    // y permite seguir la misma regla en el historial.
    expect(reglaClonada!.id).toBe(regla!.id);

    // ── Viewport reducido ────────────────────────────────────────────────
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await testInfo.attach('diseñador-viewport-reducido', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    // ── Consola limpia ───────────────────────────────────────────────────
    expect(problemas, `la consola del navegador debe quedar limpia:\n${problemas.join('\n')}`).toEqual([]);
  });
});
