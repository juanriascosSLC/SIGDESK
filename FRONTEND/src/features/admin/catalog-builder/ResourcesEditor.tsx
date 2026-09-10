import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  listAvailableResources,
  type CatalogSpecification,
} from '@/features/catalog/metamodel';
import { AutomationsBindingsEditor } from './AutomationsBindingsEditor';
import { bindingKinds } from './config';
import {
  EmptyMessage,
  FriendlyField,
  IconButton,
  SectionHeading,
} from './ui';

export function ResourcesEditor({
  specification,
  updateSpecification,
  guided = false,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  guided?: boolean;
}) {
  // Las automatizaciones tienen su propia sección (ADR-0039): su referencia
  // apunta a una versión publicada exacta, admiten varias a la vez y pueden
  // quedar apagadas sin quitarse. Editarlas también aquí dejaría dos sitios que
  // escriben el mismo binding con reglas distintas.
  const bindings = (specification.bindings ?? [])
    .map((binding, index) => ({ binding, index }))
    .filter(({ binding }) => !(binding.module === 'automations' && binding.resourceType === 'workflow'));
  const resourcesQuery = useQuery({
    queryKey: ['catalog-resources'],
    queryFn: listAvailableResources,
  });
  const availableResources = resourcesQuery.data ?? [];

  // La clase «Automatización» se excluye del selector genérico: su vinculación
  // vive en AutomationsBindingsEditor.
  const clasesGenericas = bindingKinds.filter(
    (kind) => !(kind.module === 'automations' && kind.resourceType === 'workflow'),
  );

  function addBinding() {
    const first = availableResources.find(
      (resource) => resource.reference.module !== 'automations',
    );
    if (!first) return;
    updateSpecification((current) => {
      current.bindings = [
        ...(current.bindings ?? []),
        {
          module: first.reference.module,
          resourceType: first.reference.resourceType,
          resourceId: first.reference.resourceId,
          resourceVersion: first.reference.resourceVersion,
          contractVersion: first.reference.contractVersion,
          required: first.reference.required,
        },
      ];
      return current;
    });
  }

  return (
    <div className="space-y-6">
    <AutomationsBindingsEditor specification={specification} updateSpecification={updateSpecification} />
    <section className="panel-card p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          icon={<Link2 className="w-5 h-5" />}
          title="Connected resources"
          description="Connect policies and capabilities managed by other modules."
        />
        <button
          onClick={addBinding}
          disabled={resourcesQuery.isLoading || availableResources.length === 0}
          className="primary-button disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          {resourcesQuery.isLoading
            ? 'Loading capabilities…'
            : guided
              ? 'Add capability'
              : 'Connect resource'}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3 text-sm">
        <Check className="w-5 h-5 text-cyan-300 shrink-0" />
        <p className="text-on-surface-variant">
          The Entity Builder determines which resource this entity uses. The specialized module remains
          the owner of its configuration.
        </p>
      </div>

      {bindings.length === 0 ? (
        <EmptyMessage
          text={
            resourcesQuery.isError
              ? 'Unable to fetch module capabilities.'
              : guided
              ? 'This step is optional. You can continue and connect permissions, SLA, or automations later.'
              : 'This entity does not use policies, SLA, automations, or integrations yet.'
          }
        />
      ) : (
        <div className="space-y-3 mt-6">
          {bindings.map(({ binding, index }) => {
            const selectedKind = bindingKinds.find(
              (item) =>
                item.module === binding.module && item.resourceType === binding.resourceType,
            );
            const compatibleResources = availableResources.filter(
              (resource) =>
                resource.reference.module === binding.module &&
                resource.reference.resourceType === binding.resourceType,
            );
            return (
              <div
                key={`${binding.module}:${binding.resourceType}-${index}`}
                className="rounded-2xl border border-border/50 bg-surface-container p-5"
              >
                <div
                  className={`grid items-end gap-4 ${
                    guided
                      ? 'lg:grid-cols-[220px_minmax(0,1fr)_40px]'
                      : 'lg:grid-cols-[220px_minmax(0,1fr)_130px_110px_40px]'
                  }`}
                >
                  <FriendlyField label="Resource type">
                    <select
                      value={`${binding.module}:${binding.resourceType}`}
                      onChange={(event) =>
                        updateSpecification((current) => {
                          const [module, resourceType] = event.target.value.split(':');
                          const firstCompatible = availableResources.find(
                            (resource) =>
                              resource.reference.module === module &&
                              resource.reference.resourceType === resourceType,
                          );
                          current.bindings![index].module = module;
                          current.bindings![index].resourceType = resourceType;
                          current.bindings![index].resourceId =
                            firstCompatible?.reference.resourceId ?? '';
                          current.bindings![index].resourceVersion =
                            firstCompatible?.reference.resourceVersion;
                          current.bindings![index].contractVersion =
                            firstCompatible?.reference.contractVersion ?? '1';
                          return current;
                        })
                      }
                      className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                      style={{ colorScheme: 'dark' }}
                    >
                      {clasesGenericas.map((kind) => (
                        <option
                          key={`${kind.module}:${kind.resourceType}`}
                          value={`${kind.module}:${kind.resourceType}`}
                          className="bg-[#191c22] text-[#e1e2eb]"
                        >
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </FriendlyField>
                  <FriendlyField
                    label="Available capability"
                    help={`Selected from ${selectedKind?.owner ?? 'the corresponding module'}.`}
                  >
                    <select
                      value={binding.resourceId}
                      onChange={(event) =>
                        updateSpecification((current) => {
                          const selectedResource = compatibleResources.find(
                            (resource) => resource.reference.resourceId === event.target.value,
                          );
                          if (!selectedResource) return current;
                          current.bindings![index].resourceId =
                            selectedResource.reference.resourceId;
                          current.bindings![index].resourceVersion =
                            selectedResource.reference.resourceVersion;
                          current.bindings![index].contractVersion =
                            selectedResource.reference.contractVersion;
                          return current;
                        })
                      }
                      className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                      style={{ colorScheme: 'dark' }}
                    >
                      {compatibleResources.length === 0 && (
                        <option value="" className="bg-[#191c22] text-[#e1e2eb]">No published resources</option>
                      )}
                      {compatibleResources.map((resource) => (
                        <option
                          key={`${resource.reference.resourceId}:${resource.reference.resourceVersion}`}
                          value={resource.reference.resourceId}
                          className="bg-[#191c22] text-[#e1e2eb]"
                        >
                          {resource.displayName} · v{resource.reference.resourceVersion}
                        </option>
                      ))}
                    </select>
                  </FriendlyField>
                  {!guided && <FriendlyField label="Version">
                    <input
                      value={binding.resourceVersion ?? ''}
                      onChange={(event) =>
                        updateSpecification((current) => {
                          current.bindings![index].resourceVersion =
                            event.target.value || undefined;
                          return current;
                        })
                      }
                      placeholder="Will resolve upon publishing"
                      className="friendly-input"
                    />
                  </FriendlyField>}
                  {!guided && <FriendlyField label="Contract">
                    <input
                      value={binding.contractVersion ?? '1'}
                      onChange={(event) =>
                        updateSpecification((current) => {
                          current.bindings![index].contractVersion =
                            event.target.value || undefined;
                          return current;
                        })
                      }
                      placeholder="1"
                      className="friendly-input"
                    />
                  </FriendlyField>}
                  <IconButton
                    label="Disconnect resource"
                    danger
                    onClick={() =>
                      updateSpecification((current) => {
                        current.bindings!.splice(index, 1);
                        return current;
                      })
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
    </div>
  );
}
