import type {
  AudienceKey,
  LayoutDefinition,
  LayoutDocument,
  LayoutSection,
  Placement,
} from '@/features/catalog/metamodel';

// La variante se resuelve por `audienceKey`, NUNCA por `variant.key`.
//
// `LayoutVariant.key` es un uuid opaco generado al crearla; `audienceKey` es
// la audiencia real ('requester' | 'agent' | 'supervisor'). El diseñador
// selecciona por audiencia — es lo único que el usuario elige — así que
// comparar contra `key` no coincidía jamás: la lectura caía al `default` y la
// escritura recorría `variants` sin encontrar nada, con lo que
// `commitDocumentChange` terminaba guardando sobre el layout por defecto.
// Editar la variante "Técnico" reescribía en silencio la predeterminada. El
// diseñador de la página de Detalle (PageDesigner) siempre resolvió por
// `audienceKey`; esto alinea el de formularios con él.
export function getDocument(
  definition: LayoutDefinition | undefined,
  audienceKey: AudienceKey | null,
): LayoutDocument {
  if (!definition) return { sections: [] };
  if (!audienceKey) return definition.default;
  return (
    definition.variants?.find((variant) => variant.audienceKey === audienceKey)?.document ??
    definition.default
  );
}

export function setDocument(
  definition: LayoutDefinition | undefined,
  audienceKey: AudienceKey | null,
  document: LayoutDocument,
): LayoutDefinition {
  const base = definition ?? { default: { sections: [] } };
  if (!audienceKey) return { ...base, default: document };
  const variants = base.variants ?? [];
  return {
    ...base,
    variants: variants.map((variant) =>
      variant.audienceKey === audienceKey ? { ...variant, document } : variant,
    ),
  };
}

/** Quita la variante de una audiencia. El layout por defecto no se toca. */
export function removeVariant(
  definition: LayoutDefinition | undefined,
  audienceKey: AudienceKey,
): LayoutDefinition {
  const base = definition ?? { default: { sections: [] } };
  return {
    ...base,
    variants: (base.variants ?? []).filter((variant) => variant.audienceKey !== audienceKey),
  };
}

export function addSection(document: LayoutDocument, section: LayoutSection): LayoutDocument {
  return { sections: [...document.sections, section] };
}

export function removeSection(document: LayoutDocument, sectionId: string): LayoutDocument {
  return { sections: document.sections.filter((section) => section.id !== sectionId) };
}

export function updateSection(
  document: LayoutDocument,
  sectionId: string,
  updater: (section: LayoutSection) => LayoutSection,
): LayoutDocument {
  return {
    sections: document.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
  };
}

export function moveSection(document: LayoutDocument, fromIndex: number, toIndex: number): LayoutDocument {
  const sections = [...document.sections];
  const [moved] = sections.splice(fromIndex, 1);
  if (!moved) return document;
  sections.splice(toIndex, 0, moved);
  return { sections };
}

export function duplicateSection(
  document: LayoutDocument,
  sectionId: string,
  newSectionId: string,
  newPlacementIds: string[],
): LayoutDocument {
  const index = document.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return document;
  const original = document.sections[index];
  const clone: LayoutSection = {
    ...original,
    id: newSectionId,
    placements: original.placements.map((placement, placementIndex) => ({
      ...placement,
      id: newPlacementIds[placementIndex] ?? `${newSectionId}-${placementIndex}`,
    })),
  };
  const sections = [...document.sections];
  sections.splice(index + 1, 0, clone);
  return { sections };
}

export function insertPlacementAt(
  document: LayoutDocument,
  sectionId: string,
  index: number,
  placement: Placement,
): LayoutDocument {
  return updateSection(document, sectionId, (section) => {
    const placements = [...section.placements];
    const boundedIndex = Math.min(Math.max(index, 0), placements.length);
    placements.splice(boundedIndex, 0, placement);
    return { ...section, placements };
  });
}

export function removePlacement(document: LayoutDocument, placementId: string): LayoutDocument {
  return {
    sections: document.sections.map((section) => ({
      ...section,
      placements: section.placements.filter((placement) => placement.id !== placementId),
    })),
  };
}

export function updatePlacement(
  document: LayoutDocument,
  placementId: string,
  updater: (placement: Placement) => Placement,
): LayoutDocument {
  return {
    sections: document.sections.map((section) => ({
      ...section,
      placements: section.placements.map((placement) =>
        placement.id === placementId ? updater(placement) : placement,
      ),
    })),
  };
}

// Moves a placement to a target section/index, correctly accounting for the
// index shift that happens when the origin and target section are the same
// (removing the item first would otherwise push a later target index left).
export function movePlacement(
  document: LayoutDocument,
  placementId: string,
  targetSectionId: string,
  targetIndex: number,
): LayoutDocument {
  let moved: Placement | undefined;
  let originSectionId: string | undefined;
  let originIndex = -1;
  document.sections.forEach((section) => {
    const index = section.placements.findIndex((placement) => placement.id === placementId);
    if (index !== -1) {
      moved = section.placements[index];
      originSectionId = section.id;
      originIndex = index;
    }
  });
  if (!moved) return document;

  let adjustedIndex = targetIndex;
  if (originSectionId === targetSectionId && originIndex < targetIndex) {
    adjustedIndex -= 1;
  }

  const withoutMoved = document.sections.map((section) => ({
    ...section,
    placements: section.placements.filter((placement) => placement.id !== placementId),
  }));

  return {
    sections: withoutMoved.map((section) => {
      if (section.id !== targetSectionId) return section;
      const placements = [...section.placements];
      const boundedIndex = Math.min(Math.max(adjustedIndex, 0), placements.length);
      placements.splice(boundedIndex, 0, moved!);
      return { ...section, placements };
    }),
  };
}
