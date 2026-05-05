import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Activity,
  IndianRupee,
  ShieldCheck,
  Zap,
  Lock,
  Loader2,
  CheckCircle2,
  Image as ImageIcon,
  Building2,
  Wallet,
  Bot,
  Save,
  Check,
  Store,
  Smartphone,
  Copy,
  Share2,
} from "lucide-react";
import { InventoryManager } from "./InventoryManager";
import { auth, db } from "../../firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../../utils/firestoreErrorHandler";

interface ClientDashboardProps {
  uiLang: string;
  subscriptionStatus: "inactive" | "pending_payment" | "verifying" | "active";
  setSubscriptionStatus: (val: "inactive" | "pending_payment" | "verifying" | "active") => void;
  isTrialActive: boolean;
  trialPlan?: "basic" | "pro" | "ultra";
  onCancelAccess?: () => void;
  onStartFreeTrial?: (plan: "basic" | "pro" | "ultra") => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  uiLang,
  subscriptionStatus,
  setSubscriptionStatus,
  isTrialActive,
  trialPlan,
  onCancelAccess,
  onStartFreeTrial,
}) => {
  const [activeTab, setActiveTab] = useState<"business" | "store">("business");
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "pro" | "ultra">(
    trialPlan || "ultra",
  );
  const [config, setConfig] = useState({
    paymentUpi: "nard@masterupi",
    businessName: "Nard Inc",
    plans: [
      {
        id: "basic",
        name: "Basic",
        nameHi: "बेसिक",
        price: 999,
        color: "text-gray-300",
        border: "border-gray-500",
        bg: "bg-gray-800/60",
      },
      {
        id: "pro",
        name: "Pro",
        nameHi: "प्रो",
        price: 2499,
        color: "text-teal-400",
        border: "border-teal-500",
        bg: "bg-teal-900/30",
      },
      {
        id: "ultra",
        name: "Ultra",
        nameHi: "अल्ट्रा",
        price: 4999,
        color: "text-indigo-400",
        border: "border-indigo-500",
        bg: "bg-indigo-900/40",
      },
    ],
  });

  useEffect(() => {
    if (trialPlan) {
      setSelectedPlan(trialPlan);
    }
  }, [trialPlan]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nard_global_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig({
          paymentUpi: parsed.paymentUpi || "nard@masterupi",
          businessName: parsed.businessName || "Nard Inc",
          plans: [
            {
              id: "basic",
              name: "Basic",
              nameHi: "बेसिक",
              price: parsed.pricingBasic || 999,
              color: "text-gray-300",
              border: "border-gray-500",
              bg: "bg-gray-800/60",
            },
            {
              id: "pro",
              name: "Pro",
              nameHi: "प्रो",
              price: parsed.pricingPro || 2499,
              color: "text-teal-400",
              border: "border-teal-500",
              bg: "bg-teal-900/30",
            },
            {
              id: "ultra",
              name: "Ultra",
              nameHi: "अल्ट्रा",
              price: parsed.pricingUltra || 4999,
              color: "text-indigo-400",
              border: "border-indigo-500",
              bg: "bg-indigo-900/40",
            },
          ],
        });
      }
    } catch (e) {}
  }, []);

  const currentPlan =
    config.plans.find((p) => p.id === selectedPlan) || config.plans[2];
  const generatedUpiUrl = `upi://pay?pa=${config.paymentUpi}&pn=${encodeURIComponent(config.businessName)}&am=${currentPlan.price}`;

  const [overrideShowPlans, setOverrideShowPlans] = useState(false);
  const hasAccess =
    (subscriptionStatus === "active" || isTrialActive) && !overrideShowPlans;

  useEffect(() => {
    if (subscriptionStatus === "verifying") {
      setOverrideShowPlans(false);
    }
  }, [subscriptionStatus]);

  const [digitalIdentity, setDigitalIdentity] = useState({
    brandName: "",
    botName: "",
    logoUrl: "",
    clientUpiId: "",
    customInstructions: "",
  });
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [showIdentitySaved, setShowIdentitySaved] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch digital identity from Firestore
        try {
          const docRef = doc(db, 'users', user.uid, 'digitalIdentities', 'main');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setDigitalIdentity({
              brandName: data.brandName || "",
              botName: data.botName || "",
              logoUrl: data.logoUrl || "",
              clientUpiId: data.clientUpiId || "",
              customInstructions: data.customInstructions || "",
            });
            // Update local storage for backward compatibility during session
            localStorage.setItem("nard_digital_identity", JSON.stringify(data));
            window.dispatchEvent(new Event("nard_digital_identity_updated"));
          } else {
            // Load local storage if no firestore document
            try {
              const saved = localStorage.getItem("nard_digital_identity");
              if (saved) setDigitalIdentity(JSON.parse(saved));
            } catch(e){}
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}/digitalIdentities/main`);
        }
      } else {
        // Fallback to local storage if not logged in
        try {
          const saved = localStorage.getItem("nard_digital_identity");
          if (saved) {
            setDigitalIdentity(JSON.parse(saved));
          }
        } catch (e) {}
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error("Authentication error", error);
        alert(`Login Error: ${error.message || error}`);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error", error);
    }
  };

  const handleSaveDigitalIdentity = async () => {
    setIsSavingIdentity(true);
    
    // Always save to localStorage first for backward compatibility
    try {
      localStorage.setItem(
        "nard_digital_identity",
        JSON.stringify(digitalIdentity),
      );
      window.dispatchEvent(new Event("nard_digital_identity_updated"));
    } catch (e) {}

    // Save to Firestore if user logged in
    if (currentUser) {
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'digitalIdentities', 'main');
        await setDoc(docRef, {
          userId: currentUser.uid,
          brandName: digitalIdentity.brandName,
          botName: digitalIdentity.botName,
          customInstructions: digitalIdentity.customInstructions,
          clientUpiId: digitalIdentity.clientUpiId,
          logoUrl: digitalIdentity.logoUrl,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}/digitalIdentities/main`);
      }
    }
    
    setTimeout(() => {
      setIsSavingIdentity(false);
      setShowIdentitySaved(true);
      setTimeout(() => setShowIdentitySaved(false), 3000);
    }, 800);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDigitalIdentity((prev) => ({
          ...prev,
          logoUrl: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const salesData = [
    { name: "Mon", value: 4000 },
    { name: "Tue", value: 3000 },
    { name: "Wed", value: 5000 },
    { name: "Thu", value: 2780 },
    { name: "Fri", value: 6890 },
    { name: "Sat", value: 8390 },
    { name: "Sun", value: 4490 },
  ];

  return (
    <>
      <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto mt-8 mb-32 px-2">
        <AnimatePresence mode="wait">
          {activeTab === "business" ? (
            <motion.div
              key="business"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6 w-full"
            >
              {/* Analytics Section */}
              <div className="relative group">
                <div
                  className={`bg-gray-900/60 border border-gray-800/80 backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden transition-all duration-500 rounded-[24px] rounded-tl-[88px] ${!hasAccess ? "blur-md opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-teal-950/50 border border-teal-500/20 flex items-center justify-center">
                        <Activity className="text-teal-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-white">
                          {uiLang === "hi" ? "वीकली सेल्स" : "Weekly Sales"}
                        </h2>
                        <p className="text-gray-400 text-xs font-mono">
                          {uiLang === "hi"
                            ? "लाइव सिंक डेटा"
                            : "Live Synced Data"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-white flex items-center gap-1 justify-end">
                        <IndianRupee size={20} className="text-teal-400" />
                        <span>34,550</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-medium">
                        +15.2% this week
                      </div>
                    </div>
                  </div>

                  <div className="h-64 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesData}>
                        <XAxis
                          dataKey="name"
                          stroke="#52525b"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#52525b"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => `₹${val / 1000}k`}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                          contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #27272a",
                            borderRadius: "12px",
                          }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {salesData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                index === salesData.length - 1
                                  ? "#2dd4bf"
                                  : "#3f3f46"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {!hasAccess && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="bg-gray-900/90 border border-gray-700/50 backdrop-blur-md px-6 py-4 rounded-3xl flex flex-col items-center justify-center gap-2 shadow-2xl">
                      <Lock className="text-indigo-400 mb-2" size={32} />
                      <h3 className="text-white font-bold text-lg">
                        {uiLang === "hi"
                          ? "एनालिटिक्स लॉक्ड"
                          : "Analytics Locked"}
                      </h3>
                      <p className="text-gray-400 text-xs text-center max-w-xs">
                        {uiLang === "hi"
                          ? "लाइव इनसाइट्स देखने के लिए अल्ट्रा प्लान में अपग्रेड करें।"
                          : "Upgrade to the Ultra plan to view live insights."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Nard Sync Widget */}
              <div className="bg-gray-900/60 border border-gray-800/80 backdrop-blur-xl p-6 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[24px] rounded-tl-[88px]">
                <div className="flex items-center gap-4 relative z-10 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-full bg-sky-950/50 border border-sky-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(14,165,233,0.3)] shrink-0">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {uiLang === "hi" ? "नार्ड सिंक" : "Nard Sync"}
                    </h3>
                    <p className="text-sky-400 text-xs font-medium">
                      {uiLang === "hi"
                        ? "SMS लिसनर एक्टिव"
                        : "SMS Listener Active"}
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right relative z-10 w-full sm:w-auto">
                  <p className="text-gray-400 text-xs">
                    {uiLang === "hi" ? "अंतिम सिंक" : "Last sync"}
                  </p>
                  <p className="text-white font-mono text-sm">
                    {uiLang === "hi" ? "अभी" : "Just now"}
                  </p>
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-sky-500/5 blur-[50px] -z-10 rounded-full"></div>
              </div>

              {/* Subscription / Paywall Section */}
              {!hasAccess ? (
                <div
                  id="tour-paywall"
                  className="bg-gradient-to-br from-indigo-950/50 to-gray-900 border border-indigo-500/30 backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden rounded-[24px] rounded-tl-[88px]"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none rounded-full" />

                  <div className="flex flex-col md:flex-row gap-8 items-center justify-between relative z-10">
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex flex-wrap gap-2 mb-2 items-center">
                        {overrideShowPlans && (
                          <button
                            onClick={() => setOverrideShowPlans(false)}
                            className="mr-2 px-3 py-2 rounded-xl bg-gray-900/50 border border-gray-700 text-gray-400 hover:text-white transition-colors"
                          >
                            {uiLang === "hi" ? "वापस जाएं" : "Back"}
                          </button>
                        )}
                        {config.plans.map((plan) => (
                          <button
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan.id as any)}
                            className={`px-4 py-2 rounded-2xl font-bold transition-all border ${selectedPlan === plan.id ? `${plan.border} ${plan.bg} ${plan.color}` : "border-gray-800 bg-gray-950/50 text-gray-500 hover:border-gray-600 hover:text-gray-300"}`}
                          >
                            {uiLang === "hi" ? plan.nameHi : plan.name}
                          </button>
                        ))}
                      </div>
                      <h2 className="text-3xl font-black text-white leading-tight">
                        {uiLang === "hi"
                          ? "व्यापार को ऑटोपायलट पर डालें"
                          : "Put your business on Autopilot"}
                      </h2>
                      <ul className="flex flex-col gap-3 mt-2">
                        {[
                          uiLang === "hi"
                            ? `रीयल-टाइम वॉयस अलर्ट्स (${currentPlan.name})`
                            : `Real-time Voice Alerts (${currentPlan.name})`,
                          uiLang === "hi"
                            ? "ई-मैत्री एक्सक्लूसिव जिंगल"
                            : "E-Maitri Exclusive Jingle",
                          uiLang === "hi"
                            ? "अनलिमिटेड एसएमएस सिंक"
                            : "Unlimited SMS Sync",
                        ].map((feature, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-gray-300"
                          >
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${currentPlan.bg}`}
                            >
                              <ShieldCheck
                                size={12}
                                className={currentPlan.color}
                              />
                            </div>
                            <span className="text-sm font-medium">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-gray-950 p-6 rounded-3xl border border-gray-800 flex flex-col items-center justify-center gap-4 min-w-[240px]">
                      <div className="text-center w-full mb-2">
                        <p className="text-white font-bold text-3xl">
                          ₹{currentPlan.price}
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                          {uiLang === "hi" ? "प्रति वर्ष" : "per year"}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if ("speechSynthesis" in window) {
                            window.speechSynthesis.cancel();
                            const msg = new SpeechSynthesisUtterance(
                              uiLang === "hi"
                                ? "पुष्टि हो रही है..."
                                : "Verifying..."
                            );
                            msg.lang = uiLang === "hi" ? "hi-IN" : "en-US";
                            msg.volume = 0; // Play silently just to unlock the audio context for the actual success message later
                            window.speechSynthesis.speak(msg);
                          }
                          const a = document.createElement("a");
                          a.href = generatedUpiUrl;
                          a.click();
                          setSubscriptionStatus("verifying");
                        }}
                        className={`w-full py-4 text-white font-bold rounded-xl transition-colors shadow-[0_0_20px_rgba(16,185,129,0.4)] bg-emerald-600 hover:bg-emerald-500 text-lg`}
                      >
                        {uiLang === "hi"
                          ? "प्लान खरीदें (UPI)"
                          : "Buy Plan (UPI)"}
                      </button>
                      {!isTrialActive && (
                        <button
                          onClick={() => {
                            if (onStartFreeTrial) {
                              onStartFreeTrial(selectedPlan);
                            } else {
                              setSubscriptionStatus("active");
                            }
                          }}
                          className="w-full py-3 bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl border border-emerald-500/50 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center gap-2"
                        >
                          <Zap size={18} />
                          {uiLang === "hi"
                            ? "फ्री ट्रायल शुरू करें"
                            : "Start Free Trial"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  id="tour-paywall"
                  className="bg-gradient-to-br from-emerald-950/30 to-gray-900 border border-emerald-500/30 backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 rounded-[24px] rounded-tl-[88px]"
                >
                  <div className="flex flex-col gap-4 flex-1 w-full relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-emerald-500/50 bg-emerald-900/30 shrink-0">
                        <CheckCircle2 size={32} className="text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs mb-1">
                          {uiLang === "hi" ? "बधाई हो! आपका प्लान एक्टिव है" : "Congratulations! Your plan is active"}
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-white">
                          {uiLang === "hi"
                            ? `नार्ड ${currentPlan.nameHi}`
                            : `Nard ${currentPlan.name}`}
                        </h3>
                      </div>
                    </div>
                    
                    <div className="mt-2 p-4 rounded-xl bg-gray-950/80 border border-gray-800 flex flex-col gap-3">
                      <div className="text-sm font-semibold text-gray-400">
                        {uiLang === "hi" ? "आपका कस्टम डोमेन" : "Your Custom Domain"}
                      </div>
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                        <div className="px-4 py-3 bg-gray-900 rounded-lg font-mono text-emerald-400 break-all border border-emerald-900/30 w-full sm:w-auto flex-1">
                          {`https://${(digitalIdentity.brandName || "my-ai-bot").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || "my-ai-bot"}.nard.ai`}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto shrink-0">
                          <button
                            onClick={() => {
                              const url = `https://${(digitalIdentity.brandName || "my-ai-bot").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || "my-ai-bot"}.nard.ai`;
                              navigator.clipboard.writeText(url);
                            }}
                            className="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg text-white transition-colors flex-1 flex justify-center items-center"
                            title={uiLang === "hi" ? "कॉपी करें" : "Copy"}
                          >
                            <Copy size={20} />
                          </button>
                          <button
                            onClick={() => {
                              const url = `https://${(digitalIdentity.brandName || "my-ai-bot").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || "my-ai-bot"}.nard.ai`;
                              if (navigator.share) {
                                navigator.share({
                                  title: digitalIdentity.brandName || "Nard AI",
                                  text: uiLang === "hi" ? "यह मेरा नया AI स्टोर है!" : "Check out my new AI store!",
                                  url: url
                                });
                              } else {
                                navigator.clipboard.writeText(url);
                              }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-lg text-white transition-colors flex-1 flex justify-center items-center"
                            title={uiLang === "hi" ? "शेयर करें" : "Share"}
                          >
                            <Share2 size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col gap-3 w-full md:w-auto relative z-10 shrink-0">
                    <button
                      onClick={() => setOverrideShowPlans(true)}
                      className="px-6 py-3 bg-gray-950/80 hover:bg-gray-900 text-white font-bold rounded-xl transition-colors border border-gray-800 flex-1"
                    >
                      {uiLang === "hi" ? "प्लान बदलें" : "Change Plan"}
                    </button>
                    <button
                      onClick={() => {
                        if (onCancelAccess) {
                          onCancelAccess();
                        } else {
                          setSubscriptionStatus("inactive");
                        }
                      }}
                      className="px-6 py-3 bg-red-950/40 hover:bg-red-900/40 text-red-400 font-bold rounded-xl transition-colors border border-red-900/50 flex-1"
                    >
                      {uiLang === "hi" ? "कैंसिल करें" : "Cancel"}
                    </button>
                  </div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] pointer-events-none rounded-full" />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="store"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6 w-full"
            >
              {/* Brand & AI Settings (Digital Identity) Section */}
              <div
                className={`bg-gray-900/60 border border-gray-800/80 backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden transition-all duration-500 rounded-[24px] rounded-tl-[88px]`}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">
                      {uiLang === "hi"
                        ? "अपनी डिजिटल पहचान"
                        : "Digital Identity"}
                    </h2>
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                      {uiLang === "hi"
                        ? "ब्रांड और एआई सेटिंग्स"
                        : "Brand & AI Settings"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Branding */}
                  <div className="bg-gray-950/50 p-5 border border-gray-800 rounded-3xl flex flex-col sm:flex-row gap-6 items-start">
                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <label className="text-sm text-gray-400 font-bold mb-1.5 flex items-center gap-2">
                          <Building2 size={16} />
                          {uiLang === "hi"
                            ? "बिजनेस का नाम (Brand Name)"
                            : "Business Name"}
                        </label>
                        <input
                          type="text"
                          value={digitalIdentity.brandName}
                          onChange={(e) =>
                            setDigitalIdentity({
                              ...digitalIdentity,
                              brandName: e.target.value,
                            })
                          }
                          placeholder={
                            uiLang === "hi"
                              ? "जैसे: काशी डेयरी"
                              : "e.g., Kashi Dairy"
                          }
                          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-400 font-bold mb-1.5 flex items-center gap-2">
                          <Bot size={16} />
                          {uiLang === "hi"
                            ? "बॉट का नाम (Bot Name)"
                            : "Bot Name"}
                        </label>
                        <input
                          type="text"
                          value={digitalIdentity.botName || ""}
                          onChange={(e) =>
                            setDigitalIdentity({
                              ...digitalIdentity,
                              botName: e.target.value,
                            })
                          }
                          placeholder={
                            uiLang === "hi"
                              ? "जैसे: मुनीम जी, छोटू"
                              : "e.g., Munim, Chhotu"
                          }
                          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-400 font-bold mb-1.5 flex items-center gap-2">
                          <Wallet size={16} />
                          {uiLang === "hi" ? "आपकी UPI ID" : "Your UPI ID"}
                        </label>
                        <input
                          type="text"
                          value={digitalIdentity.clientUpiId}
                          onChange={(e) =>
                            setDigitalIdentity({
                              ...digitalIdentity,
                              clientUpiId: e.target.value,
                            })
                          }
                          placeholder="name@upi"
                          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col items-center shrink-0 w-full sm:w-auto">
                      <label className="text-sm text-gray-400 font-bold mb-1.5 w-full text-left sm:text-center">
                        {uiLang === "hi" ? "ब्रांड लोगो" : "Brand Logo"}
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleLogoUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-32 h-32 relative bg-gray-900 border-2 border-dashed border-gray-700 hover:border-indigo-500 transition-colors flex items-center justify-center group overflow-hidden rounded-[24px] rounded-tl-[88px]"
                      >
                        {digitalIdentity.logoUrl ? (
                          <img
                            src={digitalIdentity.logoUrl}
                            alt="Logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-gray-500 group-hover:text-indigo-400">
                            <ImageIcon size={28} className="mb-2" />
                            <span className="text-xs font-bold uppercase tracking-widest text-center">
                              Upload
                            </span>
                          </div>
                        )}
                        {digitalIdentity.logoUrl && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold text-white uppercase tracking-widest">
                              {uiLang === "hi" ? "बदलें" : "Change"}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* AI Custom Instructions */}
                  <div className="bg-gray-950/50 p-5 border border-gray-800 rounded-3xl">
                    <label className="text-sm text-gray-400 font-bold mb-2 flex items-center gap-2">
                      <Bot size={16} />
                      {uiLang === "hi"
                        ? "अपने सहायक को निर्देश दें (Custom Instructions)"
                        : "AI Custom Instructions"}
                    </label>
                    <p className="text-xs text-indigo-400/80 mb-3 font-semibold">
                      {uiLang === "hi"
                        ? "System Prompt Sync: यह निर्देश सीधे आपके AI के मस्तिष्क (System Prompt) में डाले जाएँगे।"
                        : "System Prompt Sync: These rules apply to AI brain immediately."}
                    </p>
                    <textarea
                      value={digitalIdentity.customInstructions}
                      onChange={(e) =>
                        setDigitalIdentity({
                          ...digitalIdentity,
                          customInstructions: e.target.value,
                        })
                      }
                      placeholder={
                        uiLang === "hi"
                          ? "जैसे: 'हमेशा सम्मान से बात करें', 'सिर्फ दूध के रेट बताएं', या 'दुकान का पता भी भेजें'"
                          : "e.g., 'Always be polite', 'Only share product rates'"
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-colors min-h-[120px] resize-y custom-scrollbar"
                    />
                  </div>

                  <div className="mt-2 flex flex-col sm:flex-row justify-end items-center gap-4">
                    {!currentUser ? (
                      <div className="flex flex-col items-end gap-2 w-full">
                        <div className="flex items-center gap-3 w-full sm:w-auto p-3 rounded-2xl bg-gray-900 border border-gray-700">
                          <span className="text-xs text-gray-400 font-semibold px-2">
                            {uiLang === "hi" ? "क्लाउड सिंक के लिए:" : "For cloud sync:"}
                          </span>
                          <button
                            onClick={handleSignIn}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors shrink-0"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Sign In
                          </button>
                        </div>
                        {window.self !== window.top && (
                          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 text-sm text-yellow-300 w-full text-left mt-2 shadow-lg leading-relaxed">
                            <p className="font-bold mb-2 text-base text-yellow-400">लॉगिन करने के लिए ध्यान दें:</p>
                            <p className="mb-4 opacity-90">
                              यहाँ इस छोटी स्क्रीन में गूगल सुरक्षा कारणों से लॉगिन को रोक देता है। लॉगिन करने के लिए आपको यह ऐप एक नए पेज पर खोलना होगा।
                            </p>
                            <a
                              href={window.location.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-4 rounded-xl w-full text-center block transition-colors shadow-md"
                            >
                              ऐप को नए पेज में खोलने के लिए यहाँ क्लिक करें ↗
                            </a>
                            <p className="mt-3 text-xs opacity-80 text-center">
                              नए पेज में खुलने के बाद, वहां जाकर दोबारा "Sign In" बटन पर क्लिक करें। आपका लॉगिन आसानी से हो जाएगा।
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-gray-900 border border-gray-700 rounded-xl">
                        <div className="flex items-center gap-2 px-2 text-xs sm:text-sm font-semibold text-gray-400">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="truncate max-w-[120px] sm:max-w-xs">{currentUser.email}</span>
                        </div>
                        <button
                          onClick={handleSignOut}
                          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-bold transition-colors border border-gray-700"
                        >
                          {uiLang === "hi" ? "लॉग आउट" : "Sign Out"}
                        </button>
                      </div>
                    )}
                    
                    <button
                      onClick={handleSaveDigitalIdentity}
                      disabled={isSavingIdentity}
                      className={`relative w-full sm:w-auto px-8 py-3.5 rounded-full font-black text-white overflow-hidden transition-all ${isSavingIdentity ? "bg-gray-700 scale-95" : showIdentitySaved ? "bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)]" : "bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.6)]"}`}
                    >
                      {/* Neon Glow element in background */}
                      {!isSavingIdentity && !showIdentitySaved && (
                        <div className="absolute inset-0 bg-green-400/60 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity animate-pulse pointer-events-none" />
                      )}

                      <div className="relative flex items-center justify-center gap-2 z-10">
                        {isSavingIdentity ? (
                          <Loader2
                            size={18}
                            className="animate-spin text-gray-300"
                          />
                        ) : showIdentitySaved ? (
                          <>
                            <Check size={18} />
                            {uiLang === "hi" ? "सुरक्षित किया गया" : "Saved"}
                          </>
                        ) : (
                          <>
                            <Save size={18} />
                            {uiLang === "hi"
                              ? "सेटिंग्स सेव करें"
                              : "Save Settings"}
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Inventory Manager */}
              <InventoryManager
                uiLang={uiLang}
                botName={digitalIdentity.botName}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur-xl border-t border-gray-800 pb-safe">
          <div className="flex items-center justify-around p-2 max-w-md mx-auto">
            <button
              onClick={() => setActiveTab("business")}
              className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === "business" ? "text-teal-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <Activity size={24} className="mb-1" />
              <span className="text-xs font-bold">
                {uiLang === "hi" ? "व्यापार (Business)" : "Business"}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("store")}
              className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === "store" ? "text-sky-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <Store size={24} className="mb-1" />
              <span className="text-xs font-bold">
                {uiLang === "hi" ? "दुकान (Store)" : "Store Setup"}
              </span>
            </button>
          </div>
        </div>


      </div>
    </>
  );
};
