import { expect, test } from '@playwright/test';
import type {
  CatalogSpecification,
  FieldDefinition,
  PageLayout,
} from '../src/features/catalog/metamodel';
import {
  defaultValueFitsType,
  duplicateField,
  duplicateOptionValues,
  fieldForType,
  fieldPlacementSurfaces,
  fieldRuleSummary,
  materializedSurfaces,
  parseOptionsFromText,
  reorder,
  uniqueFieldKey,
} from '../src/features/admin/catalog-builder/field-editor/field-operations';

/**
 * Lógica pura del editor de campos. No abre navegador: son funciones y este
 * es el único sitio donde pueden verificarse, porque el frontend no tiene
 * runner de tests unitarios y Playwright ya compila TypeScript.
 *
 * Cada caso corresponde a una decisión que, si se rompe, produce una
 * definición publicada mal formada — no un fallo visual.
 */

function campo(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return { key: 'campo', label: 'Campo', type: 'text', required: false, ...overrides };
}

function region(placements: PageLayout['main']['placements'] = []) {
  return { columns: 3 as const, placements };
}

function paginaCon(fieldKey: string | null): PageLayout {
  const placements = fieldKey
    ? [
        {
          id: `p-${fieldKey}`,
          kind: 'field' as const,
          source: 'catalog' as const,
          fieldKey,
          row: 0,
          column: 0,
          columnSpan: 3 as const,
        },
      ]
    : [];
  return {
    sidebarColumns: 4,
    header: region(),
    actions: region(),
    main: region(placements),
    sidebar: region(),
    footer: region(),
  };
}

test.describe('claves técnicas', () => {
  test('una clave duplicada se desambigua: dos campos con la misma clave colapsan en un valor', () => {
    expect(uniqueFieldKey(['prioridad'], 'Prioridad')).toBe('prioridad2');
    expect(uniqueFieldKey(['prioridad', 'prioridad2'], 'Prioridad')).toBe('prioridad3');
    expect(uniqueFieldKey([], 'Prioridad')).toBe('prioridad');
  });

  test('una etiqueta sin caracteres usables no produce una clave vacía', () => {
    expect(uniqueFieldKey([], '¿?¡!')).toBe('campo');
  });
});

test.describe('duplicar', () => {
  test('la copia no comparte clave con el original', () => {
    const original = campo({ key: 'prioridad', label: 'Prioridad', required: true });

    const copia = duplicateField(original, ['prioridad']);

    expect(copia.key).not.toBe(original.key);
    expect(copia.label).toBe('Prioridad (copia)');
    expect(copia.required).toBe(true);
  });

  test('las opciones se copian sin compartir referencia: editar una no toca la otra', () => {
    const original = campo({
      type: 'select',
      options: [{ value: 'alta', label: 'Alta' }],
    });

    const copia = duplicateField(original, [original.key]);
    copia.options![0].label = 'Crítica';

    expect(original.options![0].label).toBe('Alta');
  });

  test('las condiciones se conservan: apuntan a OTROS campos y siguen siendo válidas', () => {
    const original = campo({
      visibleWhen: { field: 'tipo', operator: 'equals', value: 'hardware' },
    });

    expect(duplicateField(original, [original.key]).visibleWhen).toEqual(original.visibleWhen);
  });
});

test.describe('cambio de tipo', () => {
  test('las opciones no sobreviven a un tipo que no las usa', () => {
    const lista = campo({
      type: 'select',
      options: [{ value: 'alta', label: 'Alta' }],
      defaultValue: 'alta',
    });

    const numero = fieldForType(lista, 'number');

    expect(numero.options).toBeUndefined();
    expect(numero.defaultValue, 'un default de texto en un campo numérico lo rechaza el servidor').toBeUndefined();
  });

  test('las restricciones de un tipo no se filtran al siguiente', () => {
    const numero = campo({ type: 'number', min: 1, max: 99, step: 1 });
    const texto = fieldForType(numero, 'text');

    expect(texto.min).toBeUndefined();
    expect(texto.max).toBeUndefined();
    expect(texto.step).toBeUndefined();
  });

  test('las reglas de texto no sobreviven a un número', () => {
    const texto = campo({ type: 'text', minLength: 3, pattern: '^a', format: 'email' });
    const numero = fieldForType(texto, 'number');

    expect(numero.minLength).toBeUndefined();
    expect(numero.pattern).toBeUndefined();
    expect(numero.format).toBeUndefined();
  });

  test('un tipo con nombre no arrastra un `format` redundante', () => {
    const texto = campo({ type: 'text', format: 'email' });

    expect(fieldForType(texto, 'email').format, 'el tipo ya implica su formato').toBeUndefined();
  });

  test('las reglas del tipo que se conserva no se pierden', () => {
    const texto = campo({ type: 'text', minLength: 3, maxLength: 20 });
    const largo = fieldForType(texto, 'textarea');

    expect(largo.minLength).toBe(3);
    expect(largo.maxLength).toBe(20);
  });

  test('los límites de fecha se van al dejar de ser una fecha', () => {
    const fecha = campo({ type: 'date', minDate: 'today' });

    expect(fieldForType(fecha, 'text').minDate).toBeUndefined();
  });

  test('el conteo de opciones se va al dejar de ser multiselección', () => {
    const multi = campo({ type: 'multiselect', minItems: 2, maxItems: 3 });
    const uno = fieldForType(multi, 'select');

    expect(uno.minItems).toBeUndefined();
    expect(uno.maxItems).toBeUndefined();
  });

  test('un default compatible se conserva; uno incompatible se descarta', () => {
    expect(fieldForType(campo({ type: 'text', defaultValue: 'hola' }), 'textarea').defaultValue).toBe('hola');
    expect(fieldForType(campo({ type: 'number', defaultValue: 5 }), 'text').defaultValue).toBeUndefined();
    expect(fieldForType(campo({ type: 'boolean', defaultValue: true }), 'text').defaultValue).toBeUndefined();
  });

  test('defaultValueFitsType es explícito sobre cada forma de valor', () => {
    expect(defaultValueFitsType(true, 'boolean')).toBe(true);
    expect(defaultValueFitsType('sí', 'boolean')).toBe(false);
    expect(defaultValueFitsType(5, 'number')).toBe(true);
    expect(defaultValueFitsType('5', 'number')).toBe(false);
    expect(defaultValueFitsType(['a'], 'multiselect')).toBe(true);
    expect(defaultValueFitsType('a', 'multiselect')).toBe(false);
    expect(defaultValueFitsType(undefined, 'number'), 'sin default no hay incompatibilidad').toBe(true);
    expect(defaultValueFitsType('', 'number')).toBe(true);
  });
});

test.describe('pegado de opciones', () => {
  test('una opción por línea, con la clave derivada de la etiqueta', () => {
    expect(parseOptionsFromText('Alta\nMedia\nBaja')).toEqual([
      { value: 'alta', label: 'Alta' },
      { value: 'media', label: 'Media' },
      { value: 'baja', label: 'Baja' },
    ]);
  });

  test('se puede fijar la clave con varios separadores', () => {
    expect(parseOptionsFromText('p1 = Prioridad uno\np2, Prioridad dos\np3; Prioridad tres')).toEqual([
      { value: 'p1', label: 'Prioridad uno' },
      { value: 'p2', label: 'Prioridad dos' },
      { value: 'p3', label: 'Prioridad tres' },
    ]);
  });

  test('las líneas vacías se ignoran', () => {
    expect(parseOptionsFromText('\n Alta \n\n\n Baja \n')).toHaveLength(2);
  });

  test('una lista con etiquetas repetidas no produce claves repetidas', () => {
    const parsed = parseOptionsFromText('Alta\nAlta\nAlta');

    expect(parsed.map((option) => option.value)).toEqual(['alta', 'alta2', 'alta3']);
    expect(parsed.every((option) => option.label === 'Alta')).toBe(true);
  });

  test('al agregar al final no se choca con las claves que ya existían', () => {
    expect(parseOptionsFromText('Alta', ['alta'])[0].value).toBe('alta2');
  });

  test('una etiqueta sin caracteres usables recibe una clave, no una vacía', () => {
    expect(parseOptionsFromText('###')[0].value).toBe('opcion');
  });

  test('texto en blanco no produce opciones', () => {
    expect(parseOptionsFromText('   \n \n')).toEqual([]);
  });
});

test.describe('duplicados de opciones', () => {
  test('se detecta la clave repetida, no la etiqueta', () => {
    const field = campo({
      type: 'select',
      options: [
        { value: 'alta', label: 'Alta' },
        { value: 'alta', label: 'Crítica' },
        { value: 'baja', label: 'Baja' },
      ],
    });

    expect(duplicateOptionValues(field)).toEqual(['alta']);
  });

  test('etiquetas iguales con claves distintas no son un duplicado', () => {
    const field = campo({
      type: 'select',
      options: [
        { value: 'alta1', label: 'Alta' },
        { value: 'alta2', label: 'Alta' },
      ],
    });

    expect(duplicateOptionValues(field)).toEqual([]);
  });
});

test.describe('dónde está colocado un campo', () => {
  const base: CatalogSpecification = {
    fields: [campo({ key: 'titulo' })],
  } as CatalogSpecification;

  test('una superficie sin página materializada no se afirma como faltante', () => {
    expect(fieldPlacementSurfaces(base, 'titulo')).toEqual([]);
    expect(materializedSurfaces(base)).toEqual([]);
  });

  test('se reporta cada superficie donde el campo tiene placement', () => {
    const specification: CatalogSpecification = {
      ...base,
      createPage: { default: paginaCon('titulo') },
      editPage: { default: paginaCon(null) },
      detailPage: { default: paginaCon('titulo') },
    };

    expect(fieldPlacementSurfaces(specification, 'titulo')).toEqual(['createPage', 'detailPage']);
    expect(materializedSurfaces(specification)).toEqual(['createPage', 'editPage', 'detailPage']);
  });

  test('un placement que solo existe en una variante cuenta', () => {
    const specification: CatalogSpecification = {
      ...base,
      createPage: {
        default: paginaCon(null),
        variants: [
          { key: 'agente', label: 'Agente', audienceKey: 'agent', page: paginaCon('titulo') },
        ],
      },
    };

    expect(fieldPlacementSurfaces(specification, 'titulo')).toEqual(['createPage']);
  });

  test('un campo que no está en ninguna página se reporta como ausente, no como error', () => {
    const specification: CatalogSpecification = {
      ...base,
      createPage: { default: paginaCon('otro') },
    };

    expect(fieldPlacementSurfaces(specification, 'titulo')).toEqual([]);
    expect(materializedSurfaces(specification)).toEqual(['createPage']);
  });
});

test.describe('resumen de la tarjeta colapsada', () => {
  test('nombra las reglas activas y solo esas', () => {
    const resumen = fieldRuleSummary(
      campo({ type: 'number', required: true, min: 1, max: 99, step: 1 }),
    );

    expect(resumen).toContain('obligatorio');
    expect(resumen).toContain('1…99');
    expect(resumen).toContain('pasos de 1');
    expect(resumen.some((rule) => rule.includes('caracteres'))).toBe(false);
  });

  test('un campo sin reglas no inventa ninguna', () => {
    expect(fieldRuleSummary(campo())).toEqual([]);
  });

  test('un tipo con opciones siempre dice cuántas tiene, incluso cero', () => {
    expect(fieldRuleSummary(campo({ type: 'select' }))).toContain('0 opciones');
  });

  test('las condiciones se distinguen del obligatorio simple', () => {
    const resumen = fieldRuleSummary(
      campo({ requiredWhen: { field: 'x', operator: 'exists' } }),
    );

    expect(resumen).toContain('obligatorio condicional');
    expect(resumen).not.toContain('obligatorio');
  });
});

test.describe('reordenar', () => {
  test('mueve el elemento a la posición pedida sin mutar el original', () => {
    const original = ['a', 'b', 'c', 'd'];

    expect(reorder(original, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(original, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(original, 'reorder no muta').toEqual(['a', 'b', 'c', 'd']);
  });

  test('un movimiento fuera de rango devuelve la lista intacta', () => {
    const original = ['a', 'b'];

    expect(reorder(original, 0, 0)).toBe(original);
    expect(reorder(original, -1, 1)).toBe(original);
    expect(reorder(original, 0, 5)).toBe(original);
  });
});
