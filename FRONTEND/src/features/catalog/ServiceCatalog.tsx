import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Braces, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listDefinitions, type CatalogDefinition } from './metamodel';

export function ServiceCatalog() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const definitionsQuery = useQuery({
    queryKey: ['published-definitions'],
    queryFn: () => listDefinitions(true),
  });
  const definitions = useMemo(() => {
    // Defensive for gradual rollouts: the new backend already responds with
    // only active definitions, but an older instance may ignore `active=true`
    // and return the full history. Never show more than one option per entity.
    const byEntityKey = new Map<string, CatalogDefinition>();
    for (const definition of definitionsQuery.data ?? []) {
      const current = byEntityKey.get(definition.entityKey);
      if (!current || (definition.version ?? 0) > (current.version ?? 0)) {
        byEntityKey.set(definition.entityKey, definition);
      }
    }
    const operationalDefinitions = [...byEntityKey.values()];
    const term = search.toLowerCase().trim();
    if (!term) return operationalDefinitions;
    return operationalDefinitions.filter((definition) =>
      `${definition.entityKey} ${definition.name} ${definition.specification.description}`
        .toLowerCase()
        .includes(term),
    );
  }, [definitionsQuery.data, search]);

  return (
    <div className="p-6 lg:p-8 w-full space-y-8">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-black text-on-surface tracking-tight">What do you need to create?</h1>
        <p className="text-on-surface-variant max-w-xl mx-auto">
          This catalog is generated directly from the definitions published in the Entity Builder.
        </p>
        <div className="relative max-w-2xl mx-auto mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a published definition…"
            className="w-full bg-surface-container-low border border-cyan-500/30 text-on-surface text-lg rounded-2xl pl-12 pr-6 py-4 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {definitionsQuery.isLoading && (
        <p className="text-center text-on-surface-variant">Loading metamodel…</p>
      )}
      {definitionsQuery.isError && (
        <p className="text-center text-red-400">{definitionsQuery.error.message}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {definitions.map((definition) => (
          <button
            key={definition.id}
            data-testid={`catalog-option-${definition.entityKey}`}
            onClick={() => navigate(`../catalog/${definition.entityKey}`)}
            className="group text-left bg-surface-container-low border border-border rounded-3xl p-6 hover:border-cyan-500/40 hover:bg-on-surface/[0.03] transition-all"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Braces className="w-6 h-6 text-cyan-400" />
              </div>
              <span className="font-mono text-xs text-on-surface-variant">v{definition.version}</span>
            </div>
            <div className="text-xs font-black tracking-widest text-primary mb-2">{definition.entityKey}</div>
            <h3 className="text-lg font-bold text-on-surface mb-2">{definition.name}</h3>
            <p className="text-sm text-on-surface-variant min-h-16">
              {definition.specification.description}
            </p>
            <span className="mt-5 flex items-center gap-2 text-sm font-bold text-primary">
              Create record <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
