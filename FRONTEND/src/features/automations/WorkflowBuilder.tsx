import React, { useState, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { 
  ReactFlow, 
  Background, 
  useNodesState, 
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  NodeMouseHandler,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  TriggerNode,
  ConditionNode,
  ActionNode,
  DelayNode,
  ApprovalNode,
  ParserNode,
  ForEachNode,
  type WorkflowNode,
  type WorkflowNodeData,
} from './CustomNodes';
import { Save, Play, ZoomIn, ZoomOut, Maximize, ArrowLeft, Code, Mail, MessageSquare, Globe, Users, X, Trash2, Copy, History, CheckCircle2, Clock, Rocket, UserCheck, Repeat } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  approval: ApprovalNode,
  parser: ParserNode,
  foreach: ForEachNode,
};

let id = 10;
const getId = () => `${id++}`;

function CustomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <div className="absolute bottom-4 left-4 flex flex-col bg-surface-container-low border border-border/40 rounded-xl overflow-hidden shadow-2xl z-10">
      <button onClick={() => zoomIn()} className="p-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border-b border-border/20"><ZoomIn className="w-4 h-4" /></button>
      <button onClick={() => zoomOut()} className="p-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border-b border-border/20"><ZoomOut className="w-4 h-4" /></button>
      <button onClick={() => fitView({ duration: 800 })} className="p-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"><Maximize className="w-4 h-4" /></button>
    </div>
  );
}

function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string, actionType?: string, title?: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/label', label);
    if (actionType) event.dataTransfer.setData('application/reactflow/actionType', actionType);
    if (title) event.dataTransfer.setData('application/reactflow/title', title);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="absolute top-4 left-4 bg-surface-container-low border border-border/40 p-4 rounded-2xl w-64 shadow-2xl z-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
       <h3 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-wider">Components</h3>
       <div className="space-y-4">
         <div>
           <div className="text-xs font-bold text-on-surface-variant mb-2">Triggers</div>
           <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-primary/50 transition-colors" onDragStart={(event) => onDragStart(event, 'trigger', 'Ticket Created')} draggable>
             <div className="w-2 h-2 rounded-full bg-primary" /> Ticket Event
           </div>
         </div>

         <div>
           <div className="text-xs font-bold text-on-surface-variant mb-2">Core Logic</div>
           <div className="space-y-2">
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-amber-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'condition', 'Check Condition')} draggable>
               <div className="w-2 h-2 rounded-full bg-amber-400" /> If / Else Branch
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-cyan-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'foreach', 'Loop Array')} draggable>
               <Repeat className="w-4 h-4 text-cyan-400" /> For-Each Loop
             </div>
           </div>
         </div>

         <div>
           <div className="text-xs font-bold text-on-surface-variant mb-2">Process Control</div>
           <div className="space-y-2">
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-purple-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'approval', 'Manager Approval')} draggable>
               <UserCheck className="w-4 h-4 text-purple-400" /> Request Approval
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-blue-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'delay', 'Wait 24 Hours')} draggable>
               <Clock className="w-4 h-4 text-blue-400" /> Delay / Timer
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-pink-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'parser', 'Format Payload')} draggable>
               <Code className="w-4 h-4 text-pink-400" /> Data Parser
             </div>
           </div>
         </div>

         <div>
           <div className="text-xs font-bold text-on-surface-variant mb-2">Actions</div>
           <div className="space-y-2">
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-blue-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'action', 'Send notification', 'email', 'Send Email')} draggable>
               <Mail className="w-4 h-4 text-blue-400" /> Send Email
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-pink-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'action', 'Post to channel', 'slack', 'Slack Message')} draggable>
               <MessageSquare className="w-4 h-4 text-pink-400" /> Slack Message
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-emerald-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'action', 'Assign to team', 'assign', 'Assign Group')} draggable>
               <Users className="w-4 h-4 text-emerald-400" /> Assign Group
             </div>
             <div className="p-3 bg-surface-container rounded-xl border border-border/50 text-xs text-on-surface flex items-center gap-2 cursor-grab hover:border-purple-400/50 transition-colors" onDragStart={(event) => onDragStart(event, 'action', 'POST data to API', 'http', 'HTTP Request')} draggable>
               <Globe className="w-4 h-4 text-purple-400" /> HTTP Request
             </div>
           </div>
         </div>
       </div>
    </div>
  );
}

function VariablePicker({
  field,
  onAppend,
}: {
  field: string;
  onAppend: (field: string, variable: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <button type="button" onClick={() => onAppend(field, 'ticket.id')} className="text-[10px] bg-surface-container border border-border/40 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors">ticket.id</button>
      <button type="button" onClick={() => onAppend(field, 'ticket.priority')} className="text-[10px] bg-surface-container border border-border/40 text-amber-400 px-2 py-1 rounded hover:bg-amber-400/20 transition-colors">ticket.priority</button>
      <button type="button" onClick={() => onAppend(field, 'user.name')} className="text-[10px] bg-surface-container border border-border/40 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-400/20 transition-colors">user.name</button>
    </div>
  );
}

function PropertiesPanel({ 
  selectedNode, 
  updateNodeData, 
  onDelete, 
  onDuplicate 
}: { 
  selectedNode: WorkflowNode | null, 
  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => void,
  onDelete: (id: string) => void,
  onDuplicate: (node: WorkflowNode) => void
}) {
  if (!selectedNode) return null;

  const appendVariable = (field: string, variable: string) => {
    const currentVal = selectedNode.data[field] as string || '';
    updateNodeData(selectedNode.id, { [field]: currentVal + `{{${variable}}}` });
  };

  return (
    <div className="absolute top-4 right-4 bg-surface-container-low border border-border/40 p-6 rounded-2xl w-80 shadow-2xl z-10 animate-in slide-in-from-right-4 duration-200 flex flex-col max-h-[80vh]">
      <h3 className="text-sm font-bold text-on-surface mb-6 uppercase tracking-wider flex items-center gap-2">
        Properties
        <span className="text-xs font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface-variant ml-auto">
          {selectedNode.type}
        </span>
      </h3>

      <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
        <div>
          <label className="block text-xs font-bold text-on-surface-variant mb-1">Node Label</label>
          <input 
            type="text" 
            value={selectedNode.data.label as string || ''}
            onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
            className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        {selectedNode.type === 'action' && selectedNode.data.actionType === 'email' && (
          <>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">To (Email)</label>
              <input type="text" value={selectedNode.data.to as string || ''} onChange={(e) => updateNodeData(selectedNode.id, { to: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none" />
              <VariablePicker field="to" onAppend={appendVariable} />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Subject</label>
              <input type="text" value={selectedNode.data.subject as string || ''} onChange={(e) => updateNodeData(selectedNode.id, { subject: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none" />
              <VariablePicker field="subject" onAppend={appendVariable} />
            </div>
          </>
        )}

        {selectedNode.type === 'action' && selectedNode.data.actionType === 'slack' && (
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">Message Content</label>
            <textarea value={selectedNode.data.message as string || ''} onChange={(e) => updateNodeData(selectedNode.id, { message: e.target.value })} rows={3} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none" />
            <VariablePicker field="message" onAppend={appendVariable} />
          </div>
        )}

        {selectedNode.type === 'condition' && (
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">Field to Check</label>
            <select className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none">
              <option>Priority</option>
              <option>Category</option>
              <option>Status</option>
            </select>
          </div>
        )}

        {selectedNode.type === 'delay' && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Duration</label>
              <input type="number" min="1" value={selectedNode.data.delayValue as string || '1'} onChange={(e) => updateNodeData(selectedNode.id, { delayValue: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Unit</label>
              <select value={selectedNode.data.delayUnit as string || 'Hours'} onChange={(e) => updateNodeData(selectedNode.id, { delayUnit: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none">
                <option>Minutes</option>
                <option>Hours</option>
                <option>Days</option>
              </select>
            </div>
          </div>
        )}

        {selectedNode.type === 'approval' && (
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">Approver Group/User</label>
            <select value={selectedNode.data.approver as string || 'Manager'} onChange={(e) => updateNodeData(selectedNode.id, { approver: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none">
              <option value="Manager">Direct Manager</option>
              <option value="IT Directors">IT Directors Group</option>
              <option value="Security">Security Team</option>
            </select>
          </div>
        )}

        {selectedNode.type === 'parser' && (
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">JSON Mapping (Code)</label>
            <textarea value={selectedNode.data.mapping as string || '{\n  "ticket.title": "payload.name"\n}'} onChange={(e) => updateNodeData(selectedNode.id, { mapping: e.target.value })} rows={5} className="w-full bg-[#020617] text-pink-400 border border-border/50 rounded-xl px-3 py-2 text-xs font-mono focus:border-pink-500 focus:outline-none resize-none" />
          </div>
        )}

        {selectedNode.type === 'foreach' && (
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">Array Variable to Loop</label>
            <input type="text" placeholder="e.g. ticket.assets" value={selectedNode.data.listVariable as string || ''} onChange={(e) => updateNodeData(selectedNode.id, { listVariable: e.target.value })} className="w-full bg-surface-container border border-border/50 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-cyan-400 focus:outline-none" />
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => appendVariable('listVariable', 'ticket.assets')} className="text-[10px] bg-surface-container border border-border/40 text-cyan-400 px-2 py-1 rounded hover:bg-cyan-400/20 transition-colors">ticket.assets</button>
              <button onClick={() => appendVariable('listVariable', 'user.devices')} className="text-[10px] bg-surface-container border border-border/40 text-cyan-400 px-2 py-1 rounded hover:bg-cyan-400/20 transition-colors">user.devices</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-border/20 grid grid-cols-2 gap-3">
        <button onClick={() => onDuplicate(selectedNode)} className="flex items-center justify-center gap-2 bg-surface-container border border-border/40 text-on-surface-variant hover:text-on-surface px-4 py-2 rounded-xl text-xs font-bold transition-colors">
          <Copy className="w-3 h-3" /> Duplicate
        </button>
        <button onClick={() => onDelete(selectedNode.id)} className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}

export default function WorkflowBuilder() {
  const navigate = useNavigate();
  const { id: workflowId } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [showJson, setShowJson] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  const isNew = workflowId === 'new';
  
  const initialNodes: WorkflowNode[] = isNew ? [] : [
    { id: '1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: 'When a new ticket is created' } },
    { id: '2', type: 'condition', position: { x: 250, y: 200 }, data: { label: 'Is Priority = Critical?' } },
    { id: '3', type: 'action', position: { x: 450, y: 350 }, data: { label: 'Assign to L3 Network Team', actionType: 'assign', title: 'Assign Group' } },
    { id: '4', type: 'action', position: { x: 50, y: 350 }, data: { label: 'Assign to L1 Support', actionType: 'assign', title: 'Assign Group' } },
    { id: '5', type: 'action', position: { x: 450, y: 500 }, data: { label: 'Send Alert to On-Call', actionType: 'slack', title: 'Slack Message' } },
  ];

  const initialEdges: Edge[] = isNew ? [] : [
    { id: 'e1-2', source: '1', target: '2', animated: false, style: { stroke: '#22d3ee' } },
    { id: 'e2-3', source: '2', target: '3', sourceHandle: 'yes', type: 'smoothstep', animated: false, style: { stroke: '#10b981' } },
    { id: 'e2-4', source: '2', target: '4', sourceHandle: 'no', type: 'smoothstep', animated: false, style: { stroke: '#f87171' } },
    { id: 'e3-5', source: '3', target: '5', type: 'smoothstep', animated: false, style: { stroke: '#10b981' } },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => {
      // Determine default color based on handle
      let color = '#22d3ee'; // Default blue
      if (params.sourceHandle === 'yes' || params.sourceHandle === 'approved' || params.sourceHandle === 'success') color = '#10b981'; // Green
      if (params.sourceHandle === 'no' || params.sourceHandle === 'rejected' || params.sourceHandle === 'error') color = '#f87171'; // Red
      if (params.sourceHandle === 'loop') color = '#22d3ee'; // Cyan for loops
      if (params.sourceHandle === 'done') color = '#94a3b8'; // Slate for done

      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', style: { stroke: color } }, eds));
    },
    [setEdges]
  );

  const onNodeClick: NodeMouseHandler<WorkflowNode> = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeData = (nodeId: string, newData: Partial<WorkflowNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node,
      )
    );
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  };

  const duplicateNode = (node: WorkflowNode) => {
    const newNode = {
      ...node,
      id: getId(),
      position: { x: node.position.x + 50, y: node.position.y + 50 }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const runTestAnimation = () => {
    if (isTesting) return;
    setIsTesting(true);
    
    // Simulate edges lighting up in sequence
    let step = 0;
    const interval = setInterval(() => {
      setEdges((eds) => 
        eds.map((edge, i) => {
          if (i === step) return { ...edge, animated: true, style: { stroke: '#10b981', strokeWidth: 3 } };
          if (i < step) return { ...edge, animated: false, style: { stroke: '#10b981', strokeWidth: 1 } };
          return { ...edge, animated: false, style: { stroke: '#22d3ee' } };
        })
      );
      step++;
      if (step > edges.length) {
        clearInterval(interval);
        setTimeout(() => {
          setIsTesting(false);
          // Reset edges
          setEdges((eds) => eds.map(e => ({ ...e, animated: false, style: { stroke: '#22d3ee', strokeWidth: 1 } })));
        }, 1500);
      }
    }, 600);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-full bg-[#0B0F19]">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
      {/* Top Header */}
      <div className="p-4 border-b border-border/40 flex justify-between items-center bg-surface-container-lowest z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/app/automations')} className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border/50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-on-surface flex items-center gap-2">
              {isNew ? 'Untitled Automation' : 'Critical Incident Automation'}
              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${isDraft ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                {isDraft ? 'Draft' : 'Published v1.0'}
              </span>
            </h1>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setShowLogs(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-surface-container border border-border/50 text-on-surface-variant hover:text-on-surface transition-colors">
            <History className="w-4 h-4" /> Logs
          </button>
          <button onClick={() => setShowJson(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-surface-container border border-border/50 text-on-surface-variant hover:text-primary transition-colors">
            <Code className="w-4 h-4" /> JSON
          </button>
          <button onClick={runTestAnimation} disabled={isTesting} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${isTesting ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-surface-container border-border/50 text-on-surface-variant hover:text-emerald-400'}`}>
            <Play className={`w-4 h-4 ${isTesting ? 'animate-pulse' : ''}`} /> {isTesting ? 'Running...' : 'Test Flow'}
          </button>
          
          {/* Save/Publish Dropdown Split Button */}
          <div className="flex items-center ml-2">
            <button 
              onClick={() => setIsDraft(true)}
              className="flex items-center gap-2 bg-surface-container-high border border-border/50 text-on-surface px-4 py-2 rounded-l-xl text-xs font-bold hover:bg-surface-container-highest transition-colors"
            >
              <Save className="w-3 h-3" /> Save Draft
            </button>
            <button 
              onClick={() => setIsDraft(false)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 border border-primary rounded-r-xl text-xs font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all"
            >
              <Rocket className="w-3 h-3" /> Publish
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlowProvider>
          <WorkflowCanvasInternal 
            nodes={nodes} 
            edges={edges} 
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange} 
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            setNodes={setNodes}
          />
        </ReactFlowProvider>
        <Sidebar />
        <PropertiesPanel selectedNode={selectedNode} updateNodeData={updateNodeData} onDelete={deleteNode} onDuplicate={duplicateNode} />
      </div>

      {/* JSON Preview Modal */}
      {showJson && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-surface-container-low border border-border/50 rounded-3xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-surface-container">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2"><Code className="w-5 h-5 text-primary" /> Generated JSON Schema</h2>
              <button onClick={() => setShowJson(false)} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-[#0B0F19] custom-scrollbar">
              <pre className="text-xs font-mono text-emerald-400">{JSON.stringify({ nodes, edges }, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-surface-container-low border border-border/50 rounded-3xl w-full max-w-4xl flex flex-col shadow-2xl">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-surface-container">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Execution Logs</h2>
              <button onClick={() => setShowLogs(false)} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/40 text-xs text-on-surface-variant">
                    <th className="pb-3 font-medium">Run ID</th>
                    <th className="pb-3 font-medium">Date & Time</th>
                    <th className="pb-3 font-medium">Trigger Event</th>
                    <th className="pb-3 font-medium">Duration</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-on-surface">
                  <tr className="border-b border-border/20 hover:bg-surface-container transition-colors">
                    <td className="py-4 font-mono text-xs">run_8f92k</td>
                    <td className="py-4 text-on-surface-variant text-xs">Today, 10:42 AM</td>
                    <td className="py-4">Ticket Created (#1042)</td>
                    <td className="py-4 font-mono text-xs">142ms</td>
                    <td className="py-4"><span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-xs font-bold"><CheckCircle2 className="w-3 h-3"/> Success</span></td>
                  </tr>
                  <tr className="border-b border-border/20 hover:bg-surface-container transition-colors">
                    <td className="py-4 font-mono text-xs">run_7x11a</td>
                    <td className="py-4 text-on-surface-variant text-xs">Yesterday, 4:15 PM</td>
                    <td className="py-4">Ticket Created (#1041)</td>
                    <td className="py-4 font-mono text-xs">89ms</td>
                    <td className="py-4"><span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-xs font-bold"><CheckCircle2 className="w-3 h-3"/> Success</span></td>
                  </tr>
                  <tr className="hover:bg-surface-container transition-colors">
                    <td className="py-4 font-mono text-xs">run_2b99z</td>
                    <td className="py-4 text-on-surface-variant text-xs">Yesterday, 9:00 AM</td>
                    <td className="py-4">Ticket Created (#1038)</td>
                    <td className="py-4 font-mono text-xs">412ms</td>
                    <td className="py-4"><span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-1 rounded text-xs font-bold"><X className="w-3 h-3"/> Failed (Slack API)</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

type WorkflowCanvasProps = {
  nodes: WorkflowNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<WorkflowNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: NodeMouseHandler<WorkflowNode>;
  onPaneClick: () => void;
  setNodes: Dispatch<SetStateAction<WorkflowNode[]>>;
};

function WorkflowCanvasInternal({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  setNodes,
}: WorkflowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow/type');
      const label = event.dataTransfer.getData('application/reactflow/label');
      const actionType = event.dataTransfer.getData('application/reactflow/actionType');
      const title = event.dataTransfer.getData('application/reactflow/title');

      if (typeof type === 'undefined' || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowNode = {
        id: getId(),
        type,
        position,
        data: { label, actionType, title },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-[#0B0F19]"
      >
        <Background color="#1E293B" gap={16} size={1} />
        <CustomControls />
      </ReactFlow>
    </>
  );
}
