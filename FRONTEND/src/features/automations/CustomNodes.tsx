import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { BellRing, Braces, Clock3, GitBranch, ListRestart, ShieldCheck, Sparkles, Zap } from 'lucide-react';

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
  [key: string]: unknown;
};

export type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowNodeProps = NodeProps<WorkflowNode>;

const palette = {
  cyan: { border: 'hover:border-cyan-400/70', icon: 'text-cyan-300 bg-cyan-500/10', handle: '!bg-cyan-400' },
  amber: { border: 'hover:border-amber-400/70', icon: 'text-amber-300 bg-amber-500/10', handle: '!bg-amber-400' },
  blue: { border: 'hover:border-blue-400/70', icon: 'text-blue-300 bg-blue-500/10', handle: '!bg-blue-400' },
  emerald: { border: 'hover:border-emerald-400/70', icon: 'text-emerald-300 bg-emerald-500/10', handle: '!bg-emerald-400' },
  purple: { border: 'hover:border-purple-400/70', icon: 'text-purple-300 bg-purple-500/10', handle: '!bg-purple-400' },
  pink: { border: 'hover:border-pink-400/70', icon: 'text-pink-300 bg-pink-500/10', handle: '!bg-pink-400' },
};

function frameColor(data: WorkflowNodeData) {
  return palette[(data.color as keyof typeof palette) ?? 'cyan'] ?? palette.cyan;
}

function NodeFrame({ data, icon, kind, children }: { data: WorkflowNodeData; icon: ReactNode; kind: string; children?: ReactNode }) {
  const color = frameColor(data);
  const planned = data.supportStatus === 'planned';
  return (
    <div className={`relative w-[270px] rounded-2xl border bg-surface-container-low p-4 shadow-2xl transition-all ${planned ? 'border-dashed border-slate-500/60 opacity-85' : `border-border/60 ${color.border}`}`}>
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color.icon}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-on-surface-variant">{kind}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${planned ? 'border-slate-500/40 bg-slate-500/10 text-slate-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
              {planned ? 'Próximo' : 'Operativo'}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-black text-on-surface">{String(data.label || data.title || 'Sin nombre')}</p>
        </div>
      </div>
      {children || <p className="rounded-xl border border-border/30 bg-on-surface/5 p-2.5 text-[11px] leading-relaxed text-on-surface-variant">{String(data.description || '')}</p>}
    </div>
  );
}

function handleClass(data: WorkflowNodeData) {
  return `!h-3 !w-3 !border-2 !border-surface-container-low ${frameColor(data).handle}`;
}

export function TriggerNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><NodeFrame data={data} kind="Disparador" icon={<Zap className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ConditionNode({ data }: WorkflowNodeProps) {
  const summary = data.catalogKey === 'condition.priority'
    ? (data.conditionMode === 'always' ? 'Siempre' : `Prioridad = ${String(data.priority || 'critica')}`)
    : String(data.description || 'Configura la condición');
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Condición" icon={<GitBranch className="h-4 w-4" />}>
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 font-mono text-[11px] text-amber-200">{summary}</p>
      </NodeFrame>
      <Handle type="source" position={Position.Right} id="yes" className="!h-3 !w-3 !border-2 !border-surface-container-low !bg-emerald-400" />
      <span className="absolute -right-9 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-emerald-300">Sí</span>
    </div>
  );
}

export function DelayNode({ data }: WorkflowNodeProps) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Control" icon={<Clock3 className="h-4 w-4" />}>
        <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 font-mono text-[11px] text-blue-200">Esperar {String(data.delayValue || '0')} {String(data.delayUnit || 'minutos')}</p>
      </NodeFrame>
      <Handle type="source" position={Position.Right} className={handleClass(data)} />
    </div>
  );
}

export function ActionNode({ data }: WorkflowNodeProps) {
  const assignmentSummary = data.catalogKey === 'action.assign_user'
    ? `Persona ${String(data.assigneeName || data.assigneeUserId || 'sin seleccionar')} · Equipo ${String(data.teamName || data.teamId || 'sin seleccionar')}`
    : data.catalogKey === 'action.assign_team'
      ? `Equipo ${String(data.teamName || data.teamId || 'sin seleccionar')}`
      : undefined;
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className={handleClass(data)} />
      <NodeFrame data={data} kind="Acción" icon={data.catalogKey === 'action.notify_stakeholders' ? <BellRing className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}>
        {assignmentSummary
          ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] leading-relaxed text-emerald-200">{assignmentSummary}</p>
          : <p className="rounded-xl border border-border/30 bg-on-surface/5 p-2.5 text-[11px] leading-relaxed text-on-surface-variant">{String(data.description || '')}</p>}
      </NodeFrame>
      <Handle type="source" position={Position.Right} className={handleClass(data)} />
    </div>
  );
}

export function ApprovalNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Aprobación" icon={<ShieldCheck className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ParserNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Transformación" icon={<Braces className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}

export function ForEachNode({ data }: WorkflowNodeProps) {
  return <div className="relative"><Handle type="target" position={Position.Left} className={handleClass(data)} /><NodeFrame data={data} kind="Iteración" icon={<ListRestart className="h-4 w-4" />} /><Handle type="source" position={Position.Right} className={handleClass(data)} /></div>;
}
