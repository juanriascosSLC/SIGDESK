import React, { useState } from 'react';
import { Key, Plus, Trash2, Copy, CheckCircle2, ShieldAlert } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
}

const INITIAL_API_KEYS: ApiKey[] = [
  {
    id: '1',
    name: 'SIGInventory Webhook Sync',
    prefix: 'sig_sk_9x8c...',
    createdAt: '2026-06-29T12:00:00.000Z',
    lastUsed: '2026-07-29T16:55:00.000Z',
  },
  {
    id: '2',
    name: 'SIGInstallations Mobile App',
    prefix: 'sig_sk_2m4k...',
    createdAt: '2026-05-30T12:00:00.000Z',
    lastUsed: '2026-07-29T15:00:00.000Z',
  },
];

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_API_KEYS);

  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API key generation
    const randomHex = Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
    const fullKey = `sig_sk_${randomHex}`;
    
    const newEntry: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName,
      prefix: `sig_sk_${randomHex.substring(0, 4)}...`,
      createdAt: new Date().toISOString(),
      lastUsed: null
    };

    setKeys((current) => [newEntry, ...current]);
    setGeneratedKey(fullKey);
  };

  const handleCopy = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeAndReset = () => {
    setShowNewKeyModal(false);
    setGeneratedKey(null);
    setNewKeyName('');
    setCopied(false);
  };

  const handleRevoke = (id: string) => {
    if (confirm('Are you sure you want to revoke this API key? Applications using it will immediately lose access.')) {
      setKeys((current) => current.filter((key) => key.id !== id));
    }
  };

  return (
    <div className="p-6 lg:p-8 w-full space-y-6 h-full overflow-y-auto">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide mb-1 flex items-center gap-2">
            <Key className="w-6 h-6 text-primary" />
            API Keys & Integrations
          </h1>
          <p className="text-sm text-on-surface-variant">Manage API keys to allow external applications to interact with SIG-DESK.</p>
        </div>
        <button 
          onClick={() => setShowNewKeyModal(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all flex items-center gap-2"
        >
           <Plus className="w-4 h-4" />
           Generate New Key
        </button>
      </div>

      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-border/40 bg-surface-container/50 flex items-start gap-4">
           <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
           <div>
             <h3 className="text-sm font-bold text-amber-400">Security Notice</h3>
             <p className="text-xs text-on-surface-variant mt-1">
               API keys grant full programmatic access to SIG-DESK resources. Treat them like passwords. Do not hardcode them in public repositories.
             </p>
           </div>
        </div>
        
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface-container/50 border-b border-border/40 text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Key Prefix</th>
              <th className="px-6 py-4">Created At</th>
              <th className="px-6 py-4">Last Used</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {keys.map(k => (
              <tr key={k.id} className="hover:bg-surface-container/50 transition-colors">
                <td className="px-6 py-4 font-medium text-on-surface">{k.name}</td>
                <td className="px-6 py-4 font-mono text-primary text-xs">{k.prefix}</td>
                <td className="px-6 py-4 text-on-surface-variant">
                   {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-on-surface-variant">
                   {k.lastUsed ? new Date(k.lastUsed).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4 text-right">
                   <button 
                     onClick={() => handleRevoke(k.id)}
                     className="p-2 rounded-lg text-on-surface-variant hover:text-red-400 hover:bg-red-500/10 transition-colors"
                     title="Revoke Key"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant italic">
                   No API keys generated yet.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Mockup */}
      {showNewKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-border/50 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border/40">
              <h2 className="text-xl font-black text-on-surface">Create API Key</h2>
            </div>
            
            {!generatedKey ? (
              <form onSubmit={handleGenerate} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Application Name</label>
                  <input 
                    autoFocus
                    required
                    type="text" 
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    placeholder="e.g. Intermapper Polling Service" 
                    className="w-full bg-surface-container border border-border/50 text-on-surface rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button type="button" onClick={closeAndReset} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:-translate-y-0.5 transition-all">
                    Generate
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6 space-y-6">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Key Generated Successfully
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Please copy this key and store it securely. For security reasons, <strong>you will not be able to see it again.</strong>
                  </p>
                </div>

                <div className="relative group">
                  <input 
                    readOnly
                    type="text"
                    value={generatedKey}
                    className="w-full bg-surface-container-high border border-border/50 text-primary font-mono text-sm rounded-xl pl-4 pr-12 py-4 outline-none"
                  />
                  <button 
                    onClick={handleCopy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-surface-container hover:bg-surface-container-highest transition-colors"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-on-surface-variant" />}
                  </button>
                </div>

                <div className="flex justify-end pt-4">
                  <button onClick={closeAndReset} className="bg-surface-container border border-border/50 text-on-surface px-6 py-2 rounded-xl text-sm font-bold hover:bg-surface-container-high transition-all">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
