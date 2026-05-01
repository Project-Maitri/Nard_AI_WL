const fs = require("fs");

let content = fs.readFileSync(
  "src/components/client/ClientDashboard.tsx",
  "utf-8",
);

// The replacement logic.
const newReturnHTML = `
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
                  className={\`bg-gray-900/60 border border-gray-800/80 backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden transition-all duration-500 \${!hasAccess ? "blur-md opacity-50 pointer-events-none" : ""}\`}
                  style={{ borderRadius: "88px 24px 24px 24px" }}
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
                          {uiLang === "hi" ? "लाइव सिंक डेटा" : "Live Synced Data"}
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
                          tickFormatter={(val) => \`₹\${val / 1000}k\`}
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
                              key={\`cell-\${index}\`}
                              fill={
                                index === salesData.length - 1 ? "#2dd4bf" : "#3f3f46"
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
                        {uiLang === "hi" ? "एनालिटिक्स लॉक्ड" : "Analytics Locked"}
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
              <div
                className="bg-gray-900/60 border border-gray-800/80 backdrop-blur-xl p-6 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4"
                style={{ borderRadius: "88px 24px 24px 24px" }}
              >
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
                      {uiLang === "hi" ? "SMS लिसनर एक्टिव" : "SMS Listener Active"}
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

              REPLACE_SUBSCRIPTION

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
              REPLACE_BRANDING

              {/* Inventory Manager */}
              <InventoryManager uiLang={uiLang} />
            </motion.div>
          )}
        </AnimatePresence>

        REPLACE_VERIFICATION
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-[10005] bg-gray-950/90 backdrop-blur-xl border-t border-gray-800 pb-4 pt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-around p-2 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab("business")}
            className={\`flex flex-col items-center p-3 w-full transition-colors \${activeTab === "business" ? "text-teal-400" : "text-gray-500 hover:text-gray-300"}\`}
          >
            <Activity size={24} className="mb-1" />
            <span className="text-xs font-bold">{uiLang === "hi" ? "व्यापार (Business)" : "Business Monitor"}</span>
          </button>
          <button
            onClick={() => setActiveTab("store")}
            className={\`flex flex-col items-center p-3 w-full transition-colors \${activeTab === "store" ? "text-sky-400" : "text-gray-500 hover:text-gray-300"}\`}
          >
            <Store size={24} className="mb-1" />
            <span className="text-xs font-bold">{uiLang === "hi" ? "दुकान (Store)" : "Store Setup"}</span>
          </button>
        </div>
      </div>
    </>
  );
};
`;

// Extract parts from current content
const subscriptionMatch = content.match(
  /{[\s\S]*?\/\*\s*Subscription\s*\/\s*Paywall\s*Section\s*\*\/[\s\S]*?{!hasAccess \? \([\s\S]*?id="tour-paywall"[\s\S]*?<\/div>\s*<\/div>\s*\)\s*:\s*\([\s\S]*?id="tour-paywall"[\s\S]*?<\/div>\s*<\/div>\s*\)}/,
);

let sub = subscriptionMatch ? subscriptionMatch[0] : "";
sub = sub.replace(
  /borderRadius:\s*"[^"]+"/g,
  'borderRadius: "88px 24px 24px 24px"',
);

const brandingRegex =
  /{\/\*\s*Brand \& AI Settings \(Digital Identity\) Section\s*\*\/}[\s\S]*?{\/\*\s*Neon Glow element in background\s*\*\/}[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/div>/;
const brandingMatch = content.match(brandingRegex);
let brandingSegment = brandingMatch ? brandingMatch[0] : "";
brandingSegment = brandingSegment.replace(
  /borderRadius:\s*"[^"]+"/g,
  'borderRadius: "88px 24px 24px 24px"',
);

const verRegex =
  /{\/\*\s*Verification Overlay\s*\*\/}[\s\S]*?<\/AnimatePresence>/;
const verMatch = content.match(verRegex);
const verSegment = verMatch ? verMatch[0] : "";

let finalReturn = newReturnHTML
  .replace("REPLACE_SUBSCRIPTION", sub)
  .replace("REPLACE_BRANDING", brandingSegment)
  .replace("REPLACE_VERIFICATION", verSegment);

content = content.replace(/return \([\s\S]*?\}\s*;\s*$/, finalReturn);

fs.writeFileSync("src/components/client/ClientDashboard.tsx", content, "utf-8");
