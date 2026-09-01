import type {
  CatalogSpecification,
  LayoutDefinition,
  LayoutDocument,
  PageLayout,
  PageLayoutDefinition,
  RegionName,
} from '@/features/catalog/metamodel';
import { prunePageToSchema } from '@/features/catalog/runtime/page-layout-normalizer';
import { conditionReferences, replaceConditionField } from './config';

// Renombrar o borrar un campo tiene que alcanzar TODO lo que lo referencia.
//
// FieldsEditor ya limpiaba `fields[].visibleWhen/requiredWhen`, `views` y el
// `detailLayout` legado — pero no los dos sistemas de layout que realmente se
// renderizan: `layouts.{create,edit,detail}` (1.4, lo que dibuja CatalogForm) y
// `detailPage` (1.5, lo que dibuja la página del ticket). Renombrar un campo
// dejaba en ambos un placement apuntando a una clave que ya no existe: en el
// diseñador aparecía una tarjeta con el nombre técnico viejo, y en runtime
// `pruneRegionToSchema` la descartaba en silencio. El campo simplemente
// desaparecía de la página sin que nada lo dijera.
//
// Estas dos funciones MUTAN la especificación que reciben: FieldsEditor las
// llama dentro de `updateSpecification`, que ya trabaja sobre un
// `structuredClone`.
//
// Metamodelo 1.6: ya no hay UNA página (el detalle) sino TRES —
// `detailPage`, `createPage` y `editPage`, todas con el mismo shape. Un campo
// renombrado o borrado tiene que alcanzar a las tres o reaparece el mismo
// fallo silencioso que motivó este archivo, ahora en el formulario.

const REGION_NAMES: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];
// Los tres documentos de secciones 1.4. Siguen manteniéndose (ver el espejo
// que escribe PageDesigner) aunque las tres vistas ya se dibujen con páginas.
const LEGACY_LAYOUT_KINDS = ['create', 'edit', 'detail'] as const;

/** Las tres definiciones de página 1.6 que puede tener una especificación. */
const PAGE_SPEC_KEYS = ['detailPage', 'createPage', 'editPage'] as const;

/** Todos los documentos 1.4 de la especificación: default + cada variante. */
function formDocuments(specification: CatalogSpecification): LayoutDocument[] {
  const documents: LayoutDocument[] = [];
  for (const kind of LEGACY_LAYOUT_KINDS) {
    const definition: LayoutDefinition | undefined = specification.layouts?.[kind];
    if (!definition) continue;
    documents.push(definition.default);
    for (const variant of definition.variants ?? []) documents.push(variant.document);
  }
  return documents;
}

/** Todas las páginas de una definición: default + cada variante. */
function pagesOf(definition: PageLayoutDefinition | undefined): PageLayout[] {
  if (!definition) return [];
  return [definition.default, ...(definition.variants ?? []).map((variant) => variant.page)];
}

/** Todas las páginas de la especificación, de las tres superficies. */
function allPages(specification: CatalogSpecification): PageLayout[] {
  return PAGE_SPEC_KEYS.flatMap((key) => pagesOf(specification[key]));
}

export function renameFieldEverywhere(
  specification: CatalogSpecification,
  previousKey: string,
  nextKey: string,
): void {
  if (previousKey === nextKey) return;

  specification.fields = specification.fields.map((candidate) => ({
    ...candidate,
    visibleWhen: replaceConditionField(candidate.visibleWhen, previousKey, nextKey),
    requiredWhen: replaceConditionField(candidate.requiredWhen, previousKey, nextKey),
  }));

  for (const view of Object.keys(specification.views ?? {})) {
    specification.views![view] = specification.views![view].map((key) =>
      key === previousKey ? nextKey : key,
    );
  }

  if (specification.detailLayout) {
    specification.detailLayout.fields = specification.detailLayout.fields.map((placement) =>
      placement.source === 'catalog' && placement.fieldKey === previousKey
        ? { ...placement, fieldKey: nextKey }
        : placement,
    );
  }

  for (const document of formDocuments(specification)) {
    for (const section of document.sections) {
      section.visibleWhen = replaceConditionField(section.visibleWhen, previousKey, nextKey);
      section.placements = section.placements.map((placement) => ({
        ...placement,
        fieldKey:
          placement.source === 'catalog' && placement.fieldKey === previousKey
            ? nextKey
            : placement.fieldKey,
        visibleWhen: replaceConditionField(placement.visibleWhen, previousKey, nextKey),
      }));
    }
  }

  for (const page of allPages(specification)) {
    for (const region of REGION_NAMES) {
      page[region].placements = page[region].placements.map((placement) => ({
        ...placement,
        fieldKey:
          placement.kind === 'field' && placement.source === 'catalog' && placement.fieldKey === previousKey
            ? nextKey
            : placement.fieldKey,
        visibleWhen: replaceConditionField(placement.visibleWhen, previousKey, nextKey),
      }));
    }
  }
}

export function removeFieldEverywhere(
  specification: CatalogSpecification,
  removedKey: string,
): void {
  for (const view of Object.keys(specification.views ?? {})) {
    specification.views![view] = specification.views![view].filter((key) => key !== removedKey);
  }

  if (specification.detailLayout) {
    specification.detailLayout.fields = specification.detailLayout.fields.filter(
      (placement) => placement.source !== 'catalog' || placement.fieldKey !== removedKey,
    );
  }

  specification.fields = specification.fields.map((field) => ({
    ...field,
    visibleWhen: conditionReferences(field.visibleWhen, removedKey) ? undefined : field.visibleWhen,
    requiredWhen: conditionReferences(field.requiredWhen, removedKey)
      ? undefined
      : field.requiredWhen,
  }));

  for (const document of formDocuments(specification)) {
    document.sections = document.sections.map((section) => ({
      ...section,
      visibleWhen: conditionReferences(section.visibleWhen, removedKey)
        ? undefined
        : section.visibleWhen,
      placements: section.placements
        .filter((placement) => placement.source !== 'catalog' || placement.fieldKey !== removedKey)
        .map((placement) => ({
          ...placement,
          visibleWhen: conditionReferences(placement.visibleWhen, removedKey)
            ? undefined
            : placement.visibleWhen,
        })),
    }));
  }

  // `prunePageToSchema` es exactamente esta operación: descarta
  // los placements de campo de catálogo ausentes del esquema y recompacta la
  // columna SOLO en las filas que perdieron algo, de modo que un hueco
  // deliberado hecho desde el editor avanzado sobrevive. Se reusa en vez de
  // rehacer la aritmética de la grilla acá.
  const survivors = specification.fields.filter((field) => field.key !== removedKey);
  const prune = (page: PageLayout): PageLayout => {
    const pruned = prunePageToSchema(page, survivors);
    for (const region of REGION_NAMES) {
      pruned[region] = {
        ...pruned[region],
        placements: pruned[region].placements.map((placement) => ({
          ...placement,
          visibleWhen: conditionReferences(placement.visibleWhen, removedKey)
            ? undefined
            : placement.visibleWhen,
        })),
      };
    }
    return pruned;
  };

  for (const specKey of PAGE_SPEC_KEYS) {
    const definition = specification[specKey];
    if (!definition) continue;
    specification[specKey] = {
      ...definition,
      default: prune(definition.default),
      variants: definition.variants?.map((variant) => ({ ...variant, page: prune(variant.page) })),
    };
  }
}
