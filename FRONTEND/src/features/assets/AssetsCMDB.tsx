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
import { getAssetOperationalHistory, listAssetSites, listSiteAssets, setAssetOrganizationUnits, setAssetOrganizationUnitsBulk, type AssetProjection, type AssociatedEntityRecord } from './api';
import { formatOperationalIssue } from './operational-history-presentation';
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

/**
 * Small provenance badge for a PRB/RFC in operational history — the
 * explicit distinction between "this record's own immutable snapshot named
 * this asset" (Direct asset) and "this record is shown because it relates
 * to an INC/PRB that does" (Via INC-000582 / Via PRB-000098). Never omitted:
 * a result without this badge would read as if every record personally
 * stores the asset, which is exactly the claim this correction removes.
 */
function ProvenanceBadge({ record }: { record: AssociatedEntityRecord }) {
  const label = record.associationPath === 'direct_asset'
    ? 'Direct asset'
    : `Via ${record.viaHumanId ?? record.viaEntityKey ?? '—'}`;
  return (
    <span className="mt-1 inline-block rounded-full border border-border/40 bg-surface-container px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-on-surface-variant">
      {label}
    </span>
  );
}


/**
 * The mandatory adjacent warning for a domain whose `items` may be missing
 * entries — a partial PRB/RFC list must NEVER render as an indistinguishable
 * "PRB · N" the way a genuinely complete result does. `issues` is empty
 * exactly when the domain is complete, so this renders nothing then.
 */
function DomainIncompleteWarning({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  const translatedTitle = issues.map(formatOperationalIssue).join(' ');
  return (
    <span
      data-testid="domain-incomplete-warning"
      title={translatedTitle}
      className="inline-flex items-center gap-1 rounded-full border border-status-warning-border bg-status-warning-bg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-status-warning-fg"
    >
      <AlertTriangle className="h-3 w-3 text-status-warning-icon" />Partial
    </span>
  );
}

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
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${asset.lifecycle === 'active' ? 'border-status-success-border bg-status-success-bg text-status-success-fg' : 'border-status-warning-border bg-status-warning-bg text-status-warning-fg'}`}>
          {asset.status || asset.lifecycle}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div><dt className="text-on-surface-variant">Type</dt><dd className="font-bold capitalize text-on-surface">{asset.assetType || asset.kind}</dd></div>
        <div><dt className="text-on-surface-variant">IP</dt><dd className="font-mono text-on-surface">{asset.ipAddress || '—'}</dd></div>
        <div><dt className="text-on-surface-variant">Manufacturer</dt><dd className="font-bold text-on-surface">{asset.manufacturer || '—'}</dd></div>
        <div><dt className="text-on-surface-variant">Model / serial</dt><dd className="truncate font-bold text-on-surface">{asset.model || asset.serial || '—'}</dd></div>
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
  // Selection for bulk assignment: separate from the site open in the right panel.
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
          <h1 className="mt-2 text-3xl font-black text-on-surface">Operational Inventory</h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">Read-only view synchronized from SIGInventory. SIG-DESK maintains stable references and historical snapshots; master information continues to belong to Inventory.</p>
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
        ><RefreshCw className="h-4 w-4" />Sync</button>
      </header>

      {stale && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Showing the latest available projection because SIGInventory did not respond or has no configured credential.
        </div>
      )}
      {sitesQuery.isError && <div className="mt-6 rounded-2xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg" role="alert"><p>{sitesQuery.error.message}</p><button type="button" onClick={() => void sitesQuery.refetch()} className="secondary-button mt-3" data-testid="assets-sites-retry"><RefreshCw className="h-4 w-4" />Retry</button></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border/40 bg-surface-container-low p-4">
          <div className="mb-3 flex items-center justify-between px-1 text-xs text-on-surface-variant">
            <span>Available sites</span>
            <span data-testid="asset-site-count" className="font-black text-primary">{sites.length}</span>
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-3 h-4 w-4 text-on-surface-variant" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search site…" className="input-field w-full pl-10" />
          </label>
          {can('assets:update') && sites.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/30 bg-surface-container px-2 py-2 text-[11px]">
              <button
                type="button"
                data-testid="assets-select-all-filtered"
                onClick={() =>
                  setBulkSelection((current) =>
                    current.length === sites.length ? [] : sites.map((site) => site.id),
                  )
                }
                className="font-bold text-primary"
              >
                {bulkSelection.length === sites.length ? 'Clear selection' : `Select all ${sites.length} filtered sites`}
              </button>
              {bulkSelection.length > 0 && (
                <>
                  <span className="text-on-surface-variant">{bulkSelection.length} selected</span>
                  <button
                    type="button"
                    data-testid="assets-bulk-open"
                    onClick={() => setBulkOpen(true)}
                    className="ml-auto font-bold text-primary"
                  >
                    Assign organizational unit…
                  </button>
                </>
              )}
            </div>
          )}
          <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto">
            {sitesQuery.isLoading && <p className="p-3 text-sm text-on-surface-variant">Synchronizing sites…</p>}
            {!sitesQuery.isLoading && sites.length === 0 && <div className="rounded-2xl border border-dashed border-border/50 p-5 text-sm text-on-surface-variant">No sites available. Resources could not query SIGInventory and does not yet have a local projection. Check <code>INVENTORY_API_URL</code>, connectivity, and a valid Bearer credential; then restart Resources.</div>}
            {sites.map((site) => (
              <div key={site.id} className={`flex items-center gap-2 rounded-2xl border p-3 transition ${site.id === effectiveSite ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-surface-container hover:border-primary/30'}`}>
                {can('assets:update') && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${site.displayName}`}
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
            <div><h2 className="text-lg font-black text-on-surface">{selectedSiteAsset?.displayName || 'Select a site'}</h2><p className="mt-1 text-xs text-on-surface-variant">{assetsQuery.data?.items.length ?? 0} synchronized assets</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {can('assets:update') && selectedSiteAsset && (
                <button type="button" onClick={() => setAccessSiteId(selectedSiteAsset.id)} className="secondary-button">
                  <ShieldCheck className="h-4 w-4" />Configure access
                </button>
              )}
              <select value={assetType} onChange={(event) => setAssetType(event.target.value)} className="input-field min-w-44"><option value="">All types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
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
          {assetsQuery.isLoading ? <p className="mt-8 text-sm text-on-surface-variant">Loading assets…</p> : assetsQuery.isError ? <div className="mt-6 rounded-2xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg"><p>{assetsQuery.error.message}</p><button type="button" onClick={() => void assetsQuery.refetch()} className="secondary-button mt-3"><RefreshCw className="h-4 w-4" />Retry</button></div> : (assetsQuery.data?.items.length ?? 0) === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-border/50 p-10 text-center text-sm text-on-surface-variant">This site has no assets available for the current filter.</div> : <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{assetsQuery.data!.items.map((asset) => <AssetCard key={asset.id} asset={asset} selected={asset.id === selectedAssetId} onSelect={() => setSelectedAssetId(asset.id)} />)}</div>}

          {selectedAsset && (
            <section className="mt-6 rounded-2xl border border-border/40 bg-surface-container p-5">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><History className="h-5 w-5" /></div><div><h3 className="font-black text-on-surface">Operational history of {selectedAsset.displayName}</h3><p className="mt-1 text-xs text-on-surface-variant">INC, PRB, and RFC records related to this asset—either directly or through an incident or problem whose snapshot contains it.</p></div></div>
              {historyQuery.isLoading ? <p className="mt-5 text-sm text-on-surface-variant">Querying domains…</p> : historyQuery.data && (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-border/30 p-4" data-testid="domain-inc">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black text-primary"><Ticket className="h-4 w-4" />INC · {historyQuery.data.incidents.items.length}<DomainIncompleteWarning issues={historyQuery.data.incidents.issues} /></div>
                    <div className="mt-3 space-y-2">
                      {historyQuery.data.incidents.items.slice(0, 8).map((record) => <Link key={record.id} to={`/app/tickets/${record.id}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10">{record.humanId ?? record.id} · {record.title}</Link>)}
                      {historyQuery.data.incidents.items.length === 0 && historyQuery.data.incidents.completeness === 'complete' && <p className="text-xs text-on-surface-variant">No related incidents.</p>}
                      {historyQuery.data.incidents.items.length === 0 && historyQuery.data.incidents.completeness === 'partial' && <p className="text-xs text-status-warning-fg">Could not determine whether there are related incidents.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/30 p-4" data-testid="domain-prb">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black text-primary"><SearchCode className="h-4 w-4" />PRB · {historyQuery.data.problems.items.length}<DomainIncompleteWarning issues={historyQuery.data.problems.issues} /></div>
                    <div className="mt-3 space-y-2">
                      {historyQuery.data.problems.items.slice(0, 8).map((record) => <Link key={record.id} to={`/app/problems/${record.humanId}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10"><span className="block truncate">{record.humanId} · {String(record.data.title ?? 'Problem')}</span><ProvenanceBadge record={record} /></Link>)}
                      {historyQuery.data.problems.items.length === 0 && historyQuery.data.problems.completeness === 'complete' && <p className="text-xs text-on-surface-variant">No related problems.</p>}
                      {historyQuery.data.problems.items.length === 0 && historyQuery.data.problems.completeness === 'partial' && <p className="text-xs text-status-warning-fg">Could not determine whether there are related problems.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/30 p-4" data-testid="domain-rfc">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black text-primary"><GitPullRequest className="h-4 w-4" />RFC · {historyQuery.data.changes.items.length}<DomainIncompleteWarning issues={historyQuery.data.changes.issues} /></div>
                    <div className="mt-3 space-y-2">
                      {historyQuery.data.changes.items.slice(0, 8).map((record) => <Link key={record.id} to={`/app/changes/${record.humanId}`} className="block rounded-lg bg-on-surface/5 p-2 text-xs font-bold text-on-surface hover:bg-primary/10"><span className="block truncate">{record.humanId} · {String(record.data.title ?? 'Change')}</span><ProvenanceBadge record={record} /></Link>)}
                      {historyQuery.data.changes.items.length === 0 && historyQuery.data.changes.completeness === 'complete' && <p className="text-xs text-on-surface-variant">No related changes.</p>}
                      {historyQuery.data.changes.items.length === 0 && historyQuery.data.changes.completeness === 'partial' && <p className="text-xs text-status-warning-fg">Could not determine whether there are related changes.</p>}
                    </div>
                  </div>
                  {(() => {
                    const allIssues = [...new Set([...historyQuery.data.incidents.issues, ...historyQuery.data.problems.issues, ...historyQuery.data.changes.issues])];
                    return allIssues.length > 0 && (
                      <p data-testid="operational-history-partial-summary" className="text-xs text-status-warning-fg lg:col-span-3">Partial history: {allIssues.map(formatOperationalIssue).join(' ')}</p>
                    );
                  })()}
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
    <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-label="Site organizational access">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-black text-on-surface"><ShieldCheck className="h-4 w-4 text-primary" />Access by organizational unit or team</h3>
          <p className="mt-1 text-xs text-on-surface-variant">Devices at this site inherit these organizational units. You can select multiple organizational units.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close access configuration" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"><X className="h-4 w-4" /></button>
      </div>

      {companiesQuery.isLoading ? (
        <p className="mt-4 text-sm text-on-surface-variant">Loading Organization structure…</p>
      ) : companiesQuery.isError ? (
        <p className="mt-4 text-sm text-status-danger-fg">{companiesQuery.error.message}</p>
      ) : assignableUnits.length === 0 ? (
        <p className="mt-4 text-sm text-amber-200">First create a department or team in Users & Roles → Organization.</p>
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

      {saveMutation.isError && <p className="mt-3 text-xs text-status-danger-fg">{saveMutation.error.message}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
        <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || companiesQuery.isLoading} className="primary-button">
          {saveMutation.isPending ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </section>
  );
}

/**
 * Bulk organizational unit assignment for multiple sites.
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
      aria-label="Bulk organizational access assignment"
      data-testid="assets-bulk-editor"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-black text-on-surface">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Assign organizational unit to {assetIds.length} sites
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Devices at each site inherit these organizational units, so you don't need to configure them one by one.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close bulk assignment" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ['add', 'Add'],
          ['remove', 'Remove'],
          ['replace', 'Replace'],
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
          Replace keeps exactly the selected organizational units and discards any units each site had before.
        </p>
      )}

      {companiesQuery.isLoading ? (
        <p className="mt-4 text-sm text-on-surface-variant">Loading Organization structure…</p>
      ) : companiesQuery.isError ? (
        <p className="mt-4 text-sm text-status-danger-fg">{companiesQuery.error.message}</p>
      ) : assignableUnits.length === 0 ? (
        <p className="mt-4 text-sm text-amber-200">First create a department or team in Users &amp; Roles → Organization.</p>
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

      {saveMutation.isError && <p className="mt-3 text-xs text-status-danger-fg">{saveMutation.error.message}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
        <button
          type="button"
          data-testid="assets-bulk-apply"
          disabled={saveMutation.isPending || (mode !== 'replace' && selectedUnitIds.length === 0)}
          onClick={() => saveMutation.mutate()}
          className="primary-button"
        >
          {saveMutation.isPending ? 'Applying…' : `Apply to ${assetIds.length} sites`}
        </button>
      </div>
    </section>
  );
}
