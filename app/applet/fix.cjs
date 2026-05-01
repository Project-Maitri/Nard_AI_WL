import fs from "fs";

let content = fs.readFileSync("src/App.tsx", "utf-8");

const target = `                {/* Pulsing blue outer indicator */}
                <div className="absolute -inset-[5px] rounded-full border-[3px] border-blue-400 animate-      </div>
    </div>
  );
}lue);
                         }}
                       >`;

const replacement = `                {/* Pulsing blue outer indicator */}
                <div className="absolute -inset-[5px] rounded-full border-[3px] border-blue-400 animate-pulse pointer-events-none shadow-[0_0_15px_rgba(56,189,248,0.8)] -z-10"></div>

                <div className="absolute inset-0 pointer-events-none rounded-full" style={{ backgroundColor: '#000000', opacity: 1 }}></div>
                
                {/* CSS Waves Animation */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
                  <div className="absolute w-[250%] h-[250%] rounded-[45%] animate-spin z-0" 
                       style={{ top: '65%', left: '-75%', animationDuration: '8s', backgroundColor: '#38bdf8', opacity: 0.45 }}></div>
                  <div className="absolute w-[250%] h-[250%] rounded-[40%] animate-spin z-0 inline-block" 
                       style={{ top: '70%', left: '-75%', animationDuration: '6s', animationDirection: 'reverse', backgroundColor: '#0ea5e9', opacity: 0.6 }}></div>
                  <div className="absolute w-[250%] h-[250%] rounded-[43%] animate-spin z-0" 
                       style={{ top: '75%', left: '-75%', animationDuration: '7s', backgroundColor: '#0284c7', opacity: 0.75 }}></div>
                  
                  {/* Inner shadow for spherical feel */}
                  <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)] z-10"></div>
                </div>
                
                <span className="font-black text-xs sm:text-sm z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wide group-hover:-translate-y-0.5 transition-transform text-center px-1 leading-tight select-none text-sky-300">{uiLang === 'hi' ? 'नॉर्ड' : (uiLang === 'bho' ? 'नॉर्ड' : 'Nard')}</span>
                
                {/* Live ping animation effect */}
                <span className="absolute -top-1 -right-1 flex h-6 w-6 z-20">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-sky-400"></span>
                  <span className="relative inline-flex rounded-full h-6 w-6 items-center justify-center shadow-md border border-gray-900 bg-sky-500">
                    <Mic size={12} className="text-white" />
                  </span>
                </span>
              </motion.button>
        )}
      </AnimatePresence>

      {/* Get Custom Nard Now Floating Button */}
      <AnimatePresence>
        {showLandingPage && (
          <motion.button
            initial={getSnapCoords(nardNowPos)}
            drag
            dragMomentum={false}
            animate={nardNowControls}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onDragStart={() => setIsNardNowDragging(true)}
            onDragEnd={(e, info) => {
              setTimeout(() => setIsNardNowDragging(false), 50);
              const px = info.point.x;
              const py = info.point.y;
              
              const vw = windowSize.width;
              const vh = windowSize.height;

              const isLeft = px < vw / 2;
              const isTop = py < vh / 3;
              const isBottom = py > (vh * 2) / 3;

              let newPos: 'tl'|'tr'|'ml'|'mr'|'bl'|'br' = 'bl';
              if (isTop) newPos = isLeft ? 'tl' : 'tr';
              else if (isBottom) newPos = isLeft ? 'bl' : 'br';
              else newPos = isLeft ? 'ml' : 'mr';

              if (newPos === nardNowPos) {
                nardNowControls.start(getSnapCoords(newPos));
              } else {
                setNardNowPos(newPos);
              }
            }}
            onClick={() => {
              if (isNardNowDragging) return;
              document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="fixed top-0 left-0 z-[1000] flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl group border border-white/20"
            style={{ boxShadow: \`0 10px 25px -5px \${brandTheme.hex}80\`, touchAction: "none" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* Pulsing outer indicator */}
            <div className="absolute -inset-[5px] rounded-full border-[3px] animate-pulse pointer-events-none -z-10" style={{ borderColor: brandTheme.hex, boxShadow: \`0 0 15px \${brandTheme.hex}80\` }}></div>

            <div className="absolute inset-0 pointer-events-none rounded-full" style={{ backgroundColor: '#000000', opacity: 1 }}></div>
            
            {/* CSS Waves Animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
              <div className="absolute w-[250%] h-[250%] rounded-[45%] animate-spin z-0" 
                   style={{ top: '65%', left: '-75%', animationDuration: '8s', backgroundColor: brandTheme.hex, opacity: 0.45 }}></div>
              <div className="absolute w-[250%] h-[250%] rounded-[40%] animate-spin z-0 inline-block" 
                   style={{ top: '70%', left: '-75%', animationDuration: '6s', animationDirection: 'reverse', backgroundColor: brandTheme.hex, opacity: 0.6 }}></div>
              <div className="absolute w-[250%] h-[250%] rounded-[43%] animate-spin z-0" 
                   style={{ top: '75%', left: '-75%', animationDuration: '7s', backgroundColor: brandTheme.hex, opacity: 0.75 }}></div>
              
              {/* Inner shadow for spherical feel */}
              <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)] z-10"></div>
            </div>
            
            <div className="z-10 flex flex-col items-center justify-center mt-1">
               <Rocket size={24} className="text-white drop-shadow-md group-hover:-translate-y-1 transition-transform" />
            </div>
            
            {/* Live ping animation effect */}
            <span className="absolute -top-1 -right-1 flex h-6 w-6 z-20">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: brandTheme.hex }}></span>
              <span className="relative inline-flex rounded-full h-6 w-6 items-center justify-center shadow-md border border-gray-900" style={{ backgroundColor: brandTheme.hex }}>
                <Sparkles size={12} className="text-white" />
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Virtual AI Background */}
      <VirtualNetworkBackground />

      {/* Inner App Container */}
      <div className="flex flex-col h-full w-full bg-transparent font-mukta text-gray-200 overflow-hidden relative">
        {/* Header */}
        {!isLive && (
          <header className="text-gray-200 p-2 pt-3 sm:pt-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex flex-col items-center justify-center mr-1">
                <button 
                  onClick={() => {
                    stopMessageAudio();
                    if (isVoiceTyping) stopVoiceRecognition();
                    setShowLandingPage(true);
                    setIsLive(false);
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 hover:bg-gray-700/80 transition-colors border border-gray-700/50 shadow-sm"
                  aria-label="Back to Landing Page"
                >
                  <ArrowLeft size={22} style={{ color: selectedRole?.hex || brandTheme.hex }} />
                </button>
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl sm:text-3xl font-mukta font-bold tracking-wider drop-shadow-sm leading-none" style={{ color: selectedRole?.hex || brandTheme.hex }}>Your Identity</h1>
              </div>
              
              {currentChatId && (
                <div className="flex flex-col justify-center overflow-hidden border-l border-gray-200 pl-2">
                  <span className="text-[8px] text-sky-600 uppercase tracking-widest font-bold opacity-70 leading-none">{t.chattingIn}</span>
                  <span className="text-xs font-medium text-gray-900 truncate max-w-[80px] sm:max-w-[150px] leading-tight">
                    {savedChats.find(c => c.id === currentChatId)?.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 relative" ref={moreMenuRef}>
              <button 
                onClick={handleNewChat}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 shadow-md transition-all"
                title={t.newChat}
              >
                <MessageSquare size={18} />
              </button>

              <button 
                onClick={() => {
                  if (showSettings) {
                    setShowSettings(false);
                  } else {
                    setShowMoreMenu(!showMoreMenu);
                  }
                }}
                className={\`flex items-center justify-center w-9 h-9 rounded-full transition-all \${showMoreMenu ? 'bg-sky-900/50 text-sky-400 border-sky-600' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 shadow-md'} border\`}
                title={t.moreOptions}
              >
                <Menu size={18} />
              </button>

              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                  >
                    <div className="p-1.5 flex flex-col gap-1">
                      <button 
                        onClick={() => {
                          setIsHistoryOpen(true);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-gray-800 shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400 group-hover:bg-sky-800 transition-colors">
                          <MessageSquare size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">{t.chatHistory}</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          handleAppShare();
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-gray-800 shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-emerald-900/40 rounded-lg text-emerald-400 group-hover:bg-emerald-800 transition-colors">
                          <Share2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">{t.share}</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setShowSettings(!showSettings);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-gray-800 shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-amber-900/40 rounded-lg text-amber-400 group-hover:bg-amber-800 transition-colors">
                          <Settings2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">{t.settings}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>
        )}

          {/* Error Toast */}
          <AnimatePresence>

          </AnimatePresence>

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden z-0"
              >
                <div className="p-4 max-w-3xl mx-auto grid grid-cols-1 gap-4 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {/* User Name Setting */}
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-900/40 rounded-lg text-indigo-400">
                        <User size={20} />
                      </div>
                      <div>
                        <h3 className="text-gray-200 font-medium">{t.userNameLabel}</h3>
                        <p className="text-gray-400 text-xs">{t.userNamePlaceholder}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {isEditingBotName ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder={t.userNamePlaceholder}
                            className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors flex-1 sm:w-48"
                            autoFocus
                            onBlur={() => setIsEditingBotName(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setIsEditingBotName(false);
                            }}
                          />
                          <button 
                            onClick={() => setIsEditingBotName(false)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Save"
                          >
                            <Check size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end bg-gray-900/60 px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors group">
                          <span className="text-gray-200 font-medium truncate max-w-[150px]">
                            {userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard')}
                          </span>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setIsEditingBotName(true)}
                              className="p-1.5 text-sky-400 hover:bg-sky-900/40 rounded-md transition-colors"
                              title="Edit Name"
                            >
                              <Edit2 size={16} />
                            </button>
                            {userName && (
                              <button 
                                onClick={() => setUserName('')}
                                className="p-1.5 text-red-400 hover:bg-red-900/40 rounded-md transition-colors"
                                title="Delete/Reset Name"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="text-gray-200 font-medium">{t.language}</h3>
                        <p className="text-gray-400 text-xs">{t.chooseLanguage}</p>
                      </div>
                    </div>
                    <select
                      value={uiLang}
                      onChange={(e) => setUiLang(e.target.value)}
                      className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors"
                    >
                      <option className="bg-gray-900" value="en">English</option>
                      <option className="bg-gray-900" value="hi">हिन्दी (Hindi)</option>
                      <option className="bg-gray-900" value="bho">भोजपुरी (Bhojpuri)</option>
                      <option className="bg-gray-900" value="bn">বাংলা (Bengali)</option>
                      <option className="bg-gray-900" value="ta">தமிழ் (Tamil)</option>
                      <option className="bg-gray-900" value="te">తెలుగు (Telugu)</option>
                      <option className="bg-gray-900" value="mr">मराठी (Marathi)</option>
                      <option className="bg-gray-900" value="gu">ગુજરાતી (Gujarati)</option>
                      <option className="bg-gray-900" value="kn">ಕನ್ನಡ (Kannada)</option>
                      <option className="bg-gray-900" value="ml">മലയാളം (Malayalam)</option>
                      <option className="bg-gray-900" value="or">ଓଡ଼ିଆ (Odia)</option>
                      <option className="bg-gray-900" value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                      <option className="bg-gray-900" value="as">অসমীয়া (Assamese)</option>
                      <option className="bg-gray-900" value="ur">اردو (Urdu)</option>
                      <option className="bg-gray-900" value="ne">नेपाली (Nepali)</option>
                      <option className="bg-gray-900" value="mai">मैथिली (Maithili)</option>
                      <option className="bg-gray-900" value="sd">سنڌي (Sindhi)</option>
                      <option className="bg-gray-900" value="kok">कोंकणी (Konkani)</option>
                      <option className="bg-gray-900" value="doi">डोगरी (Dogri)</option>
                      <option className="bg-gray-900" value="ks">کأشُر (Kashmiri)</option>
                      <option className="bg-gray-900" value="sa">संस्कृतम् (Sanskrit)</option>
                      <option className="bg-gray-900" value="sat">ᱥᱟᱱᱛᱟᱲᱤ (Santali)</option>
                      <option className="bg-gray-900" value="brx">बर' (Bodo)</option>
                      <option className="bg-gray-900" value="mni">মৈতৈ (Manipuri)</option>
                    </select>
                  </div>
                  
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                          <Users size={16} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{t.premium} Voice</h3>
                          <p className="text-gray-400 text-xs">{t.selectPremiumVoice}</p>
                        </div>
                      </div>
                      <select 
                        className="w-full bg-gray-900 shadow-md border border-gray-700 rounded-lg p-2 text-gray-200 outline-none focus:ring-2 focus:ring-sky-500"
                        value={premiumVoice}
                        onChange={(e) => {
                          setPremiumVoice(e.target.value);
                          safeStorage.setItem('premiumVoice', e.target.value);
                        }}
                      >
`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync("src/App.tsx", content);
  console.log("Success! File replaced.");
} else {
  console.log("Target not found!");
}
