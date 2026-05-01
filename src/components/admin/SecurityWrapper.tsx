import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, Lock, Unlock, AlertTriangle } from "lucide-react";

interface SecurityWrapperProps {
  children: React.ReactNode;
  onUnauthorizedAccess?: () => void;
}

export const SecurityWrapper: React.FC<SecurityWrapperProps> = ({
  children,
  onUnauthorizedAccess,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  // Hardcoded for demo/MVP
  const MASTER_PIN = "1234";

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === MASTER_PIN) {
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
      if (onUnauthorizedAccess) {
        onUnauthorizedAccess();
      }
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isAuthenticated ? (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="w-full h-full overflow-y-auto"
        >
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="login"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950 p-4"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(4,47,46,0.3)_0%,rgba(2,6,23,1)_100%)] pointer-events-none" />

          <div
            className="relative bg-gray-900/80 backdrop-blur-2xl border border-teal-500/30 p-8 w-full max-w-sm flex flex-col items-center gap-6"
            style={{
              borderRadius: "88px 24px 88px 24px",
              boxShadow: "0 25px 50px -12px rgba(20, 184, 166, 0.2)",
            }}
          >
            <div className="w-20 h-20 bg-teal-950/50 rounded-full flex items-center justify-center border border-teal-500/20 mb-2">
              <Shield className="text-teal-400 w-10 h-10" />
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-black text-white mb-1 tracking-tight">
                Master Security
              </h2>
              <p className="text-teal-400/80 text-sm font-medium">
                Restricted Access Module
              </p>
            </div>

            <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="text-gray-500 w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError(false);
                  }}
                  autoFocus
                  placeholder="Enter Master PIN (1234)"
                  className="w-full bg-gray-950/50 border border-gray-800 focus:border-teal-500/50 text-white rounded-2xl py-4 pl-12 pr-4 outline-none transition-all text-center tracking-[0.5em] font-mono text-xl placeholder:tracking-normal placeholder:text-gray-600 placeholder:text-sm"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-rose-400 text-sm justify-center bg-rose-950/30 p-2 rounded-lg border border-rose-900/50"
                >
                  <AlertTriangle size={16} />
                  <span>Unauthorized Access Attempt!</span>
                </motion.div>
              )}

              <button
                type="submit"
                className="w-full py-4 mt-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] active:scale-95 flex items-center justify-center gap-2 group"
              >
                <span>Authenticate</span>
                <Unlock
                  size={18}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
