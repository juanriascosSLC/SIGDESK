import { expect, test } from '@playwright/test';
import type { FieldDefinition } from '../src/features/catalog/metamodel';
import {
  ASSETS_BY_FIELD_KEY,
  assetConditionData,
  bindingCountIssue,
  bindingEmptyValue,
  bindingIsMultiple,
  bindingList,
  bindingPrincipal,
} from '../src/features/catalog/field-types';
import { fieldForType, fieldRuleSummary } from '../src/features/admin/catalog-builder/field-editor/field-operations';

/**
 * Lógica pura del campo multi-dispositivo. No abre navegador: se importa desde
 * `field-types.ts`, el único módulo del modelo sin dependencias y por tanto el
 * único importable fuera del navegador (`metamodel.ts` arrastra el cliente
 * HTTP y con él `import.meta.env`).
 *
 * Cada caso corresponde a una decisión que, si se rompe, produce datos mal
 * formados o una regla que cambia sola — no un fallo visual.
 */

function campo(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return { key: 'dispositivos', label: 'Dispositivo afectado', type: 'text', required: false, ...overrides };
}

const CAM = { id: 'cam-1', displayName: 'CAM-0001', tipo: 'camera' };
const SW = { id: 'sw-1', displayName: 'SW-0007', tipo: 'switch' };

test.describe('bindingIsMultiple', () => {
  test('solo el picker de dispositivos acepta varios', () => {
    expect(bindingIsMultiple(campo({ bindsTo: 'assetId', multiple: true }))).toBe(true);
    // Los otros tres bindings son estructuralmente de un solo valor: el sitio
    // acota la consulta de dispositivos y viaja como assetContext.siteAssetId;
    // recurso y agente mapean a escalares top-level del contrato de creación.
    expect(bindingIsMultiple(campo({ bindsTo: 'siteAssetId', multiple: true }))).toBe(false);
    expect(bindingIsMultiple(campo({ bindsTo: 'recursoId', multiple: true }))).toBe(false);
    expect(bindingIsMultiple(campo({ bindsTo: 'agenteItId', multiple: true }))).toBe(false);
  });

  test('sin la propiedad, un campo de dispositivos sigue siendo de uno solo', () => {
    expect(bindingIsMultiple(campo({ bindsTo: 'assetId' }))).toBe(false);
    expect(bindingIsMultiple(undefined)).toBe(false);
  });
});

test.describe('bindingList', () => {
  test('tolera las dos formas: objeto suelto y lista', () => {
    // La compatibilidad hacia atrás depende de esto: las definiciones
    // publicadas antes de `multiple` guardan un objeto, no un arreglo.
    expect(bindingList(CAM)).toEqual([CAM]);
    expect(bindingList([CAM, SW])).toEqual([CAM, SW]);
    expect(bindingList(null)).toEqual([]);
    expect(bindingList(undefined)).toEqual([]);
  });

  test('descarta basura y deduplica por id conservando el primero', () => {
    expect(bindingList([CAM, { id: '', displayName: 'x' }, 'texto', 42, null])).toEqual([CAM]);
    // El backend deduplica igual (resolveAssets), así que la UI no debe
    // prometer que se guardarán dos veces.
    expect(bindingList([CAM, { ...CAM, displayName: 'otro nombre' }])).toEqual([CAM]);
  });

  test('bindingPrincipal es el primero, y null cuando no hay ninguno', () => {
    expect(bindingPrincipal([SW, CAM])).toEqual(SW);
    expect(bindingPrincipal(CAM)).toEqual(CAM);
    expect(bindingPrincipal([])).toBeNull();
  });
});

test.describe('bindingEmptyValue', () => {
  test('un campo multi arranca en lista y uno normal en nulo', () => {
    // Arrancar un campo multi en null lo haría fallar en el primer render del
    // picker, que espera un arreglo.
    expect(bindingEmptyValue(campo({ bindsTo: 'assetId', multiple: true }))).toEqual([]);
    expect(bindingEmptyValue(campo({ bindsTo: 'assetId' }))).toBeNull();
    expect(bindingEmptyValue(campo({ bindsTo: 'siteAssetId' }))).toBeNull();
  });
});

test.describe('bindingCountIssue', () => {
  const multi = (extra: Partial<FieldDefinition> = {}) =>
    campo({ bindsTo: 'assetId', multiple: true, ...extra });

  test('un campo obligatorio exige al menos uno', () => {
    expect(bindingCountIssue(multi(), [], true)).toContain('al menos un dispositivo');
    expect(bindingCountIssue(multi(), [CAM], true)).toBe('');
  });

  test('respeta minItems y maxItems', () => {
    expect(bindingCountIssue(multi({ minItems: 2 }), [CAM], false)).toContain('al menos 2');
    expect(bindingCountIssue(multi({ maxItems: 2 }), [CAM, SW, { id: 'x', displayName: 'X' }], false)).toContain('máximo 2');
    expect(bindingCountIssue(multi({ minItems: 1, maxItems: 3 }), [CAM, SW], false)).toBe('');
  });

  test('un campo opcional sin mínimo acepta cero', () => {
    expect(bindingCountIssue(multi(), [], false)).toBe('');
  });

  test('no dice nada sobre un campo que no es multi-dispositivo', () => {
    expect(bindingCountIssue(campo({ bindsTo: 'assetId' }), [], true)).toBe('');
    expect(bindingCountIssue(campo({ type: 'multiselect' }), [], true)).toBe('');
  });
});

test.describe('assetConditionData', () => {
  const campos = [
    campo({ key: 'sitio', bindsTo: 'siteAssetId' }),
    campo({ key: 'dispositivos', bindsTo: 'assetId', multiple: true }),
  ];

  test('expone el principal bajo la clave del campo y la colección aparte', () => {
    const proyectado = assetConditionData(campos, {
      sitio: { id: 's1', displayName: 'Sede' },
      dispositivos: [CAM, SW],
    });

    // Bajo la clave del campo va un OBJETO, para que `dispositivos.tipo` siga
    // resolviéndose igual que en un campo de un solo dispositivo.
    expect(proyectado.dispositivos).toEqual(CAM);
    expect(proyectado[ASSETS_BY_FIELD_KEY]).toEqual({ dispositivos: [CAM, SW] });
  });

  test('una lista vacía se proyecta a null, no a []', () => {
    // Este es el punto: `isPresent` trata [] como presente, así que sin la
    // proyección un `visibleWhen: {operator: "exists"}` sería verdadero con
    // CERO dispositivos elegidos.
    const proyectado = assetConditionData(campos, { dispositivos: [] });

    expect(proyectado.dispositivos).toBeNull();
    expect(proyectado[ASSETS_BY_FIELD_KEY]).toEqual({ dispositivos: [] });
  });

  test('la clave reservada no puede chocar con la de un campo real', () => {
    // technicalKey obliga a que toda clave empiece por letra.
    expect(ASSETS_BY_FIELD_KEY.startsWith('_')).toBe(true);
  });
});

test.describe('fieldForType con un campo de dispositivos', () => {
  test('conserva los topes al cambiar de tipo', () => {
    // La trampa: un campo de dispositivos conserva `type: "text"` (los tipos
    // del metamodelo 1.7 no son publicables), así que la limpieza pensada para
    // multiselect le vaciaría unos topes que no tienen nada que ver con el
    // tipo.
    const multi = campo({ bindsTo: 'assetId', multiple: true, minItems: 1, maxItems: 3 });
    const cambiado = fieldForType(multi, 'textarea');

    expect(cambiado.minItems).toBe(1);
    expect(cambiado.maxItems).toBe(3);
  });

  test('un multiselect normal los sigue perdiendo', () => {
    const multi = campo({ type: 'multiselect', minItems: 2, maxItems: 3 });
    const uno = fieldForType(multi, 'select');

    expect(uno.minItems).toBeUndefined();
    expect(uno.maxItems).toBeUndefined();
  });
});

test.describe('resumen de reglas', () => {
  test('cuenta dispositivos, no opciones', () => {
    const resumen = fieldRuleSummary(
      campo({ bindsTo: 'assetId', multiple: true, minItems: 1, maxItems: 3 }),
    );

    expect(resumen).toContain('1–3 dispositivos');
    expect(resumen).toContain('varios dispositivos');
  });

  test('un binding de uno solo sigue diciendo "vinculado"', () => {
    expect(fieldRuleSummary(campo({ bindsTo: 'assetId' }))).toContain('vinculado');
  });
});
