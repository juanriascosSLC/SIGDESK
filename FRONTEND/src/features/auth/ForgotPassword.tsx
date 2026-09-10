import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function ForgotPassword() {
  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col justify-center relative overflow-hidden font-sans">
      <div className="absolute top-[10%] left-[10%] w-[30%] h-[30%] bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex flex-col items-center justify-center mb-8 relative group cursor-pointer">
           <div className="relative mb-4">
             <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
             <div className="relative p-3 rounded-2xl bg-surface-container-low border border-cyan-500/30 flex items-center justify-center shadow-xl">
               <img src="/logo.png" alt="SIG-DESK Logo" className="w-14 h-14 object-contain drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
             </div>
           </div>
           <div className="text-center mt-2">
             <h1 className="text-3xl font-black tracking-[0.25em] text-on-surface uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">SIG-DESK</h1>
             <div className="text-[10px] font-mono font-bold tracking-[0.4em] text-cyan-500/80 uppercase mt-2">Service Management</div>
           </div>
        </div>
      </div>

      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-surface-container-low/80 backdrop-blur-xl py-8 px-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] sm:rounded-3xl sm:px-10 border border-border text-center space-y-6">
          <div className="mx-auto w-14 h-14 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-on-surface mb-2">Password Reset</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Self-service password reset is not available during beta. Contact your administrator for help.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 border border-border/60 rounded-xl bg-surface-container hover:bg-surface-container-high text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
