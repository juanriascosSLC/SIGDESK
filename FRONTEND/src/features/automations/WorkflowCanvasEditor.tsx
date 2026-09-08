import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  ArrowLeft,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  GitBranch,
  Grid3X3,
  Info,
  Library,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Zap,
  Undo2,
  Redo2,
  Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getWorkflowAssignmentDirectory, type PublishWorkflowInput, type SaveDraftInput, type WorkflowDefinition } from './api';
import AssignmentActionEditor from './AssignmentActionEditor';
import StatusActionEditor from './StatusActionEditor';
import {
  ActionNode,
  ApprovalNode,
  ConditionNode,
  DelayNode,
  ForEachNode,
  ParserNode,
  TriggerNode,
  type WorkflowNode,
} from './CustomNodes';
import {
  catalogItem,
  compileVisualWorkflow,
  graphFromDefinition,
  esAccionDeAsignacion,
  nodeFromCatalog,
  priorityLabels,
  workflowCatalog,
  type CatalogGroup,
  type WorkflowCatalogItem,
} from './visual-model';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
  approval: ApprovalNode,
  foreach: ForEachNode,
  parser: ParserNode,
};

const groups: CatalogGroup[] = ['Triggers', 'Conditions', 'Control', 'Actions'];

const groupIcons = {
  Triggers: Zap,
  Conditions: GitBranch,
  Control: Clock3,
  Actions: Sparkles,
};

function initialGraph(definition?: WorkflowDefinition) {
  if (definition) return graphFromDefinition(definition);
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 80, y: 190 });
  const condition = nodeFromCatalog(catalogItem('condition.priority')!, { x: 420, y: 190 });
  const delay = nodeFromCatalog(catalogItem('control.delay')!, { x: 760, y: 190 });
  const action = nodeFromCatalog(catalogItem('action.notify_stakeholders')!, { x: 1100, y: 190 });
  return {
    nodes: [trigger, condition, delay, action],
    edges: [
      { id: crypto.randomUUID(), source: trigger.id, target: condition.id, animated: true },
      { id: crypto.randomUUID(), source: condition.id, target: delay.id, sourceHandle: 'yes', animated: true },
      { id: crypto.randomUUID(), source: delay.id, target: action.id, animated: true },
    ] satisfies Edge[],
  };
}

function edgeStyle(edge: Edge): Edge {
  return {
    ...edge,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#22d3ee' },
    style: { stroke: '#22d3ee', strokeWidth: 2 },
  };
}

function autoLayout(nodes: WorkflowNode[], edges: Edge[]): WorkflowNode[] {
  const ranks = new Map(nodes.map((node) => [node.id, node.type === 'trigger' ? 0 : 1]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    edges.forEach((edge) => {
      const nextRank = Math.min(nodes.length, (ranks.get(edge.source) ?? 0) + 1);
      ranks.set(edge.target, Math.max(ranks.get(edge.target) ?? 0, nextRank));
    });
  }
  const perRank = new Map<number, number>();
  return nodes.map((node) => {
    const rank = ranks.get(node.id) ?? 0;
    const row = perRank.get(rank) ?? 0;
    perRank.set(rank, row + 1);
    return { ...node, position: { x: 80 + rank * 350, y: 80 + row * 230 } };
  });
}

interface WorkflowCanvasEditorProps {
  definition?: WorkflowDefinition;
  readOnly?: boolean;
  publishing?: boolean;
  publishError?: string;
  onPublish?: (payload: PublishWorkflowInput) => void;
  /** Guardar SIN publicar. Su ausencia oculta el botón. */
  saving?: boolean;
  saveError?: string;
  onSaveDraft?: (payload: SaveDraftInput) => void;
  /** Publicar un borrador YA guardado, por su id. */
  onPublishDraft?: () => void;
  /** Abrir un borrador nuevo desde esta versión publicada. Su ausencia oculta
   *  el botón, que es lo correcto para quien solo puede leer. */
  onCrearBorrador?: () => void;
  creandoBorrador?: boolean;
}

function CanvasEditor({
  definition, readOnly = false, publishing = false, publishError, onPublish,
  saving = false, saveError, onSaveDraft, onPublishDraft,
  onCrearBorrador, creandoBorrador = false,
}: WorkflowCanvasEditorProps) {
  const navigate = useNavigate();
  const start = useMemo(() => initialGraph(definition), [definition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(start.edges.map(edgeStyle));
  const [version, setVersion] = useState(definition?.version ?? 1);
  const [query, setQuery] = useState('');
  const [selectedID, setSelectedID] = useState<string>();
  const [openGroups, setOpenGroups] = useState<Set<CatalogGroup>>(new Set(groups));
  const [showValidation, setShowValidation] = useState(false);
  const [showJSON, setShowJSON] = useState(false);
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();

  // Deshacer/rehacer sobre instantáneas del grafo.
  //
  // Se guarda el grafo entero y no un diff porque las operaciones que la gente
  // deshace aquí —soltar un bloque, borrarlo, reconectar— cambian nodos y
  // aristas a la vez, y reconstruir un diff correcto para cada una es más
  // frágil que copiar dos arreglos pequeños.
  const [pasado, setPasado] = useState<Array<{ nodes: WorkflowNode[]; edges: Edge[] }>>([]);
  const [futuro, setFuturo] = useState<Array<{ nodes: WorkflowNode[]; edges: Edge[] }>>([]);
  const [sinGuardar, setSinGuardar] = useState(false);

  const recordar = useCallback(() => {
    setPasado((current) => [...current.slice(-49), { nodes, edges }]);
    // Sin efectos dentro del updater: solo devuelve el arreglo nuevo.
    // Una acción nueva invalida lo rehacible: rehacer después de un cambio
    // distinto aplicaría un estado que ya no pertenece a esta historia.
    setFuturo([]);
    setSinGuardar(true);
  }, [edges, nodes]);

  // Los setters se llaman en secuencia, NUNCA dentro del updater de otro.
  //
  // La primera versión metía setNodes/setFuturo dentro de setPasado(current =>
  // …). React invoca los updaters dos veces en modo estricto para detectar
  // impurezas, así que cada deshacer aplicaba su efecto por duplicado y el
  // canvas acababa con más nodos de los que había antes de la acción.
  const deshacer = useCallback(() => {
    if (pasado.length === 0) return;
    const anterior = pasado[pasado.length - 1];
    setPasado(pasado.slice(0, -1));
    setFuturo([...futuro, { nodes, edges }]);
    setNodes(anterior.nodes);
    setEdges(anterior.edges);
    setSinGuardar(true);
  }, [edges, futuro, nodes, pasado, setEdges, setNodes]);

  const rehacer = useCallback(() => {
    if (futuro.length === 0) return;
    const siguiente = futuro[futuro.length - 1];
    setFuturo(futuro.slice(0, -1));
    setPasado([...pasado, { nodes, edges }]);
    setNodes(siguiente.nodes);
    setEdges(siguiente.edges);
    setSinGuardar(true);
  }, [edges, futuro, nodes, pasado, setEdges, setNodes]);

  // El directorio se consulta también aquí, no solo en el panel: es lo que
  // permite detectar que un destino guardado ya no existe ANTES de publicar.
  // React Query comparte la misma clave con el panel, así que no hay dos
  // llamadas.
  const directorio = useQuery({
    queryKey: ['organization', 'assignment-directory', 'tickets'],
    queryFn: getWorkflowAssignmentDirectory,
    enabled: !readOnly,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Un destino que Organization ya no reconoce NO se borra en silencio: se
  // marca. Borrarlo cambiaría el destino de un diagrama guardado sin que nadie
  // lo decidiera, y la persona publicaría algo distinto de lo que ve.
  //
  // Solo se evalúa con el directorio ya cargado: mientras carga, todo id
  // parecería ausente y el canvas se llenaría de errores falsos.
  const nodosConReferencias = useMemo(() => {
    if (!directorio.data) return nodes;
    const areas = new Set(directorio.data.departments.map((item) => item.id));
    const equipos = new Set(directorio.data.teams.map((item) => item.id));
    const personas = new Set(directorio.data.assignees.map((item) => item.id));
    return nodes.map((node) => {
      if (!esAccionDeAsignacion(node.data.catalogKey)) return node;
      const ausentes: string[] = [];
      if (node.data.departmentId && !areas.has(String(node.data.departmentId))) ausentes.push('an area');
      if (node.data.teamId && !equipos.has(String(node.data.teamId))) ausentes.push('a team');
      if (node.data.assignmentMode === 'user' && node.data.assigneeUserId && !personas.has(String(node.data.assigneeUserId))) ausentes.push('a person');
      const previas = (node.data.missingReferences ?? []) as string[];
      if (previas.length === ausentes.length && previas.every((valor, indice) => valor === ausentes[indice])) return node;
      return { ...node, data: { ...node.data, missingReferences: ausentes } };
    });
  }, [directorio.data, nodes]);

  const compilation = useMemo(
    () => compileVisualWorkflow(nodosConReferencias, edges, version),
    [edges, nodosConReferencias, version],
  );
  const selectedNode = nodosConReferencias.find((node) => node.id === selectedID);

  // Los mensajes se cuelgan del nodo para que se vea CUÁL está mal, sin
  // guardarlos en el estado: son derivados, y persistirlos obligaría a
  // sincronizarlos en cada cambio.
  const nodosPintados = useMemo(() => {
    const porNodo = new Map<string, string[]>();
    for (const issue of compilation.issues) {
      if (!issue.nodeId) continue;
      porNodo.set(issue.nodeId, [...(porNodo.get(issue.nodeId) ?? []), issue.message]);
    }
    if (porNodo.size === 0) return nodosConReferencias;
    return nodosConReferencias.map((node) => porNodo.has(node.id)
      ? { ...node, data: { ...node.data, issueMessages: porNodo.get(node.id) } }
      : node);
  }, [compilation.issues, nodosConReferencias]);

  // Al pulsar un error, el canvas lo enfoca y lo selecciona. Sin esto la
  // persona lee "completa área y equipo" y tiene que buscar a mano el bloque en
  // un diagrama grande.
  // borradorActual serializa el canvas TAL CUAL, sin exigir que compile: un
  // borrador incompleto también se guarda, y sus reglas conservan su id para no
  // desligar el historial de la regla que lo produjo.
  const borradorActual = (): SaveDraftInput => ({
    id: definition?.id,
    // La revisión que se leyó. Sin ella el backend no puede detectar que otro
    // administrador guardó primero, y su trabajo se perdería en silencio.
    revision: definition?.revision,
    categoria_id: definition?.categoria_id ?? 'INC',
    version,
    // El id de cada regla es el id de su NODO, tal como lo emite el compilador.
    //
    // Antes se tomaba de `definition.reglas[indice]`, por POSICIÓN: bastaba con
    // añadir un bloque en medio para que las reglas heredaran el id de otra y
    // el historial quedara atribuido a la regla equivocada. Con el plan sería
    // peor: el plan referencia el nodo, así que los ids tienen que coincidir o
    // el backend rechaza la publicación.
    reglas: compilation.payload?.reglas ?? [],
    layout: {
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data: { ...data } })),
      edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
    },
    // El plan viaja también en el borrador: es lo que permite cerrar el
    // navegador a mitad del diseño y recuperar el mismo grafo, y lo que hace
    // que publicar después no tenga que recompilar nada distinto.
    execution_plan: compilation.payload?.execution_plan,
  });

  const enfocarNodo = useCallback((nodeID?: string) => {
    if (!nodeID) return;
    const objetivo = nodes.find((node) => node.id === nodeID);
    if (!objetivo) return;
    setSelectedID(nodeID);
    setShowValidation(false);
    void setCenter(objetivo.position.x + 140, objetivo.position.y + 70, { zoom: 1.1, duration: 420 });
  }, [nodes, setCenter]);

  const onConnect = useCallback((connection: Connection) => {
    if (readOnly) return;
    recordar();
    setEdges((current) => addEdge(edgeStyle({ ...connection, id: crypto.randomUUID() } as Edge), current));
  }, [readOnly, recordar, setEdges]);

  const onNodeClick: NodeMouseHandler<WorkflowNode> = useCallback((_event, node) => {
    setSelectedID(node.id);
  }, []);

  const updateSelected = (data: Record<string, unknown>) => {
    if (!selectedID || readOnly) return;
    recordar();
    setNodes((current) => current.map((node) => node.id === selectedID ? { ...node, data: { ...node.data, ...data } } : node));
  };

  const removeSelected = () => {
    if (!selectedID || readOnly) return;
    recordar();
    setNodes((current) => current.filter((node) => node.id !== selectedID));
    setEdges((current) => current.filter((edge) => edge.source !== selectedID && edge.target !== selectedID));
    setSelectedID(undefined);
  };

  const duplicateSelected = () => {
    if (!selectedNode || readOnly) return;
    recordar();
    const duplicate: WorkflowNode = {
      ...selectedNode,
      id: crypto.randomUUID(),
      selected: false,
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      data: { ...selectedNode.data, label: `${String(selectedNode.data.label)} copia` },
    };
    setNodes((current) => [...current, duplicate]);
    setSelectedID(duplicate.id);
  };

  const dragStart = (event: DragEvent, item: WorkflowCatalogItem) => {
    event.dataTransfer.setData('application/sigdesk-workflow', item.key);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const key = event.dataTransfer.getData('application/sigdesk-workflow');
    const item = catalogItem(key);
    if (!item) return;
    recordar();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const created = nodeFromCatalog(item, position);
    setNodes((current) => [...current, created]);
    setSelectedID(created.id);
  };

  const filteredCatalog = workflowCatalog.filter((item) => {
    const normalized = `${item.title} ${item.description}`.toLocaleLowerCase();
    return normalized.includes(query.trim().toLocaleLowerCase());
  });
  const operationalCount = workflowCatalog.filter((item) => item.support === 'operational').length;

  return (
    <div className="flex h-full min-h-[700px] flex-col bg-background" data-testid="workflow-visual-editor">
      <header className="z-20 flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-surface-container-low px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate('/app/automations')} className="secondary-button px-3" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 shrink-0 text-primary" />
              <h1 className="truncate text-lg font-black text-on-surface">
                {definition ? `Workflow ${definition.categoria_id}` : 'Automation Designer'}
              </h1>
              {definition && (
                <span
                  data-testid="canvas-estado"
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${definition.estado === 'publicado'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : definition.estado === 'borrador'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-slate-500/30 bg-slate-500/10 text-slate-300'}`}
                >
                  {(definition.estado === 'publicado' ? 'Published' : definition.estado === 'borrador' ? 'Draft' : 'Disabled')} · v{definition.version}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">Drag, connect, and configure blocks. The published graph executes in the live runtime.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <label className="flex items-center gap-2 rounded-xl border border-border/50 bg-on-surface/5 px-3 py-2 text-xs font-bold text-on-surface-variant">
              Version
              <input className="w-14 bg-transparent text-center font-mono text-on-surface outline-none" type="number" min={1} value={version} onChange={(event) => setVersion(Math.max(1, Number(event.target.value)))} />
            </label>
          )}
          {!readOnly && (
            <>
              <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-on-surface/5 p-1">
                <button type="button" data-testid="canvas-undo" aria-label="Undo" title="Undo" disabled={pasado.length === 0} onClick={deshacer} className="rounded-lg px-2 py-1.5 text-on-surface-variant transition hover:bg-on-surface/10 disabled:opacity-35"><Undo2 className="h-4 w-4" /></button>
                <button type="button" data-testid="canvas-redo" aria-label="Redo" title="Redo" disabled={futuro.length === 0} onClick={rehacer} className="rounded-lg px-2 py-1.5 text-on-surface-variant transition hover:bg-on-surface/10 disabled:opacity-35"><Redo2 className="h-4 w-4" /></button>
              </div>
              <span
                data-testid="canvas-dirty"
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${sinGuardar
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}
              >
                {sinGuardar ? 'Unsaved changes' : 'Saved'}
              </span>
            </>
          )}
          <button type="button" data-testid="canvas-validate" onClick={() => setShowValidation(true)} className="secondary-button">
            {compilation.errors.length ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
            Validate {compilation.errors.length ? `(${compilation.errors.length})` : ''}
          </button>
          <button type="button" onClick={() => setShowJSON(true)} className="secondary-button"><Braces className="h-4 w-4" /> Contract</button>
          {!readOnly && onSaveDraft && (
            // Guardar NO exige que el diseño esté completo: para eso existe un
            // borrador. Lo que exige completitud es publicar.
            <button
              type="button"
              data-testid="canvas-save-draft"
              disabled={saving}
              onClick={() => { onSaveDraft(borradorActual()); setSinGuardar(false); }}
              className="secondary-button"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save draft'}
            </button>
          )}
          {readOnly && onCrearBorrador && (
            // Una versión publicada es inmutable: el backend rechaza
            // modificarla porque es la que el runtime ejecuta. La única forma
            // de cambiarla es abrir un borrador nuevo de su misma familia.
            <button
              type="button"
              data-testid="canvas-new-draft"
              disabled={creandoBorrador}
              onClick={onCrearBorrador}
              className="primary-button"
            >
              <GitBranch className="h-4 w-4" /> {creandoBorrador ? 'Creating…' : 'Create new draft from this version'}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              data-testid="canvas-publish"
              disabled={!compilation.payload || publishing}
              onClick={() => {
                if (!compilation.payload) return;
                // Si estamos editando un borrador ya guardado, se publica ESE,
                // conservando su id y su versión; el historial de ejecuciones
                // los referencia. Si no, se usa el camino directo de siempre.
                if (onPublishDraft) onPublishDraft(); else onPublish?.(compilation.payload);
                setSinGuardar(false);
              }}
              className="primary-button"
            >
              <Rocket className="h-4 w-4" /> {publishing ? 'Publishing…' : 'Publish version'}
            </button>
          )}
        </div>
      </header>

      {/* Los errores del BACKEND se muestran tal cual: la validación del canvas
          no lo sustituye. Un 422 dice cosas que el frontend no puede saber, como
          que el equipo dejó de pertenecer al área. */}
      {publishError && <div data-testid="canvas-publish-error" className="border-b border-red-500/30 bg-red-500/10 px-5 py-2 text-sm text-red-300">{publishError}</div>}
      {saveError && <div data-testid="canvas-save-error" className="border-b border-red-500/30 bg-red-500/10 px-5 py-2 text-sm text-red-300">{saveError}</div>}

      <div className="flex min-h-0 flex-1">
        <aside className="z-10 flex w-[290px] shrink-0 flex-col border-r border-border/50 bg-surface-container-low">
          <div className="border-b border-border/40 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-on-surface"><Library className="h-4 w-4 text-primary" /> Library</div>
            <label className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-on-surface/5 px-3 py-2">
              <Search className="h-4 w-4 text-on-surface-variant" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search block…" className="min-w-0 flex-1 bg-transparent text-xs text-on-surface outline-none" />
            </label>
            <div className="mt-3 flex gap-2 text-[9px] font-black uppercase">
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">{operationalCount} operational</span>
              <span className="rounded-full bg-slate-500/10 px-2 py-1 text-slate-300">{workflowCatalog.length - operationalCount} planned</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {groups.map((group) => {
              const items = filteredCatalog.filter((item) => item.group === group);
              if (items.length === 0) return null;
              const Icon = groupIcons[group];
              const open = openGroups.has(group);
              return (
                <section key={group} className="mb-3">
                  <button type="button" onClick={() => setOpenGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group); else next.add(group);
                    return next;
                  })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] font-black uppercase tracking-wider text-on-surface-variant hover:bg-on-surface/5">
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <Icon className="h-3.5 w-3.5 text-primary" /> {group}
                    <span className="ml-auto rounded-full bg-on-surface/5 px-2 py-0.5">{items.length}</span>
                  </button>
                  {open && <div className="mt-1 space-y-2">
                    {items.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        draggable={!readOnly}
                        onDragStart={(event) => dragStart(event, item)}
                        onClick={() => {
                          if (readOnly) return;
                          recordar();
                          const created = nodeFromCatalog(item, { x: 180 + nodes.length * 30, y: 120 + nodes.length * 18 });
                          setNodes((current) => [...current, created]);
                          setSelectedID(created.id);
                        }}
                        className={`group w-full cursor-grab rounded-xl border p-3 text-left transition-all active:cursor-grabbing ${item.support === 'operational' ? 'border-border/50 bg-on-surface/5 hover:border-primary/50 hover:bg-primary/5' : 'border-dashed border-border/40 bg-on-surface/[0.025] hover:border-slate-400/50'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-black text-on-surface">{item.title}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase ${item.support === 'operational' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-300'}`}>{item.support === 'operational' ? 'Ready' : 'Planned'}</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-on-surface-variant">{item.description}</p>
                      </button>
                    ))}
                  </div>}
                </section>
              );
            })}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 bg-surface-container-lowest">
          <ReactFlow
            nodes={nodosPintados}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={readOnly ? undefined : onNodesChange}
            onEdgesChange={readOnly ? undefined : onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedID(undefined)}
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            minZoom={0.25}
            maxZoom={1.6}
            defaultEdgeOptions={{ animated: true, markerEnd: { type: MarkerType.ArrowClosed } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--outline-variant)" gap={24} size={1.2} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.data.supportStatus === 'planned' ? '#64748b' : '#06b6d4'} maskColor="rgba(2, 6, 23, 0.72)" />
            <div className="absolute left-4 top-4 z-10 flex gap-2">
              <button type="button" onClick={() => { recordar(); setNodes((current) => autoLayout(current, edges)); window.setTimeout(() => void fitView({ duration: 350, padding: 0.18 }), 20); }} className="secondary-button bg-surface-container-low/95 px-3"><Grid3X3 className="h-4 w-4" /> Arrange</button>
              <div className={`flex items-center gap-2 rounded-xl border bg-surface-container-low/95 px-3 py-2 text-xs font-bold ${compilation.errors.length ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}>
                {compilation.errors.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {compilation.errors.length ? 'Incomplete design' : 'Ready to publish'}
              </div>
            </div>
          </ReactFlow>
        </main>

        {selectedNode && (
          <aside className="z-10 w-[320px] shrink-0 overflow-y-auto border-l border-border/50 bg-surface-container-low p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Properties</p><h2 className="mt-1 font-black text-on-surface">{String(selectedNode.data.label)}</h2></div>
              <button type="button" onClick={() => setSelectedID(undefined)} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"><X className="h-4 w-4" /></button>
            </div>
            <div className={`mt-4 rounded-xl border p-3 text-xs ${selectedNode.data.supportStatus === 'planned' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              <p className="font-black">{selectedNode.data.supportStatus === 'planned' ? 'Planned capability' : 'Operational capability'}</p>
              <p className="mt-1 opacity-75">{selectedNode.data.supportStatus === 'planned'
                ? ((selectedNode.data.catalogKey === 'action.assign_user' || selectedNode.data.catalogKey === 'action.assign_team')
                    ? 'Target can be configured with Organization. The branch will be enabled for publishing once live execution in Tickets is finished.'
                    : 'You can design with this, but a branch using it cannot be published until its backend contract is implemented.')
                : 'This block compiles to a rule that the engine executes live.'}</p>
            </div>
            <label className="mt-5 block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Block name
              <input disabled={readOnly} value={String(selectedNode.data.label ?? '')} onChange={(event) => updateSelected({ label: event.target.value })} className="input-field mt-2 w-full normal-case" />
            </label>

            {selectedNode.data.catalogKey === 'condition.priority' && (
              <div className="mt-5 space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Evaluation
                  <select disabled={readOnly} value={String(selectedNode.data.conditionMode ?? 'priority')} onChange={(event) => updateSelected({ conditionMode: event.target.value })} className="input-field mt-2 w-full normal-case">
                    <option value="priority">Compare priority</option><option value="always">Always execute</option>
                  </select>
                </label>
                {selectedNode.data.conditionMode !== 'always' && <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Priority
                  <select disabled={readOnly} value={String(selectedNode.data.priority ?? 'critica')} onChange={(event) => updateSelected({ priority: event.target.value })} className="input-field mt-2 w-full normal-case">
                    {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>}
              </div>
            )}

            {selectedNode.data.catalogKey === 'control.delay' && (
              <div className="mt-5 grid grid-cols-[1fr_130px] gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Duration
                  <input disabled={readOnly} type="number" min={0} value={String(selectedNode.data.delayValue ?? '0')} onChange={(event) => updateSelected({ delayValue: event.target.value })} className="input-field mt-2 w-full normal-case" />
                </label>
                <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Unit
                  <select disabled={readOnly} value={String(selectedNode.data.delayUnit ?? 'minutes')} onChange={(event) => updateSelected({ delayUnit: event.target.value })} className="input-field mt-2 w-full normal-case">
                    <option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
                  </select>
                </label>
              </div>
            )}

            {selectedNode.data.catalogKey === 'action.notify_stakeholders' && (
              <div className="mt-5 rounded-xl border border-border/40 bg-on-surface/5 p-4 text-xs text-on-surface-variant">
                <p className="font-black text-on-surface">Recipients managed by Notifications</p>
                <p className="mt-2 leading-relaxed">Requester, assignee, and interested people or areas. Each user maintains their channel preferences.</p>
              </div>
            )}

            {esAccionDeAsignacion(selectedNode.data.catalogKey) && (
              <AssignmentActionEditor
                data={selectedNode.data}
                readOnly={readOnly}
                onChange={updateSelected}
              />
            )}

            {selectedNode.data.catalogKey === 'action.change_status' && (
              <StatusActionEditor
                data={selectedNode.data}
                readOnly={readOnly}
                entityKey={definition?.categoria_id ?? 'INC'}
                onChange={updateSelected}
              />
            )}

            {!readOnly && <div className="mt-6 grid grid-cols-2 gap-2 border-t border-border/40 pt-5">
              <button type="button" onClick={duplicateSelected} className="secondary-button"><Copy className="h-4 w-4" /> Duplicate</button>
              <button type="button" onClick={removeSelected} className="secondary-button text-red-300"><Trash2 className="h-4 w-4" /> Delete</button>
            </div>}
          </aside>
        )}
      </div>

      {(showValidation || showJSON) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) { setShowValidation(false); setShowJSON(false); } }}>
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/60 bg-surface-container-low p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-on-surface">{showJSON ? <Braces className="h-5 w-5 text-primary" /> : <CheckCircle2 className="h-5 w-5 text-primary" />} {showJSON ? 'Executable contract and layout' : 'Pre-validation'}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">{showJSON ? 'Runtime executes rules; the editor preserves exact layout.' : 'Only fully operational branches can be published.'}</p>
              </div>
              <button type="button" onClick={() => { setShowValidation(false); setShowJSON(false); }} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"><X className="h-4 w-4" /></button>
            </div>
            {showJSON ? (
              <pre className="mt-5 max-h-[60vh] overflow-auto rounded-2xl bg-[#070b12] p-5 text-xs text-emerald-300">{JSON.stringify(compilation.payload ?? { errors: compilation.errors }, null, 2)}</pre>
            ) : (
              <div className="mt-5 space-y-3">
                {compilation.errors.length === 0 && <div className="flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" /><div><p className="font-black">Valid workflow</p><p className="mt-1 opacity-75">Definition can be published and executed.</p></div></div>}
                {/* Cada error que sabe a qué nodo pertenece es pulsable: enfoca y
                    selecciona ese bloque. Leer "completa área y equipo" sin poder
                    ir al bloque obliga a buscarlo a mano en un diagrama grande. */}
                {compilation.issues.map((issue, indice) => {
                  const anclado = Boolean(issue.nodeId);
                  return (
                    <button
                      key={`${issue.nodeId ?? 'general'}-${indice}`}
                      type="button"
                      data-testid={anclado ? 'validation-issue-anchored' : 'validation-issue'}
                      disabled={!anclado}
                      onClick={() => enfocarNodo(issue.nodeId)}
                      className={`flex w-full gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-200 ${anclado ? 'transition hover:border-red-400/60 hover:bg-red-500/15' : 'cursor-default'}`}
                    >
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        {issue.message}
                        {anclado && <span className="mt-1 block text-[10px] font-black uppercase tracking-wider opacity-70">Click to go to block</span>}
                      </span>
                    </button>
                  );
                })}
                {compilation.warnings.map((warning) => <div key={warning} className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"><Info className="h-5 w-5 shrink-0" /><span>{warning}</span></div>)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function WorkflowCanvasEditor(props: WorkflowCanvasEditorProps) {
  return <ReactFlowProvider><CanvasEditor {...props} /></ReactFlowProvider>;
}
