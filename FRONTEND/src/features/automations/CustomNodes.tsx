import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { BellRing, Braces, Clock3, GitBranch, ListRestart, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { priorityLabels } from './visual-model';

export type WorkflowNodeData = {
  catalogKey?: string;
  label?: string;
  description?: string;
  supportStatus?: 'operational' | 'planned';
  color?: string;
  actionType?: string;
  title?: string;
  conditionMode?: string;
  priority?: string;
  delayValue?: string;
  delayUnit?: string;
  approver?: string;
  listVariable?: string;
  mapping?: string;
  assignmentMode?: 'team' | 'user';
  departmentId?: string;
  departmentName?: string;
  teamId?: string;
  teamName?: string;
  assigneeUserId?: string;
  assigneeName?: string;
  overwriteExisting?: boolean;
  /** Transición publicada que pide el bloque «Cambiar estado».
   *
   * Solo `transitionKey` se publica. El origen, el destino y la etiqueta se
   * guardan para poder leer el diagrama sin abrir el panel; son nombres, y los
   * nombres cambian. */
  transitionKey?: string;
  transitionFrom?: string;
  transitionTo?: string;
  transitionLabel?: string;
  /** Referencias organizacionales que Organization ya no reconoce.
   *
   * Lo escribe el editor al cargar el directorio; el compilador lo convierte en
   * un error que bloquea la publicación. No se limpia el id ausente: hacerlo
   * cambiaría el destino de un diagrama guardado sin que nadie lo decidiera. */
  missingReferences?: string[];
  /** Mensajes de validación del bloque, para resaltarlo en el canvas. */
  issueMessages?: string[];
  [key: string]: unknown;
};

export type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowNodeProps = NodeProps<WorkflowNode>;

const palette = {
  cyan: { border: 'hover:border-cyan-400/70', icon: 'text-cyan-700 dark:text-cyan-300 bg-cyan-500/10', handle: '!bg-cyan-600 dark:!bg-cyan-400' },
  amber: { border: 'hover:border-amber-400/70', icon: 'text-amber-800 dark:text-amber-300 bg-amber-500/10', handle: '!bg-amber-600 dark:!bg-amber-400' },
  blue: { border: 'hover:border-blue-400/70', icon: 'text-blue-700 dark:text-blue-300 bg-blue-500/10', handle: '!bg-blue-600 dark:!bg-blue-400' },
  emerald: { border: 'hover:border-emerald-400/70', icon: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', handle: '!bg-emerald-600 dark:!bg-emerald-400' },
  purple: { border: 'hover:border-purple-400/70', icon: 'text-purple-700 dark:text-purple-300 bg-purple-500/10', handle: '!bg-purple-600 dark:!bg-purple-400' },
  pink: { border: 'hover:border-pink-400/70', icon: 'text-pink-700 dark:text-pink-300 bg-pink-500/10', handle: '!bg-pink-600 dark:!bg-pink-400' },
};

function frameColor(data: WorkflowNodeData) {
  return palette[(data.color as keyof typeof palette) ?? 'cyan'] ?? palette.cyan;
}

function NodeFrame({ data, icon, kind, children }: { data: WorkflowNodeData; icon: ReactNode; kind: string; children?: ReactNode }) {
  const color = frameColor(data);
  const planned = data.supportStatus === 'planned';
  // Un bloque con problemas se ve DESDE el canvas. Antes los errores vivían solo
  // en el panel de validación, así que en un diagrama grande había que abrirlo y
  // buscar a mano cuál de los bloques era el que fallaba.
  const problemas = (data.issueMessages ?? []) as string[];
  const conProblema = problemas.length > 0;
  return (
    <div
      data-testid={conProblema ? 'workflow-node-invalid' : 'workflow-node'}
      className={`relative w-[270px] rounded-2xl border bg-surface-container-low p-4 shadow-2xl transition-all ${conProblema
        ? 'border-red-500/70 ring-2 ring-red-500/30'
        : planned ? 'border-dashed border-slate-500/60 opacity-85' : `border-border/60 ${color.border}`}`}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color.icon}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-on-surface-variant">{kind}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${planned ? 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
              {planned ? 'Planned' : 'Operational'}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-black text-on-surface">{String(data.label || data.title || 'Untitled')}</p>
        </div>
      </div>
      {children || <p className="rounded-xl border border-border/30 bg-on-surface/5 p-2.5 text-[11px] leading-relaxed text-on-surface-variant">{String(data.description || '')}</p>}
      {conProblema && (
        <ul className="mt-2 space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[10px] leading-relaxed text-red-700 dark:text-red-200">
          {problemas.map((problema) => <li key={problema}>{problema}</li>)}
        </ul>
      )}
    </div>
  );
}

function handleClass(data: WorkflowNodeData) {
  return `!h-3 !w-3 !border-2 !border-surface-container-low ${frameColor(data).handle}`;
}

export function TriggerNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><NodeFrame data={data} kind="Trigger" icon={<Zap className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ConditionNode({ data }: WorkflowNodeProps) {
  const priorityValue = String(data.priority || 'critica');
  const summary = data.catalogKey === 'condition.priority'
    ? (data.conditionMode === 'always' ? 'Always' : `Priority = ${priorityLabels[priorityValue] ?? priorityValue}`)
    : String(data.description || 'Configure condition');
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Condition" icon={<GitBranch className="h-4 w-4" />}>
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 font-mono text-[11px] text-amber-800 dark:text-amber-200">{summary}</p>
      </NodeFrame>
      {/* Dos salidas: la condición del plan tiene rama verdadera y rama falsa.
          Antes solo existía «Sí», así que un flujo no podía declarar qué hacer
          cuando la condición no se cumple —y el runtime no tenía de dónde
          sacarlo—. Una conexión guardada sin handle sigue siendo la rama
          verdadera, para que los diagramas anteriores signifiquen lo mismo. */}
      <Handle type="source" position={Position.Right} id="yes" style={{ top: '38%' }} className="!h-3 !w-3 !border-2 !border-surface-container-low !bg-emerald-400" />
      <span className="absolute -right-9 top-[38%] -translate-y-1/2 text-[8px] font-black uppercase text-emerald-700 dark:text-emerald-300">Yes</span>
      <Handle type="source" position={Position.Right} id="no" style={{ top: '68%' }} className="!h-3 !w-3 !border-2 !border-surface-container-low !bg-red-400" />
      <span className="absolute -right-9 top-[68%] -translate-y-1/2 text-[8px] font-black uppercase text-red-700 dark:text-red-300">No</span>
    </div>
  );
}

export function DelayNode({ data }: WorkflowNodeProps) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Control" icon={<Clock3 className="h-4 w-4" />}>
        <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 font-mono text-[11px] text-blue-700 dark:text-blue-200">Wait {String(data.delayValue || '0')} {String(data.delayUnit || 'minutes')}</p>
      </NodeFrame>
      <Handle type="source" position={Position.Right} className={handleClass(data)} />
    </div>
  );
}

export function ActionNode({ data }: WorkflowNodeProps) {
  // El destino se resume en el propio nodo para poder leer el diagrama sin
  // abrir el panel. Depende del MODO, no de la clave del bloque: al unificarse
  // en uno solo, mirar la clave dejaba el resumen en blanco.
  const esAsignacion = data.catalogKey === 'action.assign'
    || data.catalogKey === 'action.assign_user'
    || data.catalogKey === 'action.assign_team';
  const equipo = String(data.teamName || data.teamId || 'unselected');
  const assignmentSummary = !esAsignacion
    ? undefined
    : data.assignmentMode === 'user'
      ? `Person ${String(data.assigneeName || data.assigneeUserId || 'unselected')} · Team ${equipo}`
      : `Team ${equipo}`;
  // El bloque de estado resume la TRANSICIÓN, no el estado: es lo que se
  // publica, y dos transiciones pueden llevar al mismo estado.
  const statusSummary = data.catalogKey !== 'action.change_status'
    ? undefined
    : data.transitionKey
      ? `${String(data.transitionFrom ?? '?')} → ${String(data.transitionTo ?? '?')} · ${String(data.transitionKey)}`
      : 'Transition unselected';
  const resumen = assignmentSummary ?? statusSummary;
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Action" icon={data.catalogKey === 'action.notify_stakeholders' ? <BellRing className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}>
        {resumen
          ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200">{resumen}</p>
          : <p className="rounded-xl border border-border/30 bg-on-surface/5 p-2.5 text-[11px] leading-relaxed text-on-surface-variant">{String(data.description || '')}</p>}
      </NodeFrame>
      <Handle type="source" position={Position.Right} className={handleClass(data)} />
    </div>
  );
}

export function ApprovalNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Approval" icon={<ShieldCheck className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ParserNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Transformation" icon={<Braces className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ForEachNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Iteration" icon={<ListRestart className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}
