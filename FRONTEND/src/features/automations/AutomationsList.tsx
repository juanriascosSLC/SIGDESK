import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Plus, Play, Search, Zap, Clock, UserPlus, ServerCrash } from 'lucide-react';

export default function AutomationsList() {
  const navigate = useNavigate();

  const [automations] = useState([
    {
      id: 'flow-1',
      name: 'Critical Incident Routing',
      description: 'Automatically assigns P1 tickets to L3 and triggers SMS alerts to on-call engineers.',
      status: 'active',
      trigger: 'Ticket Created',
      icon: ServerCrash,
      executions: 142,
      lastRun: '10 mins ago',
      color: 'text-red-400'
    },
    {
      id: 'flow-2',
      name: 'New Employee Onboarding',
      description: 'Creates AD accounts, provisions software licenses, and assigns hardware setup tasks.',
      status: 'active',
      trigger: 'Catalog Request',
      icon: UserPlus,
      executions: 28,
      lastRun: '2 hours ago',
      color: 'text-emerald-400'
    },
    {
      id: 'flow-3',
      name: 'Auto-Close Stale Tickets',
      description: 'Closes tickets that have been in "Waiting for User" status for more than 5 days.',
      status: 'inactive',
      trigger: 'Scheduled (Daily)',
      icon: Clock,
      executions: 0,
      lastRun: 'Never',
      color: 'text-amber-400'
    }
  ]);

  return (
    <div className="p-6 lg:p-8 w-full h-full overflow-y-auto">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide mb-1 flex items-center gap-3">
            <Workflow className="w-6 h-6 text-primary" />
            Workflow Automations
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Design, deploy, and monitor no-code automations to eliminate repetitive tasks and accelerate incident resolution.
          </p>
        </div>
        <button 
          onClick={() => navigate('/app/automations/new')}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(34,211,238,0.4)] transition-all"
        >
          <Plus className="w-5 h-5" />
          Create Workflow
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input 
            type="text"
            placeholder="Search automations..."
            className="w-full bg-surface-container-low border border-border/40 rounded-xl py-2 pl-10 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors"
          />
        </div>
        <button className="px-4 py-2 rounded-xl bg-surface-container-low border border-border/40 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors">
          Status: All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {automations.map(flow => {
          const Icon = flow.icon;
          return (
            <div 
              key={flow.id} 
              className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col group cursor-pointer hover:border-primary/50 transition-colors relative"
              onClick={() => navigate(`/app/automations/${flow.id}`)}
            >
              
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center ${flow.color} shadow-lg border border-border/50`}>
                  <Icon className="w-5 h-5" />
                </div>
                
                {/* Toggle Switch Mockup */}
                <div 
                  className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${
                    flow.status === 'active' ? 'bg-primary' : 'bg-surface-container-high border border-border/50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); /* toggle logic */ }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    flow.status === 'active' ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              <h3 className="text-lg font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">{flow.name}</h3>
              <p className="text-xs text-on-surface-variant mb-6 flex-1 leading-relaxed">
                {flow.description}
              </p>

              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-border/20">
                <div>
                  <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Trigger
                  </div>
                  <div className="text-xs font-bold text-on-surface truncate">{flow.trigger}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Play className="w-3 h-3" /> Executions
                  </div>
                  <div className="text-xs font-bold text-on-surface">{flow.executions} <span className="text-on-surface-variant font-normal">({flow.lastRun})</span></div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
