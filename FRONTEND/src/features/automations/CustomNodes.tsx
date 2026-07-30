import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { Zap, HelpCircle, ArrowRightCircle, Mail, MessageSquare, Globe, Users, Clock, UserCheck, Code, Repeat } from 'lucide-react';

export type WorkflowNodeData = {
  label?: string;
  actionType?: string;
  title?: string;
  delayValue?: string;
  delayUnit?: string;
  approver?: string;
  listVariable?: string;
  [key: string]: unknown;
};

export type WorkflowNode = Node<WorkflowNodeData>;

type WorkflowNodeProps = NodeProps<WorkflowNode>;

export function TriggerNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-primary/50 transition-colors">
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-primary border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Zap className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">Trigger</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40">
        {data.label}
      </div>
    </div>
  );
}

export function ConditionNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-amber-400/50 transition-colors">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-amber-400 border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
          <HelpCircle className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">Condition</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40">
        {data.label}
      </div>
      
      <Handle type="source" position={Position.Left} id="no" className="w-3 h-3 bg-red-400 border-2 border-surface-container-low !left-[-6px]" />
      <Handle type="source" position={Position.Right} id="yes" className="w-3 h-3 bg-emerald-400 border-2 border-surface-container-low !right-[-6px]" />
      
      <div className="absolute top-[80px] -left-[30px] text-[10px] font-bold text-red-400">NO</div>
      <div className="absolute top-[80px] -right-[35px] text-[10px] font-bold text-emerald-400">YES</div>
    </div>
  );
}

export function DelayNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-blue-400/50 transition-colors">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-400 border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
          <Clock className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">Delay</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40 font-mono">
        {data.delayValue || '0'} {data.delayUnit || 'Hours'}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-400 border-2 border-surface-container-low" />
    </div>
  );
}

export function ApprovalNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-purple-400/50 transition-colors">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-400 border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
          <UserCheck className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">Approval Request</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40 truncate">
        Assignee: {data.approver || 'Unassigned'}
      </div>
      
      <Handle type="source" position={Position.Left} id="rejected" className="w-3 h-3 bg-red-400 border-2 border-surface-container-low !left-[-6px]" />
      <Handle type="source" position={Position.Right} id="approved" className="w-3 h-3 bg-emerald-400 border-2 border-surface-container-low !right-[-6px]" />
      
      <div className="absolute top-[80px] -left-[55px] text-[10px] font-bold text-red-400 uppercase">Rejected</div>
      <div className="absolute top-[80px] -right-[60px] text-[10px] font-bold text-emerald-400 uppercase">Approved</div>
    </div>
  );
}

export function ParserNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-pink-400/50 transition-colors">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-pink-400 border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
          <Code className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">Data Parser</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40 font-mono truncate">
        {data.label || 'Map JSON Payload'}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-pink-400 border-2 border-surface-container-low" />
    </div>
  );
}

export function ForEachNode({ data }: WorkflowNodeProps) {
  return (
    <div className="bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-cyan-400/50 transition-colors">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-cyan-400 border-2 border-surface-container-low" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
          <Repeat className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">For-Each Loop</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40 font-mono truncate">
        {data.listVariable || 'Array to Loop'}
      </div>
      
      <Handle type="source" position={Position.Right} id="loop" className="w-3 h-3 bg-cyan-400 border-2 border-surface-container-low !right-[-6px]" />
      <Handle type="source" position={Position.Bottom} id="done" className="w-3 h-3 bg-slate-400 border-2 border-surface-container-low" />
      
      <div className="absolute top-[80px] -right-[40px] text-[10px] font-bold text-cyan-400 uppercase">Loop</div>
      <div className="absolute -bottom-[20px] left-1/2 -translate-x-1/2 text-[10px] font-bold text-on-surface-variant uppercase">Done</div>
    </div>
  );
}

export function ActionNode({ data }: WorkflowNodeProps) {
  
  // Determine icon and color based on the specific action type passed in data
  let Icon = ArrowRightCircle;
  let colorClass = "text-emerald-400";
  let bgClass = "bg-emerald-500/10";
  
  if (data.actionType === 'email') {
    Icon = Mail;
    colorClass = "text-blue-400";
    bgClass = "bg-blue-500/10";
  } else if (data.actionType === 'slack') {
    Icon = MessageSquare;
    colorClass = "text-pink-400";
    bgClass = "bg-pink-500/10";
  } else if (data.actionType === 'http') {
    Icon = Globe;
    colorClass = "text-purple-400";
    bgClass = "bg-purple-500/10";
  } else if (data.actionType === 'assign') {
    Icon = Users;
    colorClass = "text-emerald-400";
    bgClass = "bg-emerald-500/10";
  }

  return (
    <div className={`bg-surface-container-low border border-border/50 rounded-2xl p-4 shadow-xl w-[250px] group hover:border-emerald-400/50 transition-colors`}>
      <Handle type="target" position={Position.Top} className={`w-3 h-3 ${colorClass.replace('text-', 'bg-')} border-2 border-surface-container-low`} />
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-full ${bgClass} flex items-center justify-center ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="font-bold text-on-surface">{data.title || 'Action'}</div>
      </div>
      <div className="text-xs text-on-surface-variant bg-surface-container p-2 rounded-xl border border-border/40">
        {data.label}
      </div>
      
      {/* Primary Success Output */}
      <Handle type="source" position={Position.Bottom} id="success" className={`w-3 h-3 ${colorClass.replace('text-', 'bg-')} border-2 border-surface-container-low`} />
      
      {/* Error Output Branch */}
      <Handle type="source" position={Position.Right} id="error" className="w-3 h-3 bg-red-400 border-2 border-surface-container-low !right-[-6px]" />
      <div className="absolute top-[80px] -right-[60px] text-[10px] font-bold text-red-400 uppercase">On Error</div>
    </div>
  );
}
