import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

/**
 * El editor de campos del Catalog Builder.
 *
 * Es hermético: la definición la sirve este spec, así que no depende de qué
 * campos tenga la INC del entorno ni escribe nada en el catálogo compartido.
 * El oráculo es el textarea de «Configuración avanzada», igual que en
 * catalog-builder-integrity.spec.ts — lo que se afirma es el documento que se
 * guardaría.
 *
 * La forma de la especificación se declara aquí en lugar de importarla para
 * que el spec siga siendo legible como contrato: lo que se prueba es el JSON
 * que sale, no los tipos que entran.
 */

type Spec = {
  fields: Array<Record<string, unknown>>;
  views?: Record<string, string[]>;
  createPage?: unknown;
  layouts?: unknown;
};

const definicion = {
  id: 'inc-draft-e2e',
  entityKey: 'INC',
  name: 'Incidente',
  version: 1,
  status: 'draft',
  metamodelVersion: '1.7',
  updatedAt: '2026-01-01T00:00:00.000000Z',
  specification: {
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', required: true },
      { key: 'prioridad', label: 'Prioridad', type: 'select', required: true, options: [
        { value: 'alta', label: 'Alta' },
        { value: 'baja', label: 'Baja' },
      ] },
      { key: 'cantidad', label: 'Cantidad', type: 'number', required: false },
    ],
    views: { create: ['titulo', 'prioridad', 'cantidad'] },
  },
};

function region() {
  return { columns: 3 as const, placements: [] };
}

/** La misma definición, con `createPage` donde solo está `titulo`. */
const conPaginaDeCreacion = {
  ...definicion,
  specification: {
    ...definicion.specification,
    createPage: {
      default: {
        sidebarColumns: 4,
        header: region(),
        actions: region(),
        main: {
          columns: 3 as const,
          placements: [
            {
              id: 'p-titulo',
              kind: 'field' as const,
              source: 'catalog' as const,
              fieldKey: 'titulo',
              row: 0,
              column: 0,
              columnSpan: 3 as const,
            },
          ],
        },
        sidebar: region(),
        footer: region(),
      },
    },
  },
};

async function abrirCampos(page: Page, servida: typeof definicion = definicion) {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  // La lista de definiciones y la definición seleccionada las sirve el spec:
  // así los campos de partida son siempre los tres de arriba.
  await page.route(
    (url) => url.pathname === '/catalog/definitions',
    async (route, request) => {
      if (request.method() !== 'GET') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(servida),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [servida] }),
      });
    },
  );
  await page.route(
    (url) => /^\/catalog\/definitions\/[^/]+$/.test(url.pathname),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(servida),
      });
    },
  );
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-fields').click();
}

async function leerSpec(page: Page): Promise<Spec> {
  await page.getByTestId('catalog-section-advanced').click();
  const raw = await page.getByTestId('catalog-advanced-json').inputValue();
  const spec = JSON.parse(raw) as Spec;
  await page.getByTestId('catalog-section-fields').click();
  return spec;
}

function tarjeta(page: Page, key: string) {
  return page.getByTestId(`catalog-field-editor-${key}`);
}

// Las tarjetas arrancan colapsadas: una definición de doce campos tiene que
// caber en pantalla. Es la diferencia con el editor anterior, que las abría
// todas siempre.
test('las tarjetas arrancan colapsadas y resumen el campo en una línea', async ({ page }) => {
  await abrirCampos(page);

  const titulo = tarjeta(page, 'titulo');
  await expect(titulo).toBeVisible();
  await expect(titulo.getByText('Texto corto')).toBeVisible();
  await expect(titulo.getByText('obligatorio')).toBeVisible();
  await expect(
    titulo.getByLabel('Etiqueta', { exact: true }),
    'colapsada no muestra los controles',
  ).toHaveCount(0);

  await expect(tarjeta(page, 'prioridad').getByText('2 opciones')).toBeVisible();
});

test('expandir es un acordeón: solo un campo abierto a la vez', async ({ page }) => {
  await abrirCampos(page);

  await tarjeta(page, 'titulo').getByRole('button', { name: /Configurar el campo/ }).click();
  await expect(tarjeta(page, 'titulo').getByLabel('Etiqueta', { exact: true })).toBeVisible();

  await tarjeta(page, 'prioridad').getByRole('button', { name: /Configurar el campo/ }).click();
  await expect(tarjeta(page, 'prioridad').getByLabel('Etiqueta', { exact: true })).toBeVisible();
  await expect(tarjeta(page, 'titulo').getByLabel('Etiqueta', { exact: true })).toHaveCount(0);
});

// Las acciones destructivas están en la cabecera, visibles sin expandir: un
// e2e existente las usa así, y exigir dos clics para borrar un campo que ya se
// identificó en el resumen no aporta nada.
test('duplicar, eliminar y mover están disponibles sin expandir', async ({ page }) => {
  await abrirCampos(page);
  const titulo = tarjeta(page, 'titulo');

  await expect(titulo.getByRole('button', { name: 'Eliminar campo' })).toBeVisible();
  await expect(titulo.getByRole('button', { name: 'Duplicar campo' })).toBeVisible();
  await expect(titulo.getByRole('button', { name: 'Bajar campo' })).toBeVisible();
  await expect(titulo.getByRole('button', { name: 'Subir campo' }), 'el primero no sube').toBeDisabled();
});

test('escribir la etiqueta conserva el foco y no desplaza la tarjeta', async ({ page }) => {
  await abrirCampos(page);

  const titulo = tarjeta(page, 'titulo');
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();
  const etiqueta = page.getByLabel('Etiqueta', { exact: true });
  await etiqueta.focus();
  await etiqueta.press('End');
  await etiqueta.type(' actualizado');

  await expect(etiqueta).toHaveValue('Título actualizado');
  await expect(etiqueta).toBeFocused();
});

test('activar bindsTo vuelve a colocar el campo en Crear', async ({ page }) => {
  await abrirCampos(page, conPaginaDeCreacion);

  const cantidad = tarjeta(page, 'cantidad');
  await cantidad.getByRole('button', { name: /Configurar el campo/ }).click();
  await page.getByTestId('catalog-field-bindsto-cantidad').selectOption('assetId');

  const spec = await leerSpec(page);
  const createPage = spec.createPage as {
    default: { main: { placements: Array<{ fieldKey?: string }> } };
  };
  expect(
    createPage.default.main.placements.some((placement) => placement.fieldKey === 'cantidad'),
    'un campo vinculado debe quedar disponible en el formulario de creación',
  ).toBeTruthy();
});

test('un campo nuevo se abre solo: sin configurar no sirve de nada', async ({ page }) => {
  await abrirCampos(page);

  await page.getByTestId('catalog-add-field').click();

  const nueva = page.getByTestId(/^catalog-field-editor-/).last();
  await expect(nueva.getByLabel('Etiqueta')).toBeVisible();
  // Contrato que catalog-builder-runtime.spec.ts usa: el primer input del
  // cuerpo es la etiqueta.
  await expect(nueva.locator('input').first()).toHaveValue(/Nuevo campo/);
});

test('Dispositivo del sitio agrega el sitio necesario antes del dispositivo', async ({ page }) => {
  await abrirCampos(page);

  await page.getByTitle('Crear tipo específico').click();
  await page.getByRole('button', { name: 'Dispositivo del sitio' }).click();

  const spec = await leerSpec(page);
  const siteIndex = spec.fields.findIndex((field) => field.bindsTo === 'siteAssetId');
  const deviceIndex = spec.fields.findIndex((field) => field.bindsTo === 'assetId');
  expect(siteIndex).toBeGreaterThanOrEqual(0);
  expect(deviceIndex).toBe(siteIndex + 1);
  expect(spec.fields[siteIndex]).toMatchObject({ label: 'Sitio afectado', required: false });
  expect(spec.fields[deviceIndex]).toMatchObject({
    label: 'Dispositivo del sitio', required: false,
  });
  expect(spec.views?.create?.slice(-2)).toEqual([
    spec.fields[siteIndex].key,
    spec.fields[deviceIndex].key,
  ]);
});

// Duplicar junto al original, no al final: se duplica para tener dos variantes
// de lo mismo, y buscarlo doce posiciones abajo rompe eso.
test('la copia queda junto al original y con clave propia', async ({ page }) => {
  await abrirCampos(page);

  await tarjeta(page, 'titulo').getByRole('button', { name: 'Duplicar campo' }).click();

  const spec = await leerSpec(page);
  expect(spec.fields.map((field) => field.key)).toEqual([
    'titulo',
    'tituloCopia',
    'prioridad',
    'cantidad',
  ]);
  expect(spec.fields[1].label).toBe('Título (copia)');
  expect(spec.fields[1].required, 'la copia conserva las reglas').toBe(true);
});

test('el buscador filtra y desactiva el reordenamiento mientras filtra', async ({ page }) => {
  await abrirCampos(page);

  await page.getByTestId('catalog-field-search').fill('priorid');

  await expect(tarjeta(page, 'prioridad')).toBeVisible();
  await expect(tarjeta(page, 'titulo')).toHaveCount(0);
  await expect(page.getByText('el orden no se puede cambiar mientras filtras')).toBeVisible();
  await expect(tarjeta(page, 'prioridad').getByRole('button', { name: 'Bajar campo' })).toBeDisabled();

  await page.getByRole('button', { name: 'Limpiar la búsqueda' }).click();
  await expect(tarjeta(page, 'titulo')).toBeVisible();
});

test('una búsqueda sin resultados lo dice en vez de mostrar una lista vacía', async ({ page }) => {
  await abrirCampos(page);

  await page.getByTestId('catalog-field-search').fill('nada-de-esto-existe');

  await expect(page.getByText('Ningún campo coincide')).toBeVisible();
});

// Las reglas nuevas se guardan en la definición, que es lo que el servidor
// valida. Sin esto, los controles serían decoración.
test('las restricciones numéricas llegan a la definición', async ({ page }) => {
  await abrirCampos(page);
  const cantidad = tarjeta(page, 'cantidad');
  await cantidad.getByRole('button', { name: /Configurar el campo/ }).click();

  await cantidad.getByLabel('Valor mínimo').fill('1');
  await cantidad.getByLabel('Valor máximo').fill('99');
  await cantidad.getByLabel('Incremento').fill('1');

  const spec = await leerSpec(page);
  const field = spec.fields.find((candidate) => candidate.key === 'cantidad')!;
  expect(field.min).toBe(1);
  expect(field.max).toBe(99);
  expect(field.step).toBe(1);
});

test('el texto de ayuda y el valor por defecto llegan a la definición', async ({ page }) => {
  await abrirCampos(page);
  const titulo = tarjeta(page, 'titulo');
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();

  await page.getByTestId('catalog-field-help-titulo').fill('Resume el problema en una línea.');
  await page.getByTestId('catalog-field-default-titulo').fill('Fallo en ');

  const spec = await leerSpec(page);
  const field = spec.fields.find((candidate) => candidate.key === 'titulo')!;
  expect(field.helpText).toBe('Resume el problema en una línea.');
  expect(field.defaultValue).toBe('Fallo en ');
});

// Cambiar el tipo limpia lo que el tipo nuevo no puede usar: si no, las
// opciones siguen en el JSON publicado, invisibles, y reaparecen si alguien
// devuelve el campo a lista.
test('cambiar el tipo de lista a número descarta las opciones', async ({ page }) => {
  await abrirCampos(page);
  const prioridad = tarjeta(page, 'prioridad');
  await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

  await page.getByTestId('catalog-field-type-prioridad').selectOption('number');

  const spec = await leerSpec(page);
  const field = spec.fields.find((candidate) => candidate.key === 'prioridad')!;
  expect(field.type).toBe('number');
  expect(field.options).toBeUndefined();
});

test('el formato exigido solo se ofrece donde tiene sentido', async ({ page }) => {
  await abrirCampos(page);
  const titulo = tarjeta(page, 'titulo');
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();

  await expect(page.getByTestId('catalog-field-format-titulo')).toBeVisible();
  await page.getByTestId('catalog-field-format-titulo').selectOption('email');

  let spec = await leerSpec(page);
  expect(spec.fields.find((field) => field.key === 'titulo')!.format).toBe('email');

  // Un tipo con nombre ya implica su formato: el control desaparece y la clave
  // redundante se limpia.
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();
  await page.getByTestId('catalog-field-type-titulo').selectOption('email');
  await expect(page.getByTestId('catalog-field-format-titulo')).toHaveCount(0);

  spec = await leerSpec(page);
  const field = spec.fields.find((candidate) => candidate.key === 'titulo')!;
  expect(field.type).toBe('email');
  expect(field.format).toBeUndefined();
});

test.describe('editor de opciones', () => {
  test('la clave guardada es visible y editable, no derivada en silencio', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

    const opciones = page.getByTestId('catalog-field-options-prioridad');
    await expect(opciones.getByLabel('Clave de la opción 1')).toHaveValue('alta');

    await opciones.getByLabel('Clave de la opción 1').fill('critica');

    const spec = await leerSpec(page);
    const field = spec.fields.find((candidate) => candidate.key === 'prioridad')!;
    expect((field.options as Array<{ value: string }>)[0].value).toBe('critica');
  });

  // Renombrar la etiqueta cuando la clave ya fue fijada a mano NO la cambia:
  // arrastrarla dejaría huérfanos los registros ya guardados con la anterior.
  test('una clave fijada a mano no sigue a la etiqueta', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();
    const opciones = page.getByTestId('catalog-field-options-prioridad');

    await opciones.getByLabel('Clave de la opción 1').fill('p1');
    await opciones.getByLabel('Etiqueta de la opción 1').fill('Crítica');

    const spec = await leerSpec(page);
    const options = spec.fields.find((candidate) => candidate.key === 'prioridad')!
      .options as Array<{ value: string; label: string }>;
    expect(options[0]).toEqual({ value: 'p1', label: 'Crítica' });
  });

  test('pegar una lista crea las opciones de golpe', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

    await page.getByRole('button', { name: /Pegar lista/ }).click();
    await page
      .getByTestId('catalog-field-paste-options-prioridad')
      .fill('Crítica\nAlta\nMedia\nBaja');
    await page.getByRole('button', { name: /Reemplazar las 2/ }).click();

    const spec = await leerSpec(page);
    const options = spec.fields.find((candidate) => candidate.key === 'prioridad')!
      .options as Array<{ value: string; label: string }>;
    expect(options.map((option) => option.label)).toEqual(['Crítica', 'Alta', 'Media', 'Baja']);
    expect(options.map((option) => option.value)).toEqual(['critica', 'alta', 'media', 'baja']);
  });

  test('la estrella fija el valor por defecto dentro de las opciones publicadas', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

    await page.getByRole('button', { name: 'Marcar «Baja» por defecto' }).click();

    const spec = await leerSpec(page);
    expect(spec.fields.find((candidate) => candidate.key === 'prioridad')!.defaultValue).toBe('baja');
  });

  test('borrar la opción marcada limpia el valor por defecto', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

    await page.getByRole('button', { name: 'Marcar «Baja» por defecto' }).click();
    await page.getByRole('button', { name: 'Eliminar la opción 2' }).click();

    const spec = await leerSpec(page);
    const field = spec.fields.find((candidate) => candidate.key === 'prioridad')!;
    expect(field.defaultValue, 'un default que no está en la lista rompe el formulario').toBeUndefined();
  });

  test('avisa de las claves repetidas, que después no se pueden distinguir', async ({ page }) => {
    await abrirCampos(page);
    const prioridad = tarjeta(page, 'prioridad');
    await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();
    const opciones = page.getByTestId('catalog-field-options-prioridad');

    await opciones.getByLabel('Clave de la opción 2').fill('alta');

    await expect(page.getByText(/claves repetidas/)).toBeVisible();
  });
});

// La vista previa usa el MISMO componente que el formulario real: si se
// dibujara aparte, enseñaría algo que no va a pasar.
test('la vista previa renderiza el campo con el renderer de producción', async ({ page }) => {
  await abrirCampos(page);
  const prioridad = tarjeta(page, 'prioridad');
  await prioridad.getByRole('button', { name: /Configurar el campo/ }).click();

  const preview = prioridad.getByTestId('catalog-input-prioridad');
  await expect(preview).toBeVisible();
  await expect(preview.locator('option')).toHaveCount(3); // el vacío + 2 opciones

  await page.getByTestId('catalog-field-type-prioridad').selectOption('multiselect');
  // Multiselección se dibuja con casillas, no con un desplegable.
  await expect(prioridad.getByTestId('catalog-input-prioridad').locator('input[type=checkbox]')).toHaveCount(2);
});

// Los interruptores «Mostrar al crear» y «Mostrar en resumen» escribían
// `views.*` y no gobernaban nada: con metamodelo 1.6 el formulario lo dibuja
// `createPage`. Se quitaron y en su lugar se informa dónde está el campo.
test('ya no hay interruptores de visibilidad que no gobiernen nada', async ({ page }) => {
  await abrirCampos(page);
  const titulo = tarjeta(page, 'titulo');
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();

  await expect(page.getByText('Mostrar al crear')).toHaveCount(0);
  await expect(page.getByText('Mostrar en resumen')).toHaveCount(0);
  await expect(titulo.getByText('Dónde aparece')).toBeVisible();
  // Esta definición no tiene páginas materializadas todavía: decir «no
  // aparece en Crear» sería una alarma falsa, así que se explica en su lugar.
  await expect(titulo.getByText(/no tiene páginas materializadas/)).toBeVisible();
});

// Con páginas materializadas se informa en cuáles está el campo y en cuáles
// no, y se remite al diseñador — que es quien decide la visibilidad.
test('con páginas materializadas se dice en cuáles aparece el campo', async ({ page }) => {
  await abrirCampos(page, conPaginaDeCreacion);
  const titulo = tarjeta(page, 'titulo');
  await titulo.getByRole('button', { name: /Configurar el campo/ }).click();

  await expect(page.getByTestId('catalog-field-surface-titulo-createPage')).toBeVisible();
  await expect(titulo.getByText(/Diseñador de plantilla/)).toBeVisible();

  const cantidad = tarjeta(page, 'cantidad');
  await cantidad.getByRole('button', { name: /Configurar el campo/ }).click();
  await expect(cantidad.getByText(/Hoy no aparece en Crear/)).toBeVisible();
});
