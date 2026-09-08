import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Box,
  Camera,
  Database,
  GitPullRequest,
  History,
  MapPin,
  Network,
  RadioTower,
  Router,
  RefreshCw,
  Search,
  Server,
  Ticket,
  SearchCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import { getAssetOperationalHistory, listAssetSites, listSiteAssets, setAssetOrganizationUnits, setAssetOrganizationUnitsBulk, type AssetProjection } from './api';
import { rbacService, type Company } from '@/features/admin/rbac.service';
import { useAuth } from '@/features/auth/useAuth';

const kindIcon: Record<string, typeof Box> = {
  camera: Camera,
  nvr: Database,
  server: Server,
  switch: Network,
  router: Router,
  pdu: Database,
  radio: RadioTower,
  'access-point': RadioTower,
  'access-control': Network,
  site: MapPin,
};

function AssetCard({ asset, selected, onSelect }: { asset: AssetProjection; selected: boolean; onSelect: () => void }) {
  const Icon = kindIcon[asset.assetType.toLowerCase()] ?? kindIcon[asset.kind] ?? Box;
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-2xl border bg-surface-container p-4 text-left transition hover:border-primary/40 ${selected ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-on-surface">{asset.displayName}</h3>
            <p className="mt-1 font-mono text-[10px] text-on-surface-variant">{asset.externalKey}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${asset.lifecycle === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
          {asset.status || asset.lifecycle}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div><dt className="text-on-surface-variant">Tipo</dt><dd className="font-bold capitalize text-on-surface">{asset.assetType || asset.kind}</dd></div>
        <div><dt className="text-on-surface-variant">IP</dt><dd className="font-mono text-on-surface">{asset.ipAddress || '—'}</dd></div>
        <div><dt className="text-on-surface-variant">Fabricante</dt><dd className="font-bold text-on-surface">{asset.manufacturer || '—'}</dd></div>
        <div><dt className="text-on-surface-variant">Modelo / serial</dt><dd className="truncate font-bold text-on-surface">{asset.model || asset.serial || '—'}</dd></div>
      </dl>
    </button>
  );
}

export default function AssetsCMDB() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [assetType, setAssetType] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [accessSiteId, setAccessSiteId] = useState('');
  // Selección para la asignación masiva: vive aparte del sitio "abierto" en el
  // panel derecho, porque son dos gestos distintos (mirar uno vs. configurar
  // muchos).
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const sitesQuery = useQuery({
    queryKey: ['assets', 'sites', deferredSearch],
    queryFn: () => listAssetSites(deferredSearch),
  });
  const sites = sitesQuery.data?.items ?? [];
  const effectiveSite = selectedSite || sites[0]?.id || '';
  const assetsQuery = useQuery({
    queryKey: ['assets', 'site', effectiveSite, assetType],
    queryFn: () => listSiteAssets(effectiveSite, assetType),
    enabled: Boolean(effectiveSite),
  });
  const assetTypesQuery = useQuery({
    queryKey: ['assets', 'site', effectiveSite, 'all-types'],
    queryFn: () => listSiteAssets(effectiveSite),
    enabled: Boolean(effectiveSite),
  });
  const types = useMemo(
    () => Array.from(new Set((assetTypesQuery.data?.items ?? []).map((asset) => asset.assetType).filter(Boolean))).sort(),
    [assetTypesQuery.data],
  );
  const stale = Boolean(sitesQuery.data?.stale || assetsQuery.data?.stale || assetTypesQuery.data?.stale);
  const selectedAsset = assetsQuery.data?.items.find((asset) => asset.id === selectedAssetId);
  const selectedSiteAsset = sites.find((site) => site.id === effectiveSite);
  const historyQuery = useQuery({
    queryKey: ['assets', selectedAssetId, 'operational-history'],
    queryFn: () => getAssetOperationalHistory(selectedAssetId),
    enabled: Boolean(selectedAssetId),
  });

  return (
    <div className="min-h-full bg-surface-container-lowest p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-primary">Assets / CMDB</div>
          <h1 className="mt-2 text-3xl font-black text-on-surface">Inventario operativo</h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">Vista de solo lectura sincronizada desde SIGInventory. SIG-DESK conserva referencias estables y snapshots históricos; la información maestra continúa perteneciendo a Inventory.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void sitesQuery.refetch();
            // `refetch()` deliberately bypasses React Query's `enabled`
            // flag. Do not turn an empty site list into the malformed route
            // `/assets/sites//assets` while Inventory is unavailable.
            if (effectiveSite) {
              void assetsQuery.refetch();
              void assetTypesQuery.refetch();
            }
          }}
          className="secondary-button"
        ><RefreshCw className="h-4 w-4" />Sincronizar</button>
      </header>

      {stale && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Mostrando la última proyección disponible porque SIGInventory no respondió o no tiene credencial configurada.
        </div>
      )}
      {sitesQuery.isError && <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" role="alert"><p>{sitesQuery.error.message}</p><button type="button" onClick={() => void sitesQuery.refetch()} className="secondary-button mt-3" data-testid="assets-sites-retry"><RefreshCw className="h-4 w-4" />Reintentar</button></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border/40 bg-surface-container-low p-4">
          <div className="mb-3 flex items-center justify-between px-1 text-xs text-on-surface-variant">
            <span>Sitios disponibles</span>
            <span data-testid="asset-site-count" className="font-black text-primary">{sites.length}</span>
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-3 h-4 w-4 text-on-surface-variant" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sitio…" className="input-field w-full pl-10" />
          </label>
          {can('assets:update') && sites.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/30 bg-surface-container px-2 py-2 text-[11px]">
              <button
                type="button"
                data-testid="assets-select-all-filtered"
                onClick={() =>
                  setBulkSelection((current) =>
                    // Selecciona lo que el filtro muestra AHORA, no todo el
                    // inventario: es la diferencia entre "asignar mis 12 sitios
                    // de Bogotá" y tocar los 248 sin querer.
                    current.length === sites.length ? [] : sites.map((site) => site.id),
                  )
                }
                className="font-bold text-primary"
              >
                {bulkSelection.length === sites.length ? 'Quitar selección' : `Seleccionar los ${sites.length} del filtro`}
              </button>
              {bulkSelection.length > 0 && (
                <>
                  <span className="text-on-surface-variant">{bulkSelection.length} seleccionados</span>
                  <button
                    type="button"
                    data-testid="assets-bulk-open"
                    onClick={() => setBulkOpen(true)}
                    className="ml-auto font-bold text-primary"
                  >
                    Asignar área…
                  </button>
                </>
              )}
            </div>
          )}
          <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto">
            {sitesQuery.isLoading && <p className="p-3 text-sm text-on-surface-variant">Sincronizando sitios…</p>}
            {!sitesQuery.isLoading && sites.length === 0 && <div className="rounded-2xl border border-dashed border-border/50 p-5 text-sm text-on-surface-variant">No hay sitios disponibles. Resources no pudo consultar SIGInventory y todavía no tiene una proyección local. Verifica <code>INVENTORY_API_URL</code>, la conectividad y una credencial Bearer válida; después reinicia Resources.</div>}
            {sites.map((site) => (
              <div key={site.id} className={`flex items-center gap-2 rounded-2xl border p-3 transition ${site.id === effectiveSite ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-surface-container hover:border-primary/30'}`}>
                {can('assets:update') && (
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar ${site.displayName}`}
                    data-testid={`assets-bulk-check-${site.id}`}
                    checked={bulkSelection.includes(site.id)}
                    onChange={() =>
                      setBulkSelection((current) =>
                        current.includes(site.id)
                          ? current.filter((id) => id !== site.id)
                          : [...current, site.id],
                      )
                    }
                    className="h-4 w-4 shrink-0 accent-cyan-500"
                  />
                )}
                <button type="button" onClick={() => setSelectedSite(site.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" /><span className="truncate text-sm font-bold text-on-surface">{site.displayName}</span></div>
                  <div className="mt-1 truncate font-mono text-[10px] text-on-surface-variant">{site.externalKey}</div>
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 rounded-3xl border border-border/40 bg-surface-container-low p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-black text-on-surface">{selectedSiteAsset?.displayName || 'Selecciona un sitio'}</h2><p className="mt-1 text-xs text-on-surface-variant">{assetsQuery.data?.items.length ?? 0} activos sincronizados</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {can('assets:update') && selectedSiteAsset && (
                <button type="button" onClick={() => setAccessSiteId(selectedSiteAsset.id)} className="secondary-button">
                  <ShieldCheck className="h-4 w-4" />Configurar acceso
                </button>
              )}
              <select value={assetType} onChange={(event) => setAssetType(event.target.value)} className="input-field min-w-44"><option value="">Todos los tipos</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
            </div>
          </div>
          {bulkOpen && bulkSelection.length > 0 && (
            <BulkAccessEditor
              assetIds={bulkSelection}
              onClose={() => setBulkOpen(false)}
              onApplied={() => {
                setBulkOpen(false);
                setBulkSelection([]);
                void sitesQuery.refetch();
                void assetsQuery.refetch();
              }}
            />
          )}
          {selectedSiteAsset && accessSiteId === selectedSiteAsset.id && (
            <AssetAccessEditor
              key={selectedSiteAsset.id}
              site={selectedSiteAsset}
              onClose={() => setAccessSiteId('')}
              onSaved={() => {
                void sitesQuery.refetch();
                void assetsQuery.refetch();
              }}
            />
          )}
          {assetsQuery.isLoading ? <p className="mt-8 text-sm text-on-surface-variant">Cargando activos…</p> : assetsQuery.isError ? <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"><p>{assetsQuery.error.message}</p><button type="button" onClick={() => void assetsQuery.refetch()} className="secondary-button mt-3"><RefreshCw className="h-4 w-4" />Reintentar</button></div> : (assetsQuery.data?.items.length ?? 0) === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-border/50 p-10 text-center text-sm text-on-surface-variant">Este sitio no tiene activos disponibles para el filtro actual.</div> : <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{assetsQuery.data!.items.map((asset) => <AssetCard key={asset.id} asset={asset} selected={asset.id === selectedAssetId} onSelect={() => setSelectedAssetId(asset.id)} />)}</div>}

          {selectedAsset && (
            <section className="mt-6 rounded-2xl border border-border/40 bg-surface-container p-5">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><History className="h-5 w-5" /></div><div><h3 className="font-black text-on-surface">Historial operativo de {selectedAsset.displayName}</h3><p className="mt-1 text-xs text-on-surface-variant">INC, PRB y RFC que conservaron este asset en su snapshot.</p></div></div>
              {historyQuery.isLoading ? <p className="mt-5 text-sm text-on-surface-variant">Consultando dominios…</p> : historyQuery.data && (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-border/30 p-4"><div className="flex items-center gap-2 text-xs font-black text-primary"><Ticket className="h-4 w-4" />INC · {historyQuery.data.incidents.length}</div><div className="mt-3 space-y-2">{historyQuery.data.incidents.slice(0, 8).map((record) => <Link key={record.id} to={`/app/tickets/${record.id}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10">{record.humanId ?? record.id} · {record.title}</Link>)}{historyQuery.data.incidents.length === 0 && <p className="text-xs text-on-surface-variant">Sin incidentes relacionados.</p>}</div></div>
                  <div className="rounded-xl border border-border/30 p-4"><div className="flex items-center gap-2 text-xs font-black text-primary"><SearchCode className="h-4 w-4" />PRB · {historyQuery.data.problems.length}</div><div className="mt-3 space-y-2">{historyQuery.data.problems.slice(0, 8).map((record) => <Link key={record.id} to={`/app/problems/${record.humanId}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10">{record.humanId} · {String(record.data.title ?? 'Problema')}</Link>)}{historyQuery.data.problems.length === 0 && <p className="text-xs text-on-surface-variant">Sin problemas relacionados.</p>}</div></div>
                  <div className="rounded-xl border border-border/30 p-4"><div className="flex items-center gap-2 text-xs font-black text-primary"><GitPullRequest className="h-4 w-4" />RFC · {historyQuery.data.changes.length}</div><div className="mt-3 space-y-2">{historyQuery.data.changes.slice(0, 8).map((record) => <Link key={record.id} to={`/app/changes/${record.humanId}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10">{record.humanId} · {String(record.data.title ?? 'Cambio')}</Link>)}{historyQuery.data.changes.length === 0 && <p className="text-xs text-on-surface-variant">Sin cambios relacionados.</p>}</div></div>
                  {historyQuery.data.unavailableDomains.length > 0 && <p className="text-xs text-amber-300 lg:col-span-3">No fue posible consultar: {historyQuery.data.unavailableDomains.join(', ')}. Puede deberse a permisos insuficientes o a un servicio temporalmente fuera de línea.</p>}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function AssetAccessEditor({ site, onClose, onSaved }: { site: AssetProjection; onClose: () => void; onSaved: () => void }) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>(site.organizationUnitIds ?? []);
  const companiesQuery = useQuery({
    queryKey: ['rbac', 'companies'],
    queryFn: rbacService.listCompanies,
  });
  const saveMutation = useMutation({
    mutationFn: () => setAssetOrganizationUnits(site.id, selectedUnitIds),
    onSuccess: onSaved,
  });
  const assignableUnits = (companiesQuery.data ?? []).filter((company) => company.type !== 'empresa');

  const toggle = (company: Company) => {
    setSelectedUnitIds((current) =>
      current.includes(company.id)
        ? current.filter((id) => id !== company.id)
        : [...current, company.id],
    );
  };

  return (
    <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-label="Acceso organizacional del sitio">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-black text-on-surface"><ShieldCheck className="h-4 w-4 text-primary" />Acceso por área o equipo</h3>
          <p className="mt-1 text-xs text-on-surface-variant">Los dispositivos del sitio heredan estas unidades. Puedes seleccionar varias áreas.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar configuración de acceso" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"><X className="h-4 w-4" /></button>
      </div>

      {companiesQuery.isLoading ? (
        <p className="mt-4 text-sm text-on-surface-variant">Cargando estructura de Organization…</p>
      ) : companiesQuery.isError ? (
        <p className="mt-4 text-sm text-red-300">{companiesQuery.error.message}</p>
      ) : assignableUnits.length === 0 ? (
        <p className="mt-4 text-sm text-amber-200">Primero crea un departamento o equipo en Users & Roles → Organización.</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {assignableUnits.map((company) => (
            <label key={company.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-surface-container px-3 py-3 text-sm text-on-surface">
              <input type="checkbox" checked={selectedUnitIds.includes(company.id)} onChange={() => toggle(company)} className="h-4 w-4 accent-cyan-500" />
              <span><strong className="block">{company.name}</strong><span className="text-[10px] uppercase text-on-surface-variant">{company.type}</span></span>
            </label>
          ))}
        </div>
      )}

      {saveMutation.isError && <p className="mt-3 text-xs text-red-300">{saveMutation.error.message}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="secondary-button">Cancelar</button>
        <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || companiesQuery.isLoading} className="primary-button">
          {saveMutation.isPending ? 'Guardando…' : 'Guardar acceso'}
        </button>
      </div>
    </section>
  );
}

/**
 * Asignación de áreas a un lote de sitios.
 *
 * Reusa la misma lista de unidades que el editor de un solo sitio; lo que
 * añade son los modos: sobre un lote heterogéneo, "reemplazar" borraría
 * asignaciones que alguien puso a mano, así que "agregar" y "quitar" tienen
 * que ser opciones de primera clase y no un efecto secundario.
 */
function BulkAccessEditor({
  assetIds,
  onClose,
  onApplied,
}: {
  assetIds: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'replace' | 'add' | 'remove'>('add');
  const companiesQuery = useQuery({
    queryKey: ['rbac', 'companies'],
    queryFn: rbacService.listCompanies,
  });
  const saveMutation = useMutation({
    mutationFn: () => setAssetOrganizationUnitsBulk(assetIds, selectedUnitIds, mode),
    onSuccess: onApplied,
  });
  const assignableUnits = (companiesQuery.data ?? []).filter((company) => company.type !== 'empresa');

  return (
    <section
      className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5"
      aria-label="Asignación masiva de acceso"
      data-testid="assets-bulk-editor"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-black text-on-surface">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Asignar área a {assetIds.length} sitios
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Los dispositivos de cada sitio heredan estas unidades, así que no hace falta tocarlos uno por uno.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar asignación masiva" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ['add', 'Agregar'],
          ['remove', 'Quitar'],
          ['replace', 'Reemplazar'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-testid={`assets-bulk-mode-${value}`}
            onClick={() => setMode(value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${
              mode === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/40 text-on-surface-variant'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'replace' && (
        <p className="mt-2 text-xs text-amber-200">
          Reemplazar deja exactamente las áreas marcadas y descarta las que cada sitio tuviera antes.
        </p>
      )}

      {companiesQuery.isLoading ? (
        <p className="mt-4 text-sm text-on-surface-variant">Cargando estructura de Organization…</p>
      ) : companiesQuery.isError ? (
        <p className="mt-4 text-sm text-red-300">{companiesQuery.error.message}</p>
      ) : assignableUnits.length === 0 ? (
        <p className="mt-4 text-sm text-amber-200">Primero crea un departamento o equipo en Users &amp; Roles → Organización.</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {assignableUnits.map((company) => (
            <label key={company.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-surface-container px-3 py-3 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={selectedUnitIds.includes(company.id)}
                onChange={() =>
                  setSelectedUnitIds((current) =>
                    current.includes(company.id)
                      ? current.filter((id) => id !== company.id)
                      : [...current, company.id],
                  )
                }
                className="h-4 w-4 accent-cyan-500"
              />
              <span><strong className="block">{company.name}</strong><span className="text-[10px] uppercase text-on-surface-variant">{company.type}</span></span>
            </label>
          ))}
        </div>
      )}

      {saveMutation.isError && <p className="mt-3 text-xs text-red-300">{saveMutation.error.message}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="secondary-button">Cancelar</button>
        <button
          type="button"
          data-testid="assets-bulk-apply"
          disabled={saveMutation.isPending || (mode !== 'replace' && selectedUnitIds.length === 0)}
          onClick={() => saveMutation.mutate()}
          className="primary-button"
        >
          {saveMutation.isPending ? 'Aplicando…' : `Aplicar a ${assetIds.length} sitios`}
        </button>
      </div>
    </section>
  );
}
