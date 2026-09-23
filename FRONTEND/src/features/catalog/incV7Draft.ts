import type {
  AutomationCapabilityMetadata,
  CatalogDefinition,
  ResourceBinding,
} from './metamodel';

export interface BlueprintA3Reference extends AutomationCapabilityMetadata {
  workflowId: string;
  familyId: string;
  version: 3;
  planContractVersion: 2;
}

const CANONICAL_TRIGGERS = [
  'incident_escalated_to_it2',
  'incident_not_duplicate',
  'incident_service_required',
];

/**
 * Produces the reviewable Catalog INC v7 draft for ADR-0061.
 *
 * It never publishes and never mutates the supplied active definition. The
 * server remains responsible for optimistic draft persistence; this function
 * only makes the exact composition deterministic and testable.
 */
export function buildCatalogIncV7Draft(
  active: CatalogDefinition,
  workflow: BlueprintA3Reference,
  supersededWorkflowFamilyIds: string[],
): CatalogDefinition {
  if (active.entityKey !== 'INC' || active.status !== 'published' || active.version !== 6) {
    throw new Error('Catalog INC v7 must be derived from the published INC v6 definition.');
  }
  if (!workflow.workflowId || !workflow.familyId || workflow.categoryId !== 'INC'
    || workflow.version !== 3 || workflow.planContractVersion !== 2) {
    throw new Error('Blueprint A v3 reference is incomplete or incompatible with Catalog INC.');
  }
  const triggers = [...(workflow.triggers ?? [])].sort();
  if (JSON.stringify(triggers) !== JSON.stringify(CANONICAL_TRIGGERS)) {
    throw new Error('Blueprint A v3 does not expose the complete ADR-0061 trigger contract.');
  }
  const supersededFamilies = new Set(
    [workflow.familyId, ...supersededWorkflowFamilyIds].map((value) => value.trim()).filter(Boolean),
  );
  if (supersededFamilies.size !== supersededWorkflowFamilyIds.length + 1) {
    throw new Error('Superseded workflow families must be non-empty and unique.');
  }

  const specification = structuredClone(active.specification);
  const preservedBindings = (specification.bindings ?? []).filter((binding) => !(
    binding.module === 'automations'
    && binding.resourceType === 'workflow'
    && supersededFamilies.has(binding.resourceId)
  ));
  const canonicalBinding: ResourceBinding = {
    module: 'automations',
    resourceType: 'workflow',
    resourceId: workflow.familyId,
    resourceInstanceId: workflow.workflowId,
    resourceVersion: '3',
    contractVersion: '2',
    enabled: true,
  };
  specification.bindings = [...preservedBindings, canonicalBinding];

  return {
    entityKey: 'INC',
    name: active.name,
    version: 7,
    metamodelVersion: active.metamodelVersion,
    status: 'draft',
    specification,
  };
}
