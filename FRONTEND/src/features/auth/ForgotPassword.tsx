import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock submit logic
    setIsSubmitted(true);
  };

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
        <p className="mt-2 text-center text-sm text-on-surface-variant">
          Enter your email to receive a password reset link.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-surface-container-low/80 backdrop-blur-xl py-8 px-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] sm:rounded-3xl sm:px-10 border border-border">
          
          {isSubmitted ? (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <Send className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-on-surface mb-2">Check your email</h3>
                <p className="text-sm text-on-surface-variant">
                  We have sent a password reset link to <span className="font-bold text-cyan-400">{email}</span>.
                </p>
              </div>
              <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors mt-4">
                <ArrowLeft className="w-4 h-4" /> Back to login
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Email address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-on-surface-variant" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface-container-lowest/50 text-on-surface placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.3)] text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-900 transition-all"
                >
                  Send Reset Link
                </button>
              </div>
              
              <div className="text-center">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </Link>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
