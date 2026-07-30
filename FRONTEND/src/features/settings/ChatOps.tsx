import { useState } from 'react';
import { MessageSquare, CheckCircle2, XCircle, Settings2, RefreshCcw, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  status: 'connected' | 'disconnected';
  icon: LucideIcon;
  color: string;
  description: string;
  metrics?: {
    messagesToday: number;
    ticketsCreated: number;
  };
}

export default function ChatOps() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'slack',
      name: 'Slack',
      status: 'connected',
      icon: MessageSquare,
      color: 'text-[#E01E5A]',
      description: 'Allow users to create tickets using /sig-desk commands and receive notifications in channels.',
      metrics: {
        messagesToday: 42,
        ticketsCreated: 12
      }
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      status: 'disconnected',
      icon: MessageSquare, // Fallback icon for Teams
      color: 'text-[#6264A7]',
      description: 'Integrate the SIG-DESK bot directly into your Teams workspaces.',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      status: 'disconnected',
      icon: MessageSquare, // Fallback icon for WA
      color: 'text-[#25D366]',
      description: 'Enable customers to open and track tickets through a WhatsApp chatbot.',
    }
  ]);

  const toggleConnection = (id: string) => {
    setIntegrations(integrations.map(int => {
      if (int.id === id) {
        return {
          ...int,
          status: int.status === 'connected' ? 'disconnected' : 'connected',
          metrics: int.status === 'disconnected' ? { messagesToday: 0, ticketsCreated: 0 } : undefined
        };
      }
      return int;
    }));
  };

  return (
    <div className="p-6 lg:p-8 w-full space-y-8 h-full overflow-y-auto">
      
      <div>
        <h1 className="text-2xl font-black text-on-surface tracking-wide mb-2 flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-primary" />
          ChatOps Integrations
        </h1>
        <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
          Connect SIG-DESK with your favorite messaging platforms. Enable users to create tickets from chat, and notify technicians instantly when critical incidents occur.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {integrations.map(integration => {
          const Icon = integration.icon;
          const isConnected = integration.status === 'connected';

          return (
            <div key={integration.id} className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col relative overflow-hidden group hover:border-border/80 transition-all">
              
              {/* Background glow if connected */}
              {isConnected && (
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
              )}

              <div className="flex justify-between items-start mb-6 z-10">
                <div className={`w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center ${integration.color} shadow-lg`}>
                  <Icon className="w-6 h-6" />
                </div>
                
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 ${
                  isConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-surface-container-high text-on-surface-variant border border-border/50'
                }`}>
                  {isConnected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {integration.status}
                </span>
              </div>

              <h3 className="text-lg font-bold text-on-surface mb-2 z-10">{integration.name}</h3>
              <p className="text-sm text-on-surface-variant mb-6 flex-1 z-10 leading-relaxed">
                {integration.description}
              </p>

              {isConnected && integration.metrics && (
                <div className="bg-surface-container border border-border/50 rounded-2xl p-4 mb-6 z-10 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
                      <RefreshCcw className="w-3 h-3" /> Syncs Today
                    </div>
                    <div className="text-lg font-black text-on-surface">{integration.metrics.messagesToday}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Bell className="w-3 h-3" /> Tickets
                    </div>
                    <div className="text-lg font-black text-primary">{integration.metrics.ticketsCreated}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 z-10 mt-auto">
                <button 
                  onClick={() => toggleConnection(integration.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    isConnected
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      : 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_25px_rgba(34,211,238,0.4)]'
                  }`}
                >
                  {isConnected ? 'Disconnect' : 'Connect'}
                </button>
                {isConnected && (
                  <button className="px-4 rounded-xl bg-surface-container border border-border/50 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
                    <Settings2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
