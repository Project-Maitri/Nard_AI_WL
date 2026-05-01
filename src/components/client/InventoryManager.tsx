import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../../utils/firestoreErrorHandler";

export interface InventoryItem {
  id: string;
  name: string;
  price: string | number;
  discountPrice?: string | number;
  offerDetails?: string;
  imageUrl: string;
  inStock: boolean;
}

export const InventoryManager: React.FC<{
  uiLang: string;
  botName?: string;
}> = ({ uiLang, botName }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const recognitionRef = useRef<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid, 'inventory', 'main');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.items && Array.isArray(data.items)) {
              setItems(data.items);
              localStorage.setItem("client_inventory", JSON.stringify(data.items));
            }
          } else {
            // Load local storage if no firestore document
            try {
              const saved = localStorage.getItem("client_inventory");
              if (saved) setItems(JSON.parse(saved));
            } catch(e){}
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}/inventory/main`);
        }
      } else {
        try {
          const saved = localStorage.getItem("client_inventory");
          if (saved) {
            setItems(JSON.parse(saved));
          }
        } catch (e) {}
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Skip saving on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    // Save to localStorage
    localStorage.setItem("client_inventory", JSON.stringify(items));
    
    // Auto-save to Firestore if logged in
    if (currentUser) {
      const syncToFirebase = async () => {
        try {
          const docRef = doc(db, 'users', currentUser.uid, 'inventory', 'main');
          await setDoc(docRef, {
            userId: currentUser.uid,
            items: items,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error syncing inventory to Firebase:", error);
        }
      };
      
      syncToFirebase();
    }
  }, [items, currentUser]);

  useEffect(() => {
    // Initialize SpeechRecognition
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = uiLang === "hi" ? "hi-IN" : "en-US";

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalStr = event.results[i][0].transcript.toLowerCase();
            processVoiceCommand(finalStr);
            currentTranscript += finalStr;
          }
        }
        if (currentTranscript) setTranscription(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        if (isListening) recognition.start();
      };

      recognitionRef.current = recognition;
    }
  }, [uiLang, isListening]);

  const processVoiceCommand = (cmd: string) => {
    // "नार्ड मुनीम" Mode logic
    // price keywords: 'भाव', 'दाम', 'रेट', 'रुपया', 'कीमत', 'price', 'rate'
    // in stock: 'आ गया', 'उपलब्ध', 'स्टॉक में', 'शुरू करो', 'in stock', 'available'
    // out of stock: 'खत्म', 'स्टॉक आउट', 'नहीं है', 'बंद करो', 'out of stock', 'stop'

    let updated = false;
    let newItems = [...items];
    let msg = "";

    // Extract numbers
    const numMatch = cmd.match(/\d+/);
    const parsedNum = numMatch ? parseInt(numMatch[0]) : null;

    newItems.forEach((item, index) => {
      const itemNameLower = item.name.toLowerCase();
      // Only process if the command contains the item name (or a close part of it)
      const isMentioned =
        itemNameLower
          .split(" ")
          .some((word) => word.length > 3 && cmd.includes(word)) ||
        cmd.includes(itemNameLower);

      if (isMentioned) {
        if (
          /(भाव|दाम|रेट|रुपया|कीमत|price|rate)/.test(cmd) &&
          parsedNum !== null
        ) {
          newItems[index].price = parsedNum;
          msg = `${item.name} ${uiLang === "hi" ? "का रेट" : "price updated to"} ${parsedNum} ${uiLang === "hi" ? "सेट कर दिया गया है।" : ""}`;
          updated = true;
        } else if (/(खत्म|स्टॉक आउट|नहीं है|बंद करो|out of stock)/.test(cmd)) {
          newItems[index].inStock = false;
          msg = `${item.name} ${uiLang === "hi" ? "आउट ऑफ स्टॉक (बंद) कर दिया गया है।" : "marked as out of stock."}`;
          updated = true;
        } else if (
          /(आ गया|उपलब्ध|स्टॉक में|शुरू करो|in stock|available)/.test(cmd)
        ) {
          newItems[index].inStock = true;
          msg = `${item.name} ${uiLang === "hi" ? "इन स्टॉक (चालू) कर दिया गया है।" : "marked as available."}`;
          updated = true;
        }
      }
    });

    if (updated) {
      setItems(newItems);
      setFeedbackMsg(msg);
      speakFeedback(msg);
      setTimeout(() => setFeedbackMsg(""), 4000);
    }
  };

  const speakFeedback = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = uiLang === "hi" ? "hi-IN" : "en-US";
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscription("");
      recognitionRef.current?.start();
    }
    setIsListening(!isListening);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        name: "New Product/ Service",
        price: 0,
        discountPrice: "",
        offerDetails: "",
        imageUrl: "",
        inStock: true,
      },
    ]);
  };

  const updateItem = (id: string, field: keyof InventoryItem, value: any) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const deleteItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleImageUpload = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateItem(id, "imageUrl", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full bg-gray-950 p-6 text-gray-200 mt-8 rounded-3xl border border-gray-800 shadow-[0_10px_40px_-10px_rgba(34,197,94,0.15)] relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-[50px] -z-10 rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-sky-500/10 blur-[50px] -z-10 rounded-full"></div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-sky-400 font-mukta flex items-center gap-2">
            {botName || "Nard Munim"}
            <span className="text-sm font-normal text-gray-400 ml-2">
              (Smart Inventory)
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Zero-Effort inventory with voice commands
          </p>
        </div>

        <button
          onClick={toggleListening}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold transition-all shadow-lg text-sm ${
            isListening
              ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
              : "bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20"
          }`}
        >
          {isListening ? (
            <>
              <span className="relative flex h-3 w-3 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-100"></span>
              </span>
              <MicOff size={18} />{" "}
              {uiLang === "hi"
                ? "सुनना बंद करें"
                : `Stop ${botName || "Munim"}`}
            </>
          ) : (
            <>
              <Mic size={18} />{" "}
              {uiLang === "hi"
                ? "वॉइस-टू-स्टॉक (Voice-to-Stock)"
                : "Voice-to-Stock"}
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {(transcription || feedbackMsg) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-6 p-4 rounded-xl border border-sky-500/30 bg-sky-950/40 text-center"
          >
            {feedbackMsg ? (
              <p className="text-green-400 font-bold font-mukta">
                {feedbackMsg}
              </p>
            ) : (
              <p className="text-sky-300 italic">"{transcription}"...</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 border border-gray-800 rounded-br-2xl rounded-tr-2xl rounded-bl-2xl rounded-tl-[88px] overflow-hidden shadow-xl hover:shadow-2xl hover:border-sky-500/30 transition-all duration-300 relative group"
          >
            {/* Live Status Neon Indicator */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => updateItem(item.id, "inStock", !item.inStock)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  item.inStock
                    ? "bg-green-500/10 text-green-400 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                    : "bg-red-500/10 text-red-500 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                }`}
              >
                {item.inStock ? "Available" : "Out of Stock"}
              </button>
            </div>

            {/* Delete button */}
            <button
              onClick={() => deleteItem(item.id)}
              className="absolute bottom-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>

            <div className="h-40 w-full bg-gray-800 relative group-hover:opacity-90 transition-opacity">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                  <ImageIcon size={32} className="mb-2 opacity-50" />
                  <span className="text-xs">No Image</span>
                </div>
              )}

              <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="text-sky-400 mr-2" size={20} />
                <span className="text-sky-300 text-sm font-bold">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(item.id, e)}
                />
              </label>
            </div>

            <div className="p-5">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(item.id, "name", e.target.value)}
                placeholder={
                  uiLang === "hi"
                    ? "नया प्रोडक्ट/ सर्विस"
                    : "New Product/ Service"
                }
                className="w-full bg-transparent border-b border-gray-700/50 focus:border-sky-500 text-lg font-bold text-white outline-none mb-3 pb-1"
              />
              <div className="flex items-center text-sky-400 font-black text-xl mb-3">
                <span className="text-sm mr-1 mt-1 text-gray-500">₹</span>
                <input
                  type="number"
                  value={item.price}
                  onChange={(e) => updateItem(item.id, "price", e.target.value)}
                  className="bg-transparent border-none w-24 outline-none pt-0.5"
                  placeholder="0"
                />
              </div>

              {/* Discount Section */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">
                    {uiLang === "hi"
                      ? "डिस्काउंट रेट (Discount Rate)"
                      : "Discount Rate"}
                  </span>
                  <div className="flex items-center bg-gray-950/50 rounded-lg px-2 py-1 border border-gray-800 focus-within:border-emerald-500/50">
                    <span className="text-xs text-emerald-500 mr-1 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={item.discountPrice || ""}
                      onChange={(e) =>
                        updateItem(item.id, "discountPrice", e.target.value)
                      }
                      className="bg-transparent border-none w-16 outline-none text-emerald-400 text-sm font-bold text-right"
                      placeholder="0"
                    />
                  </div>
                </div>

                {Number(item.price) > 0 &&
                  Number(item.discountPrice) > 0 &&
                  Number(item.price) > Number(item.discountPrice) && (
                    <div className="flex items-center justify-end gap-2 text-[10px] text-gray-400 font-medium bg-emerald-950/20 py-1.5 px-2 rounded-lg border border-emerald-500/10">
                      <span>
                        {uiLang === "hi" ? "बचत (Savings):" : "Savings:"}{" "}
                        <span className="text-emerald-400 font-bold">
                          ₹{Number(item.price) - Number(item.discountPrice)}
                        </span>
                      </span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded ring-1 ring-emerald-500/30 font-bold">
                        {(
                          ((Number(item.price) - Number(item.discountPrice)) /
                            Number(item.price)) *
                          100
                        ).toFixed(1)}
                        % OFF
                      </span>
                    </div>
                  )}
              </div>

              {/* Offer Section */}
              <div className="pt-3 border-t border-gray-800/50 mt-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-gray-400 font-medium">
                    {uiLang === "hi" ? "ऑफर (Offer Details)" : "Offer Details"}
                  </span>
                  <input
                    type="text"
                    value={item.offerDetails || ""}
                    onChange={(e) =>
                      updateItem(item.id, "offerDetails", e.target.value)
                    }
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-lg px-3 py-2 text-sm text-amber-400 font-medium placeholder-gray-600 focus:border-amber-500/50 focus:outline-none transition-colors"
                    placeholder={
                      uiLang === "hi"
                        ? "जैसे: Buy 1 Get 1 Free"
                        : "e.g. Buy 1 Get 1 Free"
                    }
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        <div
          onClick={addItem}
          className="bg-gray-900 border-2 border-dashed border-gray-700 hover:border-sky-500 rounded-br-2xl rounded-tr-2xl rounded-bl-2xl rounded-tl-[88px] flex flex-col items-center justify-center h-[280px] cursor-pointer text-gray-500 hover:text-sky-400 transition-all group"
        >
          <div className="w-16 h-16 rounded-full bg-gray-800 group-hover:bg-sky-900/40 flex items-center justify-center mb-4 transition-colors">
            <Plus size={24} />
          </div>
          <span className="font-bold">Add New Item</span>
        </div>
      </div>
    </div>
  );
};
