import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { auth, db } from "../../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  Send,
  Users,
  ShieldAlert,
  CreditCard,
  Activity,
  BellRing,
  CheckCircle,
  Clock,
  Zap,
  Settings,
  DollarSign,
  Smartphone,
} from "lucide-react";
import BroadcastService, {
  BroadcastPayload,
} from "../../services/BroadcastService";

export const MasterAdmin: React.FC<{ onOpenDashboard?: () => void }> = ({
  onOpenDashboard,
}) => {
  const [activeTab, setActiveTab] = useState<
    "monitor" | "broadcast" | "config"
  >("monitor");

  // Broadcast State
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastType, setBroadcastType] = useState<
    "in-app" | "whatsapp" | "both"
  >("in-app");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);

  // Global Config State
  const [globalConfig, setGlobalConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("nard_global_config");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      businessName: "Nard Inc.",
      paymentUpi: "nard@masterupi",
      pricingBasic: 999,
      pricingPro: 2499,
      pricingUltra: 4999,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem("nard_global_config", JSON.stringify(globalConfig));
      if (auth.currentUser) {
          setDoc(doc(db, 'global_config', 'main'), {
              ...globalConfig,
              updatedAt: serverTimestamp()
          }, { merge: true }).catch(console.error);
      }
    } catch (e) {}
  }, [globalConfig]);

  // Mock Data
  const recentTransactions = [
    {
      id: 1,
      client: "Sharma Sweets",
      amount: 2499,
      utr: "312345678901",
      status: "success",
      time: "2 mins ago",
    },
    {
      id: 2,
      client: "Apex Electronics",
      amount: 4999,
      utr: "908765432112",
      status: "success",
      time: "15 mins ago",
    },
    {
      id: 3,
      client: "Verma Clinic",
      amount: 999,
      utr: "456789123456",
      status: "pending",
      time: "1 hour ago",
    },
  ];

  const expiringClients = [
    { id: "C01", name: "Gupta Traders", plan: "Basic", daysLeft: 2 },
    { id: "C02", name: "Metro Retail", plan: "Pro", daysLeft: 1 },
  ];

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;

    setIsBroadcasting(true);
    setBroadcastResult(null);

    try {
      const result = await BroadcastService.sendBroadcast({
        message: broadcastMsg,
        type: broadcastType,
        targetAudience: "all_active",
      });
      setBroadcastResult({ success: result.success, msg: result.message });
      setBroadcastMsg("");
    } catch (e) {
      setBroadcastResult({ success: false, msg: "Broadcast failed." });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleConfigUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Global Configuration updated in secure admin config!");
  };

  return (
    <div className="min-h-full bg-gray-950 text-gray-200 p-4 sm:p-8 overflow-y-auto selection:bg-teal-500/30">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900/50 p-6 border border-teal-900/50 relative overflow-hidden backdrop-blur-xl"
          style={{ borderRadius: "88px 24px 88px 24px" }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-600/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="flex items-center gap-4 z-10">
            <div className="w-14 h-14 bg-teal-950 rounded-full flex items-center justify-center border border-teal-500/30">
              <ShieldAlert className="text-teal-400" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                Master Admin
              </h1>
              <p className="text-teal-400 font-mono text-sm mt-1">
                E-cosystem Security & Management
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 z-10 w-full sm:w-auto mt-4 sm:mt-0">
            {onOpenDashboard && (
              <button
                onClick={onOpenDashboard}
                className="px-4 py-2 rounded-full font-medium transition-colors bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 flex items-center gap-2"
              >
                <Settings size={16} /> Dashboard
              </button>
            )}
            <button
              onClick={() => setActiveTab("monitor")}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${activeTab === "monitor" ? "bg-teal-500 text-gray-950 hover:bg-teal-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              Monitor
            </button>
            <button
              onClick={() => setActiveTab("broadcast")}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${activeTab === "broadcast" ? "bg-teal-500 text-gray-950 hover:bg-teal-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              Broadcast
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${activeTab === "config" ? "bg-teal-500 text-gray-950 hover:bg-teal-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              Config
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Area */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {activeTab === "monitor" && (
              <>
                {/* Revenue Feed */}
                <div className="bg-gray-900/60 border border-gray-800 rounded-3xl p-6 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Activity className="text-teal-400" /> Live Transaction
                      Feed
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                      </span>
                      <span className="text-xs text-teal-400 font-mono tracking-wider">
                        LISTENING
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-950/50 p-4 rounded-2xl border border-gray-800/80 hover:border-teal-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`p-3 rounded-full ${tx.status === "success" ? "bg-emerald-950/50 text-emerald-400" : "bg-amber-950/50 text-amber-400"}`}
                          >
                            {tx.status === "success" ? (
                              <CheckCircle size={20} />
                            ) : (
                              <Clock size={20} />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-gray-200">
                              {tx.client}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              UTR: {tx.utr} • {tx.time}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 sm:mt-0 flex gap-4 items-center w-full sm:w-auto justify-between sm:justify-end">
                          <span className="text-lg font-black text-white">
                            ₹{tx.amount}
                          </span>
                          {tx.status !== "success" && (
                            <button className="px-3 py-1.5 bg-teal-900/50 text-teal-300 hover:bg-teal-800 hover:text-white rounded-lg text-sm font-medium border border-teal-700/50 transition-colors flex items-center gap-1">
                              <Zap size={14} /> Override
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "broadcast" && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-[88px_24px_88px_24px] p-8">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                  <BellRing className="text-indigo-400" /> Master Broadcast
                  System
                </h2>

                <div className="flex flex-col gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Announcement Message
                    </label>
                    <textarea
                      value={broadcastMsg}
                      onChange={(e) => setBroadcastMsg(e.target.value)}
                      placeholder="Type your message for all active clients..."
                      className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 text-white rounded-2xl p-4 min-h-[120px] resize-none outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Delivery Method
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setBroadcastType("in-app")}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${broadcastType === "in-app" ? "bg-indigo-900/30 border-indigo-500 text-indigo-300" : "bg-gray-950 border-gray-800 text-gray-500 hover:bg-gray-800"}`}
                      >
                        <Smartphone size={20} /> In-App Alert
                      </button>
                      <button
                        onClick={() => setBroadcastType("whatsapp")}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${broadcastType === "whatsapp" ? "bg-green-900/30 border-green-500 text-green-400" : "bg-gray-950 border-gray-800 text-gray-500 hover:bg-gray-800"}`}
                      >
                        <MessageCircleIcon /> WhatsApp
                      </button>
                      <button
                        onClick={() => setBroadcastType("both")}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${broadcastType === "both" ? "bg-slate-800 border-slate-400 text-white" : "bg-gray-950 border-gray-800 text-gray-500 hover:bg-gray-800"}`}
                      >
                        <Send size={20} /> Both Platforms
                      </button>
                    </div>
                  </div>

                  {broadcastResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-xl text-sm font-medium flex items-center justify-center ${broadcastResult.success ? "bg-indigo-950/50 text-indigo-300 border border-indigo-900" : "bg-rose-950/50 text-rose-300 border border-rose-900"}`}
                    >
                      {broadcastResult.msg}
                    </motion.div>
                  )}

                  <button
                    onClick={handleBroadcast}
                    disabled={isBroadcasting || !broadcastMsg.trim()}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
                  >
                    {isBroadcasting ? (
                      <Activity className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                    {isBroadcasting ? "Broadcasting..." : "Launch Broadcast"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "config" && (
              <form
                onSubmit={handleConfigUpdate}
                className="bg-gray-900/60 border border-gray-800 rounded-3xl p-8 flex flex-col gap-8"
              >
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                  <Settings className="text-teal-400" /> Global Configuration
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-400">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={globalConfig.businessName}
                      onChange={(e) =>
                        setGlobalConfig({
                          ...globalConfig,
                          businessName: e.target.value,
                        })
                      }
                      className="bg-gray-950 border border-gray-800 focus:border-teal-500 rounded-xl p-3 text-white outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-400">
                      Master UPI ID
                    </label>
                    <input
                      type="text"
                      value={globalConfig.paymentUpi}
                      onChange={(e) =>
                        setGlobalConfig({
                          ...globalConfig,
                          paymentUpi: e.target.value,
                        })
                      }
                      className="bg-gray-950 border border-gray-800 focus:border-teal-500 rounded-xl p-3 text-emerald-400 font-mono outline-none"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <DollarSign className="text-amber-400" size={18} /> Pricing
                    Table (INR)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-950 p-4 border border-gray-800 rounded-2xl flex flex-col gap-2">
                      <span className="text-gray-400 text-sm font-medium">
                        Basic Plan
                      </span>
                      <input
                        type="number"
                        value={globalConfig.pricingBasic}
                        onChange={(e) =>
                          setGlobalConfig({
                            ...globalConfig,
                            pricingBasic: parseInt(e.target.value) || 0,
                          })
                        }
                        className="bg-transparent text-2xl font-black text-white w-full outline-none"
                      />
                    </div>
                    <div className="bg-gray-950 p-4 border border-teal-900 rounded-2xl flex flex-col gap-2">
                      <span className="text-teal-400 text-sm font-medium">
                        Pro Plan
                      </span>
                      <input
                        type="number"
                        value={globalConfig.pricingPro}
                        onChange={(e) =>
                          setGlobalConfig({
                            ...globalConfig,
                            pricingPro: parseInt(e.target.value) || 0,
                          })
                        }
                        className="bg-transparent text-2xl font-black text-white w-full outline-none"
                      />
                    </div>
                    <div className="bg-gray-950 p-4 border border-amber-900 rounded-2xl flex flex-col gap-2 relative overflow-hidden">
                      <span className="text-amber-400 text-sm font-medium z-10">
                        Ultra Plan
                      </span>
                      <input
                        type="number"
                        value={globalConfig.pricingUltra}
                        onChange={(e) =>
                          setGlobalConfig({
                            ...globalConfig,
                            pricingUltra: parseInt(e.target.value) || 0,
                          })
                        }
                        className="bg-transparent text-2xl font-black text-white w-full outline-none z-10 relative"
                      />
                      <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 mt-4 bg-teal-600 hover:bg-teal-500 text-gray-950 font-black rounded-2xl transition-all shadow-lg"
                >
                  Save Master Config
                </button>
              </form>
            )}
          </div>

          {/* Sidebar Area */}
          <div className="flex flex-col gap-6">
            <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-3xl p-6 border-t-rose-500/30">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Clock className="text-rose-400" size={20} /> Expiry Watch
              </h3>
              <div className="flex flex-col gap-3">
                {expiringClients.map((client) => (
                  <div
                    key={client.id}
                    className="bg-gray-950/80 border border-gray-800/80 p-3 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="text-gray-200 font-medium text-sm">
                        {client.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {client.plan} • {client.daysLeft} days left
                      </div>
                    </div>
                    <button
                      className="p-2 bg-rose-950 text-rose-300 hover:bg-rose-900 rounded-lg transition-colors"
                      title="Send Reminder"
                    >
                      <BellRing size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-gray-500">
                <Users size={24} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-400">
                  Total Active Clients
                </div>
                <div className="text-3xl font-black text-white">42</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component
const MessageCircleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
    <path d="M11.9 16c4.6 0 7-3.9 7-8.1 0-.3 0-.6-.1-.9a6.8 6.8 0 0 0-4.5-4.5A7.1 7.1 0 0 0 4 7.6c.1 3.8 2.6 6.8 6 7l1.9.4" />
  </svg>
);
