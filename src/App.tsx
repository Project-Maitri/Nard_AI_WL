import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  User as FirebaseAuthUser,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  signInWithPopup,
  FacebookAuthProvider,
  ConfirmationResult
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { fetchUserData, syncUserData, fetchUserChats, syncUserChats } from './utils/firebaseSync';
import { FirebaseSync } from './components/FirebaseSync';
import { QRCodeSVG } from "qrcode.react";
import {
  GoogleGenAI,
  ThinkingLevel,
  LiveServerMessage,
  Modality,
} from "@google/genai";
import {
  Send,
  ArrowUp,
  ArrowLeft,
  Mic,
  MicOff,
  Volume2,
  Square,
  VolumeX,
  BrainCircuit,
  Zap,
  MessageSquare,
  Info,
  Loader2,
  Users,
  Settings2,
  Play,
  Pause,
  Copy,
  Check,
  Globe,
  Share2,
  AudioLines,
  X,
  Bookmark,
  Pin,
  Edit2,
  Trash2,
  MoreVertical,
  Menu,
  MonitorUp,
  MonitorOff,
  Image as ImageIcon,
  Plus,
  Bot,
  Sparkles,
  Flame,
  User,
  Bluetooth,
  Captions,
  MousePointer2,
  Radio,
  UploadCloud,
  Rocket,
  DownloadCloud,
  Palette,
  Shield,
  LineChart,
  Activity,
  BarChart,
  MessageCircle,
  Briefcase,
  CreditCard,
  ShieldAlert,
  Database,
  HeartHandshake,
  Sun,
  Moon,
  CheckCircle2,
  BarChart3,
  UserCircle2,
  Phone,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  useAnimation,
} from "motion/react";
import html2canvas from "html2canvas";

// Global error suppression for Google/SDK errors to prevent platform toasts
// We define this at the top level to catch errors as early as possible
let globalSetError: ((msg: string | null) => void) | null = null;

const isSuppressedError = (msg: string) => {
  const lowerMsg = String(msg).toLowerCase();
  return (
    lowerMsg.includes("quota") ||
    lowerMsg.includes("429") ||
    lowerMsg.includes("503") ||
    lowerMsg.includes("service unavailable") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("limit") ||
    lowerMsg.includes("exceeded") ||
    lowerMsg.includes("safety") ||
    lowerMsg.includes("blocked") ||
    lowerMsg.includes("gemini") ||
    lowerMsg.includes("google") ||
    lowerMsg.includes("model output error") ||
    lowerMsg.includes("token limit") ||
    lowerMsg.includes("traffic") ||
    lowerMsg.includes("busy") ||
    lowerMsg.includes("ethereum")
  );
};

const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args
    .map((arg) => {
      try {
        if (arg instanceof Error) return arg.message;
        return typeof arg === "string" ? arg : JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  if (isSuppressedError(msg)) {
    if (globalSetError && !msg.includes("ethereum"))
      globalSetError("Traffic limit exceeded. Please try again later.");
    return; // Suppress the actual console output
  }
  originalConsoleError.apply(console, args);
};

const originalOnError = window.onerror;
window.onerror = (msg, url, line, col, error) => {
  const errorMsg = String(msg);
  if (isSuppressedError(errorMsg)) {
    if (globalSetError && !errorMsg.includes("ethereum"))
      globalSetError("Traffic limit exceeded. Please try again later.");
    return true; // Suppress
  }
  if (originalOnError) {
    return originalOnError(msg, url, line, col, error);
  }
  return false;
};

window.addEventListener(
  "unhandledrejection",
  (event) => {
    const reason = event.reason?.message || String(event.reason);
    if (isSuppressedError(reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (globalSetError && !reason.includes("ethereum"))
        globalSetError("Traffic limit exceeded. Please try again later.");
    }
  },
  true,
);

window.addEventListener(
  "error",
  (event) => {
    if (isSuppressedError(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (globalSetError && !event.message.includes("ethereum"))
        globalSetError("Traffic limit exceeded. Please try again later.");
    }
  },
  true,
);

// Helper to convert raw PCM16 base64 to WAV base64
const createWavFromPcmBase64 = (
  base64Pcm: string,
  sampleRate: number = 24000,
): string => {
  try {
    const binaryString = atob(base64Pcm);
    const pcmLength = binaryString.length;
    const wavLength = 44 + pcmLength;
    const buffer = new ArrayBuffer(wavLength);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + pcmLength, true); // ChunkSize
    writeString(view, 8, "WAVE");

    // fmt sub-chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 channel)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, "data");
    view.setUint32(40, pcmLength, true);

    // Write PCM data
    const pcmData = new Uint8Array(buffer, 44);
    for (let i = 0; i < pcmLength; i++) {
      pcmData[i] = binaryString.charCodeAt(i);
    }

    // Convert back to base64 safely
    let wavBinaryString = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32768
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      // Use Array.from to convert Uint8Array to regular array for apply
      wavBinaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(wavBinaryString);
  } catch (e) {
    console.warn("Error converting PCM to WAV:", e);
    return base64Pcm; // Fallback
  }
};

// Initialize Gemini API safely
let ai: any = null;
const initAI = (key: string | null) => {
  if (key && key !== "undefined" && key.trim() !== "") {
    try {
      ai = new GoogleGenAI({ apiKey: key });
      console.log("Gemini API initialized successfully.");
    } catch (e) {
      console.error("Failed to initialize Gemini API:", e);
      ai = null;
    }
  } else {
    ai = null;
  }
};

const getApiKey = () => {
  let key = "";
  
  // 1. Check for dynamically updated key in window first
  if ((window as any).DYNAMIC_GEMINI_API_KEY) {
    return (window as any).DYNAMIC_GEMINI_API_KEY;
  }

  // 2. Check traditional process.env
  try {
    const pk = process.env.MY_OWN_GEMINI_KEY || process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (pk && pk !== "undefined") key = pk;
  } catch (e) {
    // Ignore error if process is not defined
  }
  
  // 3. Check Vite-specific environment variables for production builds
  if (!key) {
    try {
      // @ts-ignore
      const vk = import.meta.env.VITE_GEMINI_API_KEY;
      if (vk && vk !== "undefined") key = vk;
    } catch (e) {}
  }
  
  if (!key) {
    // Try localStorage fallback if they provided one
    try {
      const lk = localStorage.getItem("CUSTOM_GEMINI_API_KEY");
      if (lk && lk !== "undefined") key = lk;
    } catch (e) {}
  }
  
  if (!key) {
    console.warn("Gemini API Key is missing in environment variables.");
  }
  return key;
};

// Safe localStorage helper to prevent crashes in iframes with blocked third-party cookies
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
};

/**
 * Helper component to animate words appearing in live subtitles.
 * Defined outside App to prevent unmounting and flickering on every re-render.
 */
const AnimatedSubtitleWords = ({ text }: { text: string }) => {
  if (!text) return null;
  // Use a cleaner regex to split words but keep logic simple for stability
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={`${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 3.2,
            ease: "linear",
          }}
          className="inline-block whitespace-pre-wrap mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </>
  );
};

// Initial load
try {
  initAI(getApiKey());
} catch (e) {
  console.error("Initial AI setup failed:", e);
}

function highlightMarkdown(text: string, cleanIndex: number) {
  const cleanText = text.replace(/[*_#`]/g, "");
  if (cleanIndex >= cleanText.length) return text;

  // Find the start of the sentence (search backwards for sentence boundaries)
  let sentenceStart = cleanIndex;
  while (sentenceStart > 0 && !/[.?!।\n]/.test(cleanText[sentenceStart - 1])) {
    sentenceStart--;
  }

  // Skip leading whitespace of the sentence
  while (
    sentenceStart < cleanText.length &&
    /\s/.test(cleanText[sentenceStart])
  ) {
    sentenceStart++;
  }

  if (sentenceStart >= cleanText.length) return text;

  // Find the end of the current sentence
  let sentenceEnd = cleanIndex;
  while (
    sentenceEnd < cleanText.length &&
    !/[.?!।\n]/.test(cleanText[sentenceEnd])
  ) {
    sentenceEnd++;
  }

  // Include the punctuation mark if present
  if (sentenceEnd < cleanText.length) {
    sentenceEnd++;
  }

  const cleanEndIndex = sentenceEnd;

  let cIndex = 0;
  let originalStartIndex = -1;
  let originalEndIndex = -1;

  for (let i = 0; i <= text.length; i++) {
    const isMarkdownChar = i < text.length && /[*_#`]/.test(text[i]);

    if (
      cIndex === sentenceStart &&
      originalStartIndex === -1 &&
      !isMarkdownChar
    ) {
      originalStartIndex = i;
    }

    if (cIndex === cleanEndIndex && originalEndIndex === -1) {
      originalEndIndex = i;
      break;
    }

    if (i < text.length && !isMarkdownChar) {
      cIndex++;
    }
  }

  if (originalStartIndex !== -1 && originalEndIndex !== -1) {
    const prefix = originalStartIndex === 0 ? "&#8203;" : "";
    return (
      prefix +
      text.substring(0, originalStartIndex) +
      '<span id="current-spoken-word">' +
      text.substring(originalStartIndex, originalEndIndex) +
      "</span>" +
      text.substring(originalEndIndex)
    );
  }

  return text;
}

const FloatingStopButton = ({
  stopAudio,
  isPlaying,
  titleText,
}: {
  stopAudio: () => void;
  isPlaying: boolean;
  titleText: string;
}) => {
  const [position, setPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const el = document.getElementById("current-spoken-word");
      const container = document.getElementById("chat-messages-container");

      if (el && container) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate right position relative to viewport
        // We want it just inside the right edge of the chat container
        const rightOffset =
          document.documentElement.clientWidth - containerRect.right + 16;

        // Hide if outside the container's visible area
        if (
          rect.top < containerRect.top ||
          rect.bottom > containerRect.bottom
        ) {
          setPosition(null);
        } else {
          setPosition({
            top: rect.top + rect.height / 2,
            right: rightOffset,
          });
        }
      } else {
        setPosition(null);
      }
    };

    const interval = setInterval(updatePosition, 50);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isPlaying]);

  if (position === null) return null;

  return (
    <button
      onClick={stopAudio}
      className="fixed z-50 text-red-600 hover:text-red-700 bg-white/90 border border-red-200 hover:bg-white rounded-full p-2.5 shadow-xl transition-all flex items-center justify-center cursor-pointer animate-in fade-in zoom-in duration-200"
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`,
        transform: "translateY(-50%)",
      }}
      title={titleText}
    >
      <Square size={18} className="fill-current" />
    </button>
  );
};

import { getLandingT } from "./landingTranslations";
import { SYSTEM_INSTRUCTION } from "./systemInstruction";

const industryQuestions: Record<string, Record<string, string[]>> = {
  en: {
    sales: [
      "What is Nard White-Labeling AI?",
      "How can I integrate Nard into my business?",
      "Does Nard support regional languages?",
      "What industries can use this solution?",
    ],
    agriculture: [
      "What are modern farming techniques?",
      "How to increase crop yield?",
      "Tell me about organic farming.",
      "What are the latest government schemes for farmers?",
    ],
    medical: [
      "What are the symptoms of flu?",
      "How to maintain a healthy diet?",
      "What is preventive healthcare?",
      "Tell me about mental health wellbeing.",
    ],
    education: [
      "How to prepare for competitive exams?",
      "What are the best study techniques?",
      "Can you act as my tutor for a topic?",
      "How to improve concentration?",
    ],
    business: [
      "How to start a new business?",
      "What are the best marketing strategies?",
      "How to manage small business finances?",
      "Tell me about digital marketing.",
    ],
    finance: [
      "How to start investing?",
      "What is wealth management?",
      "How to save for retirement?",
      "Explain the basics of stock market.",
    ],
    retail: [
      "How to attract more customers?",
      "What are the latest retail trends?",
      "How to improve customer retention?",
      "Tell me about visual merchandising.",
    ],
  },
  hi: {
    sales: [
      "नॉर्ड व्हाइट-लेबलिंग AI क्या है?",
      "मैं नॉर्ड को अपने बिजनेस में कैसे जोड़ सकता हूँ?",
      "क्या नॉर्ड क्षेत्रीय भाषाओं का समर्थन करता है?",
      "इस सर्विस का उपयोग किस तरह के बिजनेस कर सकते हैं?",
    ],
    agriculture: [
      "आधुनिक खेती की तकनीकें क्या हैं?",
      "फसल की पैदावार कैसे बढ़ाएं?",
      "जैविक खेती के बारे में बताएं।",
      "किसानों के लिए नवीनतम सरकारी योजनाएं क्या हैं?",
    ],
    medical: [
      "फ्लू के आम लक्षण क्या हैं?",
      "स्वस्थ आहार व्यवस्था कैसे बनाए रखें?",
      "निवारक स्वास्थ्य देखभाल क्या है?",
      "मानसिक स्वास्थ्य के बारे में बताएं।",
    ],
    education: [
      "प्रतियोगी परीक्षाओं की तैयारी कैसे करें?",
      "अध्ययन की सबसे अच्छी तकनीकें क्या हैं?",
      "क्या आप मेरे ट्यूटर बन सकते हैं?",
      "पढ़ाई में एकाग्रता कैसे सुधारें?",
    ],
    business: [
      "नया बिजनेस कैसे शुरू करें?",
      "मार्केटिंग के नए तरीके क्या हैं?",
      "छोटे व्यवसाय के वित्त का प्रबंधन कैसे करें?",
      "डिजिटल मार्केटिंग के बारे में बताएं।",
    ],
    finance: [
      "निवेश कैसे शुरू करें?",
      "वेल्थ मैनेजमेंट क्या है?",
      "रिटायरमेंट के लिए बचत कैसे करें?",
      "शेयर बाजार की मूल बातें समझाएं।",
    ],
    retail: [
      "अधिक ग्राहकों को कैसे आकर्षित करें?",
      "रिटेल के नवीनतम रुझान क्या हैं?",
      "ग्राहक प्रतिधारण कैसे सुधारें?",
      "विज़ुअल मर्चेंडाइजिंग के बारे में बताएं।",
    ],
  },
};

type Message = {
  id: string;
  role: "user" | "model";
  text: string;
  image?: { data: string; mimeType: string };
  isLive?: boolean;
};

type SavedChat = {
  id: string;
  name: string;
  messages: Message[];
  timestamp: number;
  isPinned?: boolean;
};

const translations: Record<string, any> = {
  en: {
    title: "Nard",
    subtitle: "AI Messenger, E-MAITRI.",
    you: "You",
    copy: "Copy",
    copied: "Copied",
    listen: "Listen",
    stop: "Stop",
    back: "Back",
    listenAgain: "Listen again",
    speaking: "Nard is speaking...",
    listening: "Nard is listening...",
    ready: "Nard is ready...",
    thinking: "is thinking...",
    liveChatOn: "Live Voice Chat is on: Please speak",
    stopVoiceChat: "Stop Voice Chat",
    startVoiceChat: "Start Live Voice Chat",
    voiceTyping: "Voice Typing",
    stopVoiceTyping: "Stop Voice Typing",
    tapToStart: "Tap here to start conversation",
    speechNotSupported: "Speech recognition is not supported in this browser.",
    liveChat: "Live Chat",
    typeMessage:
      "Type a message or use the mic! Talk directly to Nard using the last voice chat button!",
    typeMessages: [
      "Type your message here",
      "Send message by speaking into the mic",
      "Live chat with the pink voice chat button",
    ],
    userNameLabel: "Bot Name",
    userNamePlaceholder: "Enter bot's name",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "Settings",
    language: "Language",
    speechRate: "Speech Rate",
    adjustRate: "Adjust voice speed",
    speechPitch: "Speech Pitch",
    adjustPitch: "Adjust voice pitch",
    q1: "What is Nard White-Labeling AI?",
    q2: "How can I integrate Nard?",
    q3: "Does it support regional languages?",
    q4: "What industries can use this?",
    initialMessage:
      "Hello Gen-Z! Welcome to the E-Maitri portal! Tell me friend, how can I help you? What information do you need?",
    initialMessageWithName:
      "Hello Gen-Z!🙏 I am {botName}! Welcome to the E-Maitri portal!✨ How can I help you! What information do you need?👋",
    errorTraffic:
      "Sorry, there is too much traffic right now or the quota is exhausted. Please try again later.",
    errorTech: "Sorry, a technical issue occurred. Please try again.",
    premiumQuotaExceeded:
      "Premium voice quota exceeded. Falling back to standard voice.",
    newChat: "New Chat",
    moreOptions: "More Options",
    chattingIn: "Chatting in",
    saveChat: "Save Chat",
    enterChatName: "Enter chat name...",
    cancel: "Cancel",
    save: "Save",
    chatHistory: "Chat History",
    noSavedChats: "No saved chats yet.",
    voiceEngine: "Voice Engine",
    standard: "Standard",
    premium: "Premium",
    clearChatHistory: "Clear Chat History",
    clearAll: "Clear All",
    areYouSureClear:
      "Are you sure you want to delete all saved chats? This cannot be undone.",
    uploadImage: "Upload Screenshot / Image",
    screenOn: "Screen On",
    screenOff: "Screen Off",
    stopGenerating: "Stop Generating",
    maxChatsError:
      "You can only save up to 10 chats. Please delete an old chat to save a new one.",
    edit: "Edit",
    share: "Share",
    pinChat: "Pin Chat",
    unpinChat: "Unpin Chat",
    renameChat: "Rename Chat",
    deleteChat: "Delete Chat",
    loading: "Loading...",
    chooseLanguage: "Choose your preferred language",
    chooseVoiceEngine: "Choose between standard and premium AI voices",
    selectPremiumVoice: "Select a high-quality AI voice model",
    selectStandardVoice: "Choose a device voice",
    autoSelect: "Auto-select (Default)",
    fenrirDesc: "Fenrir (Strong, Authoritative Male)",
    charonDesc: "Charon (Calm, Measured Male)",
    puckDesc: "Puck (Friendly, Energetic Male)",
    koreDesc: "Kore (Calm, Measured Female)",
    zephyrDesc: "Zephyr (Strong, Authoritative Female)",
    errorMicPermission:
      "Microphone permission denied. Please enable it in your browser settings.",
    errorMicNotFound:
      "No microphone found. Please connect a microphone and try again.",
  },
  hi: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "आप",
    copy: "कॉपी करें",
    copied: "कॉपी किया गया",
    listen: "सुनें",
    stop: "रोकें",
    back: "वापस",
    listenAgain: "फिर से सुनें",
    speaking: "नॉर्ड बोल रहे हैं...",
    listening: "नॉर्ड सुन रहे हैं...",
    ready: "नॉर्ड तैयार हैं",
    thinking: "सोच रहे हैं...",
    liveChatOn: "लाइव वॉइस चैट चालू है: कृपया बोलें",
    stopVoiceChat: "वॉइस चैट बंद करें",
    startVoiceChat: "लाइव वॉइस चैट शुरू करें",
    voiceTyping: "बोलकर टाइप करें",
    stopVoiceTyping: "बोलना बंद करें",
    tapToStart: "बातचीत शुरू करने के लिए यहाँ टच करें",
    speechNotSupported: "आपके ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नहीं है।",
    liveChat: "लाइव चैट",
    typeMessage:
      "संदेश टाइप करें या माइक से बोलकर टाइप करें! आप आखिरी वाइस चैट बटन से नॉर्ड से सीधी बातचीत करें!",
    typeMessages: [
      "यहां अपना संदेश टाइप करें",
      "माइक से बोलकर संदेश भेजें",
      "गुलाबी वायस चैट बटन से लाइव चैट करें",
    ],
    userNameLabel: "बॉट का नाम",
    userNamePlaceholder: "बॉट का नाम दर्ज करें",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्स",
    language: "भाषा (Language)",
    speechRate: "भाषण दर",
    adjustRate: "आवाज की गति समायोजित करें",
    speechPitch: "भाषण पिच",
    adjustPitch: "आवाज की पिच समायोजित करें",
    q1: "नॉर्ड व्हाइट-लेबलिंग AI क्या है?",
    q2: "मैं नॉर्ड को कैसे इंटीग्रेट कर सकता हूँ?",
    q3: "क्या यह क्षेत्रीय भाषाओं को सपोर्ट करता है?",
    q4: "कौन से उद्योग इसका उपयोग कर सकते हैं?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टल में आपका स्वागत है! बताइए मित्र मैं आपको किस तरह से सहयोग कर सकता हूं? आपको क्या जानकारी चाहिए?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 मैं {botName} हूं! ई-मैत्री पोर्टल में आपका स्वागत है!✨ मैं आपको किस तरह से सहयोग कर सकता हूं! आपको क्या जानकारी चाहिए?👋",
    errorTraffic:
      "क्षमा करें, अभी अधिक ट्रैफिक है या कोटा समाप्त हो गया है। कृपया कुछ समय बाद पुनः प्रयास करें।",
    errorTech: "क्षमा करें, एक तकनीकी त्रुटि हुई। कृपया पुनः प्रयास करें।",
    premiumQuotaExceeded:
      "प्रीमियम वॉइस कोटा समाप्त हो गया है। मानक वॉइस पर स्विच किया जा रहा है।",
    newChat: "नई चैट",
    moreOptions: "और विकल्प",
    chattingIn: "चैटिंग इन",
    saveChat: "चैट सेव करें",
    enterChatName: "चैट का नाम दर्ज करें...",
    cancel: "रद्द करें",
    save: "सेव करें",
    chatHistory: "चैट हिस्ट्री",
    noSavedChats: "अभी तक कोई सेव की गई चैट नहीं है।",
    voiceEngine: "वॉइस इंजन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चैट हिस्ट्री साफ़ करें",
    clearAll: "सभी साफ़ करें",
    areYouSureClear:
      "क्या आप वाकई सभी सेव की गई चैट हटाना चाहते हैं? इसे वापस नहीं लाया जा सकता।",
    uploadImage: "स्क्रीनशॉट / इमेज अपलोड करें",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "जनरेट करना बंद करें",
    maxChatsError:
      "आप केवल 10 चैट ही सेव कर सकते हैं। कृपया नई चैट सेव करने के लिए पुरानी चैट डिलीट करें।",
    edit: "संपादित करें",
    share: "शेयर करें",
    pinChat: "चैट पिन करें",
    unpinChat: "चैट अनपिन करें",
    renameChat: "चैट का नाम बदलें",
    deleteChat: "चैट डिलीट करें",
    loading: "लोड हो रहा है...",
    chooseLanguage: "अपनी पसंदीदा भाषा चुनें",
    chooseVoiceEngine: "मानक और प्रीमियम एआई आवाज़ों के बीच चुनें",
    selectPremiumVoice: "एक उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनें",
    selectStandardVoice: "डिवाइस की आवाज़ चुनें",
    autoSelect: "स्वतः चुनें (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपा-तुला पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)",
    koreDesc: "कोरे (शांत, नपा-तुला महिला)",
    zephyrDesc: "ज़ेफिर (मजबूत, आधिकारिक महिला)",
    errorMicPermission:
      "माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया अपने ब्राउज़र सेटिंग्स में इसे सक्षम करें। (सुझाव: यदि आप प्रीव्यू में हैं, तो ऐप को नए टैब में खोलकर देखें)",
    errorMicNotFound:
      "कोई माइक्रोफ़ोन नहीं मिला। कृपया माइक्रोफ़ोन कनेक्ट करें और पुनः प्रयास करें।",
  },
  bho: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "रउआ",
    copy: "कॉपी करीं",
    copied: "कॉपी हो गइल",
    listen: "सुनीं",
    stop: "रोकीं",
    back: "पाछे",
    listenAgain: "फेरु से सुनीं",
    speaking: "नॉर्ड बोल रहल बाड़े...",
    listening: "नॉर्ड सुन रहल बाड़े...",
    ready: "नॉर्ड तैयार बाड़े",
    thinking: "सोच रहल बाड़े...",
    liveChatOn: "लाइव वॉइस चैट चालू बा: कृपया बोलीं",
    stopVoiceChat: "वॉइस चैट बंद करीं",
    startVoiceChat: "लाइव वॉइस चैट शुरू करीं",
    voiceTyping: "बोल के टाइप करीं",
    stopVoiceTyping: "बोलल बंद करीं",
    tapToStart: "बातचीत शुरू करे खातिर इहाँ टच करीं",
    speechNotSupported: "रउआ ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नइखे।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करीं...",
    typeMessages: [
      "इहाँ आपन संदेस टाइप करीं",
      "माइक से बोल के संदेस भेजीं",
      "गुलाबी वायस चैट बटन से लाइव चैट करीं",
    ],
    userNameLabel: "बॉट के नाम",
    userNamePlaceholder: "बॉट के नाम दर्ज करीं",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्स",
    language: "भाषा (Language)",
    speechRate: "बोले के रफ्तार",
    adjustRate: "आवाज के रफ्तार सेट करीं",
    speechPitch: "बोले के पिच",
    adjustPitch: "आवाज के पिच सेट करीं",
    q1: "डिजिटल गवर्नेंस का ह?",
    q2: "त्रि-स्तरीय संरचना के समझाईं।",
    q3: "बूथ मैनेजमेंट कइसे काम करेला?",
    q4: "पारिवारिक गठबंधन आंदोलन का ह?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टल में रउआ सभे के स्वागत बा! बताईं दोस्त, हम रउआ के कइसे मदद कर सकीले? रउआ के का जानकारी चाहीं?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 हम {botName} हईं! ई-मैत्री पोर्टल में रउआ सभे के स्वागत बा!✨ बताईं, हम रउआ के कइसे मदद कर सकीले! रउआ के का जानकारी चाहीं?👋",
    errorTraffic:
      "माफ करीं, अभी बहुत ट्रैफिक बा या कोटा खतम हो गइल बा। कृपया कुछ देर बाद फेरु से कोशिश करीं।",
    errorTech:
      "माफ करीं, एगो तकनीकी दिक्कत आ गइल बा। कृपया फेरु से कोशिश करीं।",
    premiumQuotaExceeded:
      "प्रीमियम वॉइस कोटा खतम हो गइल बा। स्टैंडर्ड वॉइस पर स्विच हो रहल बा।",
    newChat: "नया चैट",
    moreOptions: "अउरी विकल्प",
    chattingIn: "चैटिंग इन",
    saveChat: "चैट सेव करीं",
    enterChatName: "चैट के नाम डालीं...",
    cancel: "रद्द करीं",
    save: "सेव करीं",
    chatHistory: "चैट हिस्ट्री",
    noSavedChats: "अभी ले कवनो सेव कइल चैट नइखे।",
    voiceEngine: "वॉइस इंजन",
    standard: "स्टैंडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चैट हिस्ट्री साफ करीं",
    clearAll: "सब साफ करीं",
    areYouSureClear:
      "का रउआ सचमुच सभे सेव कइल चैट हटावल चाहत बानी? एकरा वापस ना लावल जा सकेला।",
    uploadImage: "स्क्रीनशॉट / इमेज अपलोड करीं",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "जनरेट कइल बंद करीं",
    maxChatsError:
      "रउआ खाली 10 गो चैट सेव कर सकत बानी। नया चैट सेव करे खातिर पुरान चैट डिलीट करीं।",
    edit: "संपादित करीं",
    share: "शेयर करीं",
    pinChat: "चैट पिन करीं",
    unpinChat: "चैट अनपिन करीं",
    renameChat: "चैट के नाम बदलीं",
    deleteChat: "चैट डिलीट करीं",
    loading: "लोड हो रहल बा...",
    chooseLanguage: "आपन पसंदीदा भाषा चुनीं",
    chooseVoiceEngine: "मानक आ प्रीमियम एआई आवाज के बीच चुनीं",
    selectPremiumVoice: "एगो उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनीं",
    selectStandardVoice: "डिवाइस के आवाज चुनीं",
    autoSelect: "अपने आप चुनीं (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपा-तुला पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)",
  },
  bn: {
    title: "নর্ড",
    subtitle: "এআই মেসেঞ্জার, ই-মৈত্রী.",
    you: "আপনি",
    copy: "কপি করুন",
    copied: "কপি করা হয়েছে",
    listen: "শুনুন",
    stop: "থামান",
    back: "ফিরে যান",
    listenAgain: "আবার শুনুন",
    speaking: "নর্ড কথা বলছে...",
    listening: "নর্ড শুনছে...",
    ready: "নর্ড প্রস্তুত",
    thinking: "চিন্তা করছে...",
    liveChatOn: "লাইভ ভয়েস চ্যাট চালু আছে: দয়া করে কথা বলুন",
    stopVoiceChat: "ভয়েস চ্যাট বন্ধ করুন",
    startVoiceChat: "লাইভ ভয়েস চ্যাট শুরু করুন",
    voiceTyping: "ভয়েস টাইপিং",
    stopVoiceTyping: "ভয়েস টাইপিং বন্ধ করুন",
    tapToStart: "কথোপকথন শুরু করতে এখানে আলতো চাপুন",
    liveChat: "লাইভ চ্যাট",
    typeMessage: "একটি বার্তা লিখুন...",
    typeMessages: [
      "এখানে আপনার বার্তা টাইপ করুন",
      "মাইকে কথা বলে বার্তা পাঠান",
      "গোলাপি ভয়েস চ্যাট বোতাম দিয়ে লাইভ চ্যাট করুন",
    ],
    userNameLabel: "বটের নাম",
    userNamePlaceholder: "বটের নাম লিখুন",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "সেটিংস",
    language: "ভাষা (Language)",
    speechRate: "কথা বলার গতি",
    adjustRate: "ভয়েস গতি সামঞ্জস্য করুন",
    speechPitch: "কথা বলার পিচ",
    adjustPitch: "ভয়েস পিচ সামঞ্জস্য করুন",
    q1: "ডিজিটাল গভর্নেন্স কি?",
    q2: "ত্রি-স্তরীয় কাঠামো ব্যাখ্যা করুন।",
    q3: "বুথ ম্যানেজমেন্ট কিভাবে কাজ করে?",
    q4: "ফ্যামিলি অ্যালায়েন্স মুভমেন্ট কি?",
    initialMessage:
      "নমস্কার জেন-জি! ই-মৈত্রী পোর্টালে আপনাকে স্বাগতম! বলুন বন্ধু, আমি আপনাকে কীভাবে সাহায্য করতে পারি? আপনার কী তথ্য দরকার?",
    initialMessageWithName:
      "নমস্কার জেন-জি!🙏 আমি {botName}! ই-মৈত্রী পোর্টালে আপনাকে স্বাগতম!✨ আমি আপনাকে কীভাবে সাহায্য করতে পারি! আপনার কী তথ্য দরকার?👋",
    errorTraffic:
      "দুঃখিত, এই মুহূর্তে খুব বেশি ট্রাফিক আছে অথবা কোটা শেষ হয়ে গেছে। দয়া করে কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    errorTech:
      "দুঃখিত, একটি প্রযুক্তিগত সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।",
    premiumQuotaExceeded:
      "প্রিমিয়াম ভয়েস কোটা শেষ হয়ে গেছে। স্ট্যান্ডার্ড ভয়েসে ফিরে যাচ্ছে।",
    newChat: "নতুন চ্যাট",
    moreOptions: "আরও বিকল্প",
    chattingIn: "চ্যাটিং ইন",
    saveChat: "চ্যাট সেভ করুন",
    enterChatName: "চ্যাটের নাম লিখুন...",
    cancel: "বাতিল করুন",
    save: "সেভ করুন",
    chatHistory: "চ্যাট হিস্ট্রি",
    noSavedChats: "এখনও কোনো চ্যাট সেভ করা হয়নি।",
    voiceEngine: "ভয়েস ইঞ্জিন",
    standard: "স্ট্যান্ডার্ড",
    premium: "প্রিমিয়াম",
    clearChatHistory: "চ্যাট হিস্ট্রি মুছুন",
    clearAll: "সব মুছুন",
    areYouSureClear:
      "আপনি কি নিশ্চিত যে আপনি সমস্ত সেভ করা চ্যাট মুছতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।",
    uploadImage: "স্ক্রিনশট / ছবি আপলোড করুন",
    screenOn: "স্ক্রিন অন",
    screenOff: "স্ক্রিন অফ",
    stopGenerating: "তৈরি করা বন্ধ করুন",
    maxChatsError:
      "আপনি শুধুমাত্র 10টি চ্যাট সেভ করতে পারবেন। নতুন চ্যাট সেভ করতে অনুগ্রহ করে একটি পুরানো চ্যাট মুছে ফেলুন।",
    edit: "সম্পাদনা করুন",
    share: "শেয়ার করুন",
    pinChat: "চ্যাট পিন করুন",
    unpinChat: "চ্যাট আনপিন করুন",
    renameChat: "চ্যাটের নাম পরিবর্তন করুন",
    deleteChat: "চ্যাট মুছুন",
    loading: "লোড হচ্ছে...",
    chooseLanguage: "আপনার পছন্দের ভাষা বেছে নিন",
    chooseVoiceEngine:
      "স্ট্যান্ডার্ড এবং প্রিমিয়াম এআই ভয়েসগুলির মধ্যে বেছে নিন",
    selectPremiumVoice: "একটি উচ্চ-মানের এআই ভয়েস মডেল নির্বাচন করুন",
    selectStandardVoice: "একটি ডিভাইসের ভয়েস বেছে নিন",
    autoSelect: "স্বয়ংক্রিয় নির্বাচন (ডিফল্ট)",
    fenrirDesc: "ফেনরির (শক্তিশালী, প্রামাণিক পুরুষ)",
    charonDesc: "ক্যারন (শান্ত, পরিমাপিত পুরুষ)",
    puckDesc: "পাক (বন্ধুত্বপূর্ণ, উদ্যমী পুরুষ)",
  },
  ta: {
    title: "நார்ட்",
    subtitle: "AI மெசஞ்சர், இ-மைத்ரி.",
    you: "நீங்கள்",
    copy: "நகலெடு",
    copied: "நகலெடுக்கப்பட்டது",
    listen: "கேட்க",
    stop: "நிறுத்து",
    back: "பின்னால்",
    listenAgain: "மீண்டும் கேட்க",
    speaking: "நார்ட் பேசுகிறார்...",
    listening: "நார்ட் கேட்கிறார்...",
    ready: "நார்ட் தயாராக உள்ளது",
    thinking: "யோசிக்கிறார்...",
    liveChatOn: "நேரலை குரல் அரட்டை இயக்கத்தில் உள்ளது: தயவுசெய்து பேசவும்",
    stopVoiceChat: "குரல் அரட்டையை நிறுத்து",
    startVoiceChat: "நேரலை குரல் அரட்டையைத் தொடங்கு",
    voiceTyping: "குரல் தட்டச்சு",
    stopVoiceTyping: "குரல் தட்டச்சு நிறுத்து",
    tapToStart: "உரையாடலைத் தொடங்க இங்கே தட்டவும்",
    liveChat: "நேரலை அரட்டை",
    typeMessage: "ஒரு செய்தியை தட்டச்சு செய்யவும்...",
    typeMessages: [
      "உங்கள் செய்தியை இங்கே தட்டச்சு செய்யவும்",
      "மைக்கில் பேசி செய்தியை அனுப்பவும்",
      "இளஞ்சிவப்பு குரல் அரட்டை பொத்தானுடன் நேரலை அரட்டை செய்யவும்",
    ],
    userNameLabel: "பாட் பெயர்",
    userNamePlaceholder: "பாட் பெயரை உள்ளிடவும்",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "அமைப்புகள்",
    language: "மொழி (Language)",
    speechRate: "பேச்சு வேகம்",
    adjustRate: "குரல் வேகத்தை சரிசெய்யவும்",
    speechPitch: "பேச்சு சுருதி",
    adjustPitch: "குரல் சுருதியை சரிசெய்யவும்",
    q1: "டிஜிட்டல் ஆளுமை என்றால் என்ன?",
    q2: "மூன்று அடுக்கு கட்டமைப்பை விளக்குங்கள்.",
    q3: "பூத் மேலாண்மை எவ்வாறு செயல்படுகிறது?",
    q4: "குடும்ப கூட்டணி இயக்கம் என்றால் என்ன?",
    initialMessage:
      "வணக்கம் ஜென்-ஜி! இ-மைத்ரி போர்ட்டலுக்கு உங்களை வரவேற்கிறேன்! சொல்லுங்கள் நண்பரே, நான் உங்களுக்கு எப்படி உதவ முடியும்? உங்களுக்கு என்ன தகவல் வேண்டும்?",
    initialMessageWithName:
      "வணக்கம் ஜென்-ஜி!🙏 நான் {botName}! இ-மைத்ரி போர்ட்டலுக்கு உங்களை வரவேற்கிறேன்!✨ நான் உங்களுக்கு எப்படி உதவ முடியும்! உங்களுக்கு என்ன தகவல் வேண்டும்?👋",
    errorTraffic:
      "மன்னிக்கவும், தற்போது அதிக போக்குவரத்து உள்ளது அல்லது ஒதுக்கீடு தீர்ந்துவிட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    errorTech:
      "மன்னிக்கவும், ஒரு தொழில்நுட்ப சிக்கல் ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.",
    premiumQuotaExceeded:
      "பிரீமியம் குரல் ஒதுக்கீடு முடிந்தது. நிலையான குரலுக்கு மாறுகிறது.",
    newChat: "புதிய அரட்டை",
    moreOptions: "மேலும் விருப்பங்கள்",
    chattingIn: "அரட்டையடிப்பது",
    saveChat: "அரட்டையைச் சேமி",
    enterChatName: "அரட்டை பெயரை உள்ளிடவும்...",
    cancel: "ரத்துசெய்",
    save: "சேமி",
    chatHistory: "அரட்டை வரலாறு",
    noSavedChats: "சேமிக்கப்பட்ட அரட்டைகள் எதுவும் இல்லை.",
    voiceEngine: "குரல் இயந்திரம்",
    standard: "நிலையான",
    premium: "பிரீமியம்",
    clearChatHistory: "அரட்டை வரலாற்றை அழி",
    clearAll: "அனைத்தையும் அழி",
    areYouSureClear:
      "சேமிக்கப்பட்ட அனைத்து அரட்டைகளையும் நிச்சயமாக அழிக்க வேண்டுமா? இதை செயல்தவிர்க்க முடியாது.",
    uploadImage: "ஸ்கிரீன்ஷாட் / படத்தைப் பதிவேற்றவும்",
    screenOn: "திரை ஆன்",
    screenOff: "திரை ஆஃப்",
    stopGenerating: "உருவாக்குவதை நிறுத்து",
    maxChatsError:
      "நீங்கள் 10 அரட்டைகள் வரை மட்டுமே சேமிக்க முடியும். புதியதைச் சேமிக்க பழைய அரட்டையை நீக்கவும்.",
    edit: "திருத்து",
    share: "பகிர்",
    pinChat: "அரட்டையை பின் செய்",
    unpinChat: "அரட்டையை அன்பின் செய்",
    renameChat: "அரட்டையின் பெயரை மாற்று",
    deleteChat: "அரட்டையை நீக்கு",
    loading: "ஏற்றுகிறது...",
    chooseLanguage: "உங்களுக்கு விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்",
    chooseVoiceEngine:
      "நிலையான மற்றும் பிரீமியம் AI குரல்களுக்கு இடையே தேர்வு செய்யவும்",
    selectPremiumVoice: "உயர்தர AI குரல் மாதிரியைத் தேர்ந்தெடுக்கவும்",
    selectStandardVoice: "சாதனத்தின் குரலைத் தேர்ந்தெடுக்கவும்",
    autoSelect: "தானியங்கு தேர்வு (இயல்புநிலை)",
    fenrirDesc: "ஃபென்ரிர் (வலுவான, அதிகாரபூர்வமான ஆண்)",
    charonDesc: "சரோன் (அமைதியான, அளவிடப்பட்ட ஆண்)",
    puckDesc: "பக் (நட்பான, ஆற்றல்மிக்க ஆண்)",
  },
  te: {
    title: "నార్డ్",
    subtitle: "ఏఐ మెసెంజర్, ఇ-మైత్రి.",
    you: "మీరు",
    copy: "కాపీ చేయండి",
    copied: "కాపీ చేయబడింది",
    listen: "వినండి",
    stop: "ఆపండి",
    back: "వెనుకకు",
    listenAgain: "మళ్ళీ వినండి",
    speaking: "నార్డ్ మాట్లాడుతున్నారు...",
    listening: "నార్డ్ వింటున్నారు...",
    ready: "నార్డ్ సిద్ధంగా ఉంది",
    thinking: "ఆలోచిస్తున్నారు...",
    liveChatOn: "లైవ్ వాయిస్ చాట్ ఆన్‌లో ఉంది: దయచేసి మాట్లాడండి",
    stopVoiceChat: "వాయిస్ చాట్‌ను ఆపండి",
    startVoiceChat: "లైవ్ వాయిస్ చాట్ ప్రారంభించండి",
    voiceTyping: "వాయిస్ టైపింగ్",
    stopVoiceTyping: "వాయిస్ టైపింగ్ ఆపండి",
    tapToStart: "సంభాషణను ప్రారంభించడానికి ఇక్కడ నొక్కండి",
    liveChat: "లైవ్ చాట్",
    typeMessage: "సందేశాన్ని టైప్ చేయండి...",
    typeMessages: [
      "మీ సందేశాన్ని ఇక్కడ టైప్ చేయండి",
      "మైక్‌లో మాట్లాడటం ద్వారా సందేశాన్ని పంపండి",
      "గులాబీ వాయిస్ చాట్ బటన్‌తో లైవ్ చాట్ చేయండి",
    ],
    userNameLabel: "బాట్ పేరు",
    userNamePlaceholder: "బాట్ పేరు నమోదు చేయండి",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "సెట్టింగ్‌లు",
    language: "భాష (Language)",
    speechRate: "మాట్లాడే వేగం",
    adjustRate: "వాయిస్ వేగాన్ని సర్దుబాటు చేయండి",
    speechPitch: "మాట్లాడే పిచ్",
    adjustPitch: "వాయిస్ పిచ్‌ను సర్దుబాటు చేయండి",
    q1: "డిజిటల్ గవర్నెన్స్ అంటే ఏమిటి?",
    q2: "మూడు అంచెల నిర్మాణాన్ని వివరించండి.",
    q3: "బూత్ మేనేజ్‌మెంట్ ఎలా పనిచేస్తుంది?",
    q4: "కుటుంబ కూటమి ఉద్యమం అంటే ఏమిటి?",
    initialMessage:
      "నమస్తే జెన్-జి! ఇ-మైత్రి పోర్టల్‌కు స్వాగతం! చెప్పండి మిత్రమా, నేను మీకు ఎలా సహాయం చేయగలను? మీకు ఏ సమాచారం కావాలి?",
    initialMessageWithName:
      "నమస్తే జెన్-జి!🙏 నేను {botName}! ఇ-మైత్రి పోర్టల్‌కు స్వాగతం!✨ నేను మీకు ఎలా సహాయం చేయగలను! మీకు ఏ సమాచారం కావాలి?👋",
    errorTraffic:
      "క్షమించండి, ప్రస్తుతం ట్రాఫిక్ ఎక్కువగా ఉంది లేదా కోటా ముగిసింది. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    errorTech:
      "క్షమించండి, సాంకేతిక సమస్య ఏర్పడింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
    premiumQuotaExceeded:
      "ప్రీమియం వాయిస్ కోటా ముగిసింది. ప్రామాణిక వాయిస్‌కి మారుతోంది.",
    newChat: "కొత్త చాట్",
    moreOptions: "మరిన్ని ఎంపికలు",
    chattingIn: "చాటింగ్ లో",
    saveChat: "చాట్ సేవ్ చేయండి",
    enterChatName: "చాట్ పేరు నమోదు చేయండి...",
    cancel: "రద్దు చేయండి",
    save: "సేవ్ చేయండి",
    chatHistory: "చాట్ చరిత్ర",
    noSavedChats: "ఇంకా సేవ్ చేసిన చాట్‌లు లేవు.",
    voiceEngine: "వాయిస్ ఇంజిన్",
    standard: "ప్రామాణిక",
    premium: "ప్రీమియం",
    clearChatHistory: "చాట్ చరిత్రను క్లియర్ చేయండి",
    clearAll: "అన్నీ క్లియర్ చేయండి",
    areYouSureClear:
      "సేవ్ చేసిన అన్ని చాట్‌లను మీరు ఖచ్చితంగా తొలగించాలనుకుంటున్నారా? దీన్ని రద్దు చేయడం సాధ్యం కాదు.",
    uploadImage: "స్క్రీన్‌షాట్ / చిత్రాన్ని అప్‌లోడ్ చేయండి",
    screenOn: "స్క్రీన్ ఆన్",
    screenOff: "స్క్రీన్ ఆఫ్",
    stopGenerating: "సృష్టించడం ఆపండి",
    maxChatsError:
      "మీరు 10 చాట్‌ల వరకు మాత్రమే సేవ్ చేయగలరు. దయచేసి కొత్తదాన్ని సేవ్ చేయడానికి పాత చాట్‌ను తొలగించండి.",
    edit: "సవరించు",
    share: "భాగస్వామ్యం చేయండి",
    pinChat: "చాట్‌ను పిన్ చేయండి",
    unpinChat: "చాట్‌ను అన్‌పిన్ చేయండి",
    renameChat: "చాట్ పేరు మార్చండి",
    deleteChat: "చాట్‌ను తొలగించండి",
    loading: "లోడ్ అవుతోంది...",
    chooseLanguage: "మీకు ఇష్టమైన భాషను ఎంచుకోండి",
    chooseVoiceEngine: "ప్రామాణిక మరియు ప్రీమియం AI వాయిస్‌ల మధ్య ఎంచుకోండి",
    selectPremiumVoice: "అధిక-నాణ్యత AI వాయిస్ మోడల్‌ను ఎంచుకోండి",
    selectStandardVoice: "పరికరం వాయిస్‌ని ఎంచుకోండి",
    autoSelect: "స్వీయ-ఎంపిక (డిఫాల్ట్)",
    fenrirDesc: "ఫెన్రిర్ (బలమైన, అధికారిక పురుషుడు)",
    charonDesc: "చరోన్ (ప్రశాంతమైన, కొలిచిన పురుషుడు)",
    puckDesc: "పక్ (స్నేహపూర్వక, శక్తివంతమైన పురుషుడు)",
  },
  mr: {
    title: "नॉर्ड",
    subtitle: "एआय मेसेंजर, ई-मैत्री.",
    you: "तुम्ही",
    copy: "कॉपी करा",
    copied: "कॉपी केले",
    listen: "ऐका",
    stop: "थांबवा",
    back: "मागे",
    listenAgain: "पुन्हा ऐका",
    speaking: "नॉर्ड बोलत आहेत...",
    listening: "नॉर्ड ऐकत आहेत...",
    ready: "नॉर्ड तयार आहे",
    thinking: "विचार करत आहेत...",
    liveChatOn: "लाइव्ह व्हॉइस चॅट चालू आहे: कृपया बोला",
    stopVoiceChat: "व्हॉइस चॅट थांबवा",
    startVoiceChat: "लाइव्ह व्हॉइस चॅट सुरू करा",
    voiceTyping: "व्हॉइस टायपिंग",
    stopVoiceTyping: "व्हॉइस टायपिंग थांबवा",
    tapToStart: "संभाषण सुरू करण्यासाठी येथे टॅप करा",
    liveChat: "लाइव्ह चॅट",
    typeMessage: "संदेश टाइप करा...",
    typeMessages: [
      "तुमचा संदेश येथे टाईप करा",
      "माईकमध्ये बोलून संदेश पाठवा",
      "गुलाबी व्हॉइस चॅट बटणासह लाईव्ह चॅट करा",
    ],
    userNameLabel: "बॉटचे नाव",
    userNamePlaceholder: "बॉटचे नाव प्रविष्ट करा",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्ज",
    language: "भाषा (Language)",
    speechRate: "बोलण्याचा वेग",
    adjustRate: "आवाजाचा वेग समायोजित करा",
    speechPitch: "बोलण्याचा पिच",
    adjustPitch: "आवाजाचा पिच समायोजित करा",
    q1: "डिजिटल गव्हर्नन्स म्हणजे काय?",
    q2: "त्रि-स्तरीय रचना स्पष्ट करा.",
    q3: "बूथ व्यवस्थापन कसे काम करते?",
    q4: "कौटुंबिक आघाडी चळवळ म्हणजे काय?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टलवर आपले स्वागत आहे! सांगा मित्रा, मी तुम्हाला कशी मदत करू शकतो? तुम्हाला कोणती माहिती हवी आहे?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 मी {botName} आहे! ई-मैत्री पोर्टलवर आपले स्वागत आहे!✨ मी तुम्हाला कशी मदत करू शकतो! तुम्हाला कोणती माहिती हवी आहे?👋",
    errorTraffic:
      "क्षमस्व, सध्या खूप ट्रॅफिक आहे किंवा कोटा संपला आहे. कृपया काही वेळानंतर पुन्हा प्रयत्न करा.",
    errorTech: "क्षमस्व, एक तांत्रिक समस्या आली. कृपया पुन्हा प्रयत्न करा.",
    premiumQuotaExceeded:
      "प्रीमियम व्हॉइस कोटा संपला आहे. मानक व्हॉइसवर स्विच करत आहे.",
    newChat: "नवीन चॅट",
    moreOptions: "अधिक पर्याय",
    chattingIn: "चॅटिंग इन",
    saveChat: "चॅट सेव्ह करा",
    enterChatName: "चॅटचे नाव प्रविष्ट करा...",
    cancel: "रद्द करा",
    save: "सेव्ह करा",
    chatHistory: "चॅट इतिहास",
    noSavedChats: "अद्याप कोणतेही सेव्ह केलेले चॅट नाहीत.",
    voiceEngine: "व्हॉइस इंजिन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चॅट इतिहास साफ करा",
    clearAll: "सर्व साफ करा",
    areYouSureClear:
      "तुम्हाला खात्री आहे की तुम्हाला सर्व सेव्ह केलेले चॅट हटवायचे आहेत? हे पूर्ववत केले जाऊ शकत नाही.",
    uploadImage: "स्क्रीनशॉट / प्रतिमा अपलोड करा",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "व्युत्पन्न करणे थांबवा",
    maxChatsError:
      "तुम्ही फक्त 10 चॅट सेव्ह करू शकता. नवीन सेव्ह करण्यासाठी कृपया जुने चॅट हटवा.",
    edit: "संपादित करा",
    share: "शेअर करा",
    pinChat: "चॅट पिन करा",
    unpinChat: "चॅट अनपिन करा",
    renameChat: "चॅटचे नाव बदला",
    deleteChat: "चॅट हटवा",
    loading: "लोड होत आहे...",
    chooseLanguage: "तुमची पसंतीची भाषा निवडा",
    chooseVoiceEngine: "प्रमाणित आणि प्रीमियम AI आवाजांमधून निवडा",
    selectPremiumVoice: "उच्च-गुणवत्तेचे AI व्हॉइस मॉडेल निवडा",
    selectStandardVoice: "डिव्हाइसचा आवाज निवडा",
    autoSelect: "स्वयं-निवड (डीफॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, अधिकृत पुरुष)",
    charonDesc: "कॅरॉन (शांत, मोजलेला पुरुष)",
    puckDesc: "पक (मैत्रीपूर्ण, ऊर्जावान पुरुष)",
  },
  gu: {
    title: "જેન-જી",
    subtitle: "એઆઈ મેસેન્જર, ઈ-મૈત્રી.",
    you: "તમે",
    copy: "કૉપિ કરો",
    copied: "કૉપિ કર્યું",
    listen: "સાંભળો",
    stop: "અટકાવો",
    back: "પાછા",
    listenAgain: "ફરી સાંભળો",
    speaking: "જેન-જી બોલી રહ્યા છે...",
    listening: "જેન-જી સાંભળી રહ્યા છે...",
    ready: "જેન-જી તૈયાર છે",
    thinking: "વિચારી રહ્યા છે...",
    liveChatOn: "લાઇવ વૉઇસ ચેટ ચાલુ છે: કૃપા કરીને બોલો",
    stopVoiceChat: "વૉઇસ ચેટ બંધ કરો",
    startVoiceChat: "લાઇવ વૉઇસ ચેટ શરૂ કરો",
    voiceTyping: "વૉઇસ ટાઇપિંગ",
    stopVoiceTyping: "વૉઇસ ટાઇપિંગ બંધ કરો",
    liveChat: "લાઇવ ચેટ",
    typeMessage: "સંદેશ લખો...",
    typeMessages: [
      "તમારો સંદેશ અહીં ટાઇપ કરો",
      "માઇકમાં બોલીને સંદેશ મોકલો",
      "ગુલાબી વૉઇસ ચેટ બટન સાથે લાઇવ ચેટ કરો",
    ],
    userNameLabel: "બૉટનું નામ",
    userNamePlaceholder: "બૉટનું નામ દાખલ કરો",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "સેટિંગ્સ",
    language: "ભાષા (Language)",
    speechRate: "બોલવાની ઝડપ",
    adjustRate: "અવાજની ઝડપ ગોઠવો",
    speechPitch: "બોલવાની પિચ",
    adjustPitch: "અવાજની પિચ ગોઠવો",
    q1: "ડિજિટલ ગવર્નન્સ શું છે?",
    q2: "ત્રિ-સ્તરીય માળખું સમજાવો.",
    q3: "બૂથ મેનેજમેન્ટ કેવી રીતે કામ કરે છે?",
    q4: "કૌટુંબિક જોડાણ ચળવળ શું છે?",
    initialMessage:
      "નમસ્તે જેન-જી! ઈ-મૈત્રી પોર્ટલમાં તમારું સ્વાગત છે! કહો મિત્ર, હું તમને કેવી રીતે મદદ કરી શકું? તમારે કઈ માહિતી જોઈએ છે?",
    initialMessageWithName:
      "નમસ્તે જેન-જી!🙏 હું {botName} છું! ઈ-મૈત્રી પોર્ટલમાં તમારું સ્વાગત છે!✨ હું તમને કેવી રીતે મદદ કરી શકું! તમારે કઈ માહિતી જોઈએ છે?👋",
    errorTraffic:
      "માફ કરશો, અત્યારે ઘણો ટ્રાફિક છે અથવા ક્વોટા પૂરો થઈ ગયો છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.",
    errorTech: "માફ કરશો, એક તકનીકી સમસ્યા આવી. કૃપા કરીને ફરી પ્રયાસ કરો.",
    premiumQuotaExceeded:
      "પ્રીમિયમ વૉઇસ ક્વોટા પૂરો થઈ ગયો છે. સ્ટાન્ડર્ડ વૉઇસ પર સ્વિચ કરી રહ્યાં છીએ.",
    newChat: "નવી ચેટ",
    moreOptions: "વધુ વિકલ્પો",
    chattingIn: "ચેટિંગ ઇન",
    saveChat: "ચેટ સેવ કરો",
    enterChatName: "ચેટનું નામ દાખલ કરો...",
    cancel: "રદ કરો",
    save: "સેવ કરો",
    chatHistory: "ચેટ ઇતિહાસ",
    noSavedChats: "હજી સુધી કોઈ સેવ કરેલી ચેટ નથી.",
    voiceEngine: "વૉઇસ એન્જિન",
    standard: "સ્ટાન્ડર્ડ",
    premium: "પ્રીમિયમ",
    clearChatHistory: "ચેટ ઇતિહાસ સાફ કરો",
    clearAll: "બધું સાફ કરો",
    areYouSureClear:
      "શું તમે ખરેખર બધી સેવ કરેલી ચેટ કાઢી નાખવા માંગો છો? આ પૂર્વવત્ કરી શકાતું નથી.",
    uploadImage: "સ્ક્રીનશોટ / છબી અપલોડ કરો",
    screenOn: "સ્ક્રીન ઓન",
    screenOff: "સ્ક્રીન ઓફ",
    stopGenerating: "જનરેટ કરવાનું બંધ કરો",
    maxChatsError:
      "તમે ફક્ત 10 ચેટ્સ સુધી સેવ કરી શકો છો. નવી સેવ કરવા માટે કૃપા કરીને જૂની ચેટ કાઢી નાખો.",
    edit: "સંપાદિત કરો",
    share: "શેર કરો",
    pinChat: "ચેટ પિન કરો",
    unpinChat: "ચેટ અનપિન કરો",
    renameChat: "ચેટનું નામ બદલો",
    deleteChat: "ચેટ કાઢી નાખો",
    loading: "લોડ થઈ રહ્યું છે...",
    chooseLanguage: "તમારી પસંદગીની ભાષા પસંદ કરો",
    chooseVoiceEngine: "પ્રમાણભૂત અને પ્રીમિયમ AI અવાજો વચ્ચે પસંદ કરો",
    selectPremiumVoice: "ઉચ્ચ-ગુણવત્તાવાળા AI વૉઇસ મોડલ પસંદ કરો",
    selectStandardVoice: "ઉપકરણનો અવાજ પસંદ કરો",
    autoSelect: "સ્વતઃ-પસંદગી (ડિફૉલ્ટ)",
    fenrirDesc: "ફેનરીર (મજબૂત, અધિકૃત પુરુષ)",
    charonDesc: "કેરોન (શાંત, માપેલ પુરુષ)",
    puckDesc: "પક (મૈત્રીપૂર્ણ, મહેનતુ પુરુષ)",
  },
  kn: {
    title: "ನಾರ್ಡ್",
    subtitle: "ಎಐ ಮೆಸೆಂಜರ್, ಇ-ಮೈತ್ರಿ.",
    you: "ನೀವು",
    copy: "ನಕಲಿಸಿ",
    copied: "ನಕಲಿಸಲಾಗಿದೆ",
    listen: "ಆಲಿಸಿ",
    stop: "ನಿಲ್ಲಿಸಿ",
    back: "ಹಿಂದೆ",
    listenAgain: "ಮತ್ತೆ ಆಲಿಸಿ",
    speaking: "ನಾರ್ಡ್ ಮಾತನಾಡುತ್ತಿದ್ದಾರೆ...",
    listening: "ನಾರ್ಡ್ ಆಲಿಸುತ್ತಿದ್ದಾರೆ...",
    thinking: "ಯೋಚಿಸುತ್ತಿದ್ದಾರೆ...",
    liveChatOn: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಆನ್ ಆಗಿದೆ: ದಯವಿಟ್ಟು ಮಾತನಾಡಿ",
    stopVoiceChat: "ವಾಯ್ಸ್ ಚಾಟ್ ನಿಲ್ಲಿಸಿ",
    startVoiceChat: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಪ್ರಾರಂಭಿಸಿ",
    voiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್",
    stopVoiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್ ನಿಲ್ಲಿಸಿ",
    tapToStart: "ಸಂಭಾಷಣೆ ಪ್ರಾರಂಭಿಸಲು ಇಲ್ಲಿ ಟ್ಯಾಪ್ ಮಾಡಿ",
    speechNotSupported:
      "ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.",
    liveChat: "ಲೈವ್ ಚಾಟ್",
    typeMessage: "ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ...",
    typeMessages: [
      "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ",
      "ಮೈಕ್‌ನಲ್ಲಿ ಮಾತನಾಡುವ ಮೂಲಕ ಸಂದೇಶ ಕಳುಹಿಸಿ",
      "ಗುಲಾಬಿ ಧ್ವನಿ ಚಾಟ್ ಬಟನ್‌ನೊಂದಿಗೆ ಲೈವ್ ಚಾಟ್ ಮಾಡಿ",
    ],
    userNameLabel: "ಬಾಟ್ ಹೆಸರು",
    userNamePlaceholder: "ಬಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    language: "ಭಾಷೆ (Language)",
    speechRate: "ಮಾತಿನ ವೇಗ",
    adjustRate: "ಧ್ವನಿ ವೇಗವನ್ನು ಹೊಂದಿಸಿ",
    speechPitch: "ಮಾತಿನ ಪಿಚ್",
    adjustPitch: "ಧ್ವನಿ ಪಿಚ್ ಅನ್ನು ಹೊಂದಿಸಿ",
    q1: "ಡಿಜಿಟಲ್ ಆಡಳಿತ ಎಂದರೇನು?",
    q2: "ಮೂರು ಹಂತದ ರಚನೆಯನ್ನು ವಿವರಿಸಿ.",
    q3: "ಬೂತ್ ನಿರ್ವಹಣೆ ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ?",
    q4: "ಕುಟುಂಬ ಒಕ್ಕೂಟ ಚಳುವಳಿ ಎಂದರೇನು?",
    initialMessage:
      "ನಮಸ್ತೆ ಜೆನ್-ಜಿ! ಇ-ಮೈತ್ರಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ! ಹೇಳಿ ಸ್ನೇಹಿತರೆ, ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು? ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?",
    initialMessageWithName:
      "ನಮಸ್ತೆ ಜೆನ್-ಜಿ!🙏 ನಾನು {botName}! ಇ-ಮೈತ್ರಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ!✨ ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು! ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?👋",
    errorTraffic:
      "ಕ್ಷಮಿಸಿ, ಪ್ರಸ್ತುತ ಹೆಚ್ಚಿನ ಟ್ರಾಫಿಕ್ ಇದೆ ಅಥವಾ ಕೋಟಾ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    errorTech: "ಕ್ಷಮಿಸಿ, ತಾಂತ್ರಿಕ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    premiumQuotaExceeded:
      "ಪ್ರೀಮಿಯಂ ಧ್ವನಿ ಕೋಟಾ ಮುಗಿದಿದೆ. ಪ್ರಮಾಣಿತ ಧ್ವನಿಗೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ.",
    newChat: "ಹೊಸ ಚಾಟ್",
    moreOptions: "ಹೆಚ್ಚಿನ ಆಯ್ಕೆಗಳು",
    chattingIn: "ಚಾಟಿಂಗ್ ಇನ್",
    saveChat: "ಚಾಟ್ ಉಳಿಸಿ",
    enterChatName: "ಚಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ...",
    cancel: "ರದ್ದುಗೊಳಿಸಿ",
    save: "ಉಳಿಸಿ",
    chatHistory: "ಚಾಟ್ ಇತಿಹಾಸ",
    noSavedChats: "ಇನ್ನೂ ಯಾವುದೇ ಉಳಿಸಿದ ಚಾಟ್‌ಗಳಿಲ್ಲ.",
    voiceEngine: "ಧ್ವನಿ ಎಂಜಿನ್",
    standard: "ಪ್ರಮಾಣಿತ",
    premium: "ಪ್ರೀಮಿಯಂ",
    clearChatHistory: "ಚಾಟ್ ಇತಿಹಾಸವನ್ನು ತೆರವುಗೊಳಿಸಿ",
    clearAll: "ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ",
    areYouSureClear:
      "ನೀವು ಖಂಡಿತವಾಗಿಯೂ ಎಲ್ಲಾ ಉಳಿಸಿದ ಚಾಟ್‌ಗಳನ್ನು ಅಳಿಸಲು ಬಯಸುವಿರಾ? ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗುವುದಿಲ್ಲ.",
    uploadImage: "ಸ್ಕ್ರೀನ್‌ಶಾಟ್ / ಚಿತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    screenOn: "ಸ್ಕ್ರೀನ್ ಆನ್",
    screenOff: "ಸ್ಕ್ರೀನ್ ಆಫ್",
    stopGenerating: "ರಚಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ",
    maxChatsError:
      "ನೀವು 10 ಚಾಟ್‌ಗಳವರೆಗೆ ಮಾತ್ರ ಉಳಿಸಬಹುದು. ಹೊಸದನ್ನು ಉಳಿಸಲು ದಯವಿಟ್ಟು ಹಳೆಯ ಚಾಟ್ ಅನ್ನು ಅಳಿಸಿ.",
    edit: "ಸಂಪಾದಿಸಿ",
    share: "ಹಂಚಿಕೊಳ್ಳಿ",
    pinChat: "ಚಾಟ್ ಪಿನ್ ಮಾಡಿ",
    unpinChat: "ಚಾಟ್ ಅನ್‌ಪಿನ್ ಮಾಡಿ",
    renameChat: "ಚಾಟ್ ಹೆಸರು ಬದಲಾಯಿಸಿ",
    deleteChat: "ಚಾಟ್ ಅಳಿಸಿ",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
    chooseLanguage: "ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    chooseVoiceEngine: "ಪ್ರಮಾಣಿತ ಮತ್ತು ಪ್ರೀಮಿಯಂ AI ಧ್ವನಿಗಳ ನಡುವೆ ಆಯ್ಕೆಮಾಡಿ",
    selectPremiumVoice: "ಉತ್ತಮ ಗುಣಮಟ್ಟದ AI ಧ್ವನಿ ಮಾದರಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    selectStandardVoice: "ಸಾಧನದ ಧ್ವನಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    autoSelect: "ಸ್ವಯಂ-ಆಯ್ಕೆ (ಡೀಫಾಲ್ಟ್)",
    fenrirDesc: "ಫೆನ್ರಿರ್ (ಬಲವಾದ, ಅಧಿಕೃತ ಪುರುಷ)",
    charonDesc: "ಚರಾನ್ (ಶಾಂತ, ಅಳತೆಯ ಪುರುಷ)",
    puckDesc: "ಪಕ್ (ಸ್ನೇಹಪರ, ಶಕ್ತಿಯುತ ಪುರುಷ)",
  },
  ml: {
    title: "ജെൻ-ജി",
    subtitle: "എഐ മെസഞ്ചർ, ഇ-മൈത്രി.",
    you: "നിങ്ങൾ",
    copy: "പകർത്തുക",
    copied: "പകർത്തി",
    listen: "കേൾക്കുക",
    stop: "നിർത്തുക",
    back: "തിരികെ",
    listenAgain: "വീണ്ടും കേൾക്കുക",
    speaking: "ജെൻ-ജി സംസാരിക്കുന്നു...",
    listening: "ജെൻ-ജി കേൾക്കുന്നു...",
    thinking: "ചിന്തിക്കുന്നു...",
    liveChatOn: "ലൈവ് വോയ്‌സ് ചാറ്റ് ഓണാണ്: ദയവായി സംസാരിക്കുക",
    stopVoiceChat: "വോയ്‌സ് ചാറ്റ് നിർത്തുക",
    startVoiceChat: "ലൈവ് വോയ്‌സ് ചാറ്റ് ആരംഭിക്കുക",
    voiceTyping: "വോയ്‌സ് ടൈപ്പിംഗ്",
    stopVoiceTyping: "വോയ്‌സ് ടൈപ്പിംഗ് നിർത്തുക",
    tapToStart: "സംഭാഷണം ആരംഭിക്കാൻ ഇവിടെ ടാപ്പ് ചെയ്യുക",
    speechNotSupported:
      "നിങ്ങളുടെ ബ്രൗസറിൽ സ്പീച്ച് റെക്കഗ്നിഷൻ പിന്തുണയ്ക്കുന്നില്ല.",
    liveChat: "ലൈവ് ചാറ്റ്",
    typeMessage: "ഒരു സന്ദേശം ടൈപ്പ് ചെയ്യുക...",
    typeMessages: [
      "നിങ്ങളുടെ സന്ദേശം ഇവിടെ ടൈപ്പ് ചെയ്യുക",
      "മൈക്കിലൂടെ സംസാരിച്ച് സന്ദേശം അയക്കുക",
      "പിങ്ക് വോയ്‌സ് ചാറ്റ് ബട്ടൺ ഉപയോഗിച്ച് ലൈവ് ചാറ്റ് ചെയ്യുക",
    ],
    userNameLabel: "ബോട്ടിന്റെ പേര്",
    userNamePlaceholder: "ബോട്ടിന്റെ പേര് നൽകുക",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ക്രമീകരണങ്ങൾ",
    language: "ഭാഷ (Language)",
    speechRate: "സംസാര വേഗത",
    adjustRate: "ശബ്ദ വേഗത ക്രമീകരിക്കുക",
    speechPitch: "സംസാര പിച്ച്",
    adjustPitch: "ശബ്ദ പിച്ച് ക്രമീകരിക്കുക",
    q1: "ഡിജിറ്റൽ ഗവേണൻസ് എന്നാൽ എന്ത്?",
    q2: "ത്രിതല ഘടന വിശദീകരിക്കുക.",
    q3: "ബൂത്ത് മാനേജ്മെന്റ് എങ്ങനെ പ്രവർത്തിക്കുന്നു?",
    q4: "കുടുംബ സഖ്യ പ്രസ്ഥാനം എന്നാൽ എന്ത്?",
    initialMessage:
      "നമസ്കാരം ജെൻ-ജി! ഇ-മൈത്രി പോർട്ടലിലേക്ക് സ്വാഗതം! പറയൂ സുഹൃത്തേ, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം? നിങ്ങൾക്ക് എന്ത് വിവരമാണ് വേണ്ടത്?",
    initialMessageWithName:
      "നമസ്കാരം ജെൻ-ജി!🙏 ഞാൻ {botName} ആണ്! ഇ-മൈത്രി പോർട്ടലിലേക്ക് സ്വാഗതം!✨ ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം! നിങ്ങൾക്ക് എന്ത് വിവരമാണ് വേണ്ടത്?👋",
    errorTraffic:
      "ക്ഷമിക്കണം, ഇപ്പോൾ തിരക്ക് കൂടുതലാണ് അല്ലെങ്കിൽ ക്വാട്ട കഴിഞ്ഞു. ദയവായി കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.",
    errorTech:
      "ക്ഷമിക്കണം, ഒരു സാങ്കേതിക പ്രശ്നം ഉണ്ടായി. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
    premiumQuotaExceeded:
      "പ്രീമിയം വോയ്‌സ് ക്വാട്ട കഴിഞ്ഞു. സ്റ്റാൻഡേർഡ് വോയ്‌സിലേക്ക് മാറുന്നു.",
    newChat: "പുതിയ ചാറ്റ്",
    moreOptions: "കൂടുതൽ ഓപ്ഷനുകൾ",
    chattingIn: "ചാറ്റിംഗ് ഇൻ",
    saveChat: "ചാറ്റ് സേവ് ചെയ്യുക",
    enterChatName: "ചാറ്റിന്റെ പേര് നൽകുക...",
    cancel: "റദ്ദാക്കുക",
    save: "സേവ് ചെയ്യുക",
    chatHistory: "ചാറ്റ് ചരിത്രം",
    noSavedChats: "സേവ് ചെയ്ത ചാറ്റുകളൊന്നുമില്ല.",
    voiceEngine: "വോയ്‌സ് എഞ്ചിൻ",
    standard: "സ്റ്റാൻഡേർഡ്",
    premium: "പ്രീമിയം",
    clearChatHistory: "ചാറ്റ് ചരിത്രം മായ്ക്കുക",
    clearAll: "എല്ലാം മായ്ക്കുക",
    areYouSureClear:
      "സേവ് ചെയ്ത എല്ലാ ചാറ്റുകളും ഇല്ലാതാക്കണമെന്ന് നിങ്ങൾക്ക് ഉറപ്പാണോ? ഇത് പഴയപടിയാക്കാനാകില്ല.",
    uploadImage: "സ്ക്രീൻഷോട്ട് / ചിത്രം അപ്‌ലോഡ് ചെയ്യുക",
    screenOn: "സ്ക്രീൻ ഓൺ",
    screenOff: "സ്ക്രീൻ ഓഫ്",
    stopGenerating: "സൃഷ്ടിക്കുന്നത് നിർത്തുക",
    maxChatsError:
      "നിങ്ങൾക്ക് 10 ചാറ്റുകൾ വരെ മാത്രമേ സേവ് ചെയ്യാനാകൂ. പുതിയൊരെണ്ണം സേവ് ചെയ്യാൻ ദയവായി പഴയ ചാറ്റ് ഇല്ലാതാക്കുക.",
    edit: "എഡിറ്റ് ചെയ്യുക",
    share: "പങ്കിടുക",
    pinChat: "ചാറ്റ് പിൻ ചെയ്യുക",
    unpinChat: "ചാറ്റ് അൺപിൻ ചെയ്യുക",
    renameChat: "ചാറ്റിന്റെ പേര് മാറ്റുക",
    deleteChat: "ചാറ്റ് ഇല്ലാതാക്കുക",
    loading: "ലോഡുചെയ്യുന്നു...",
    chooseLanguage: "നിങ്ങൾക്ക് ഇഷ്ടമുള്ള ഭാഷ തിരഞ്ഞെടുക്കുക",
    chooseVoiceEngine:
      "സ്റ്റാൻഡേർഡ്, പ്രീമിയം AI ശബ്ദങ്ങൾക്കിടയിൽ തിരഞ്ഞെടുക്കുക",
    selectPremiumVoice: "ഉയർന്ന നിലവാരമുള്ള ഒരു AI വോയ്‌സ് മോഡൽ തിരഞ്ഞെടുക്കുക",
    selectStandardVoice: "ഒരു ഉപകരണ ശബ്ദം തിരഞ്ഞെടുക്കുക",
    autoSelect: "സ്വയം തിരഞ്ഞെടുക്കുക (ഡിഫോൾട്ട്)",
    fenrirDesc: "ഫെൻറിർ (ശക്തനായ, ആധികാരികനായ പുരുഷൻ)",
    charonDesc: "ചാരോൺ (ശാന്തനായ, അളന്ന പുരുഷൻ)",
    puckDesc: "പക്ക് (സൗഹൃദമുള്ള, ഊർജ്ജസ്വലനായ പുരുഷൻ)",
  },
  or: {
    title: "ନର୍ଡ",
    subtitle: "ଏଆଇ ମେସେଞ୍ଜର, ଇ-ମୈତ୍ରୀ.",
    you: "ଆପଣ",
    copy: "କପି କରନ୍ତୁ",
    copied: "କପି ହୋଇଛି",
    listen: "ଶୁଣନ୍ତୁ",
    stop: "ବନ୍ଦ କରନ୍ତୁ",
    back: "ପଛକୁ",
    listenAgain: "ପୁଣି ଶୁଣନ୍ତୁ",
    speaking: "ନର୍ଡ କହୁଛନ୍ତି...",
    listening: "ନର୍ଡ ଶୁଣୁଛନ୍ତି...",
    thinking: "ଭାବୁଛନ୍ତି...",
    liveChatOn: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଅନ୍ ଅଛି: ଦୟାକରି କୁହନ୍ତୁ",
    stopVoiceChat: "ଭଏସ୍ ଚାଟ୍ ବନ୍ଦ କରନ୍ତୁ",
    startVoiceChat: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଆରମ୍ଭ କରନ୍ତୁ",
    voiceTyping: "ଭଏସ୍ ଟାଇପିଂ",
    stopVoiceTyping: "ଭଏସ୍ ଟାଇପିଂ ବନ୍ଦ କରନ୍ତୁ",
    speechNotSupported: "ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ସ୍ପିଚ୍ ରେକଗ୍ନିସନ୍ ସପୋର୍ଟ କରେ ନାହିଁ।",
    liveChat: "ଲାଇଭ୍ ଚାଟ୍",
    typeMessage: "ଏକ ମେସେଜ୍ ଟାଇପ୍ କରନ୍ତୁ...",
    typeMessages: [
      "ଆପଣଙ୍କର ବାର୍ତ୍ତା ଏଠାରେ ଟାଇପ୍ କରନ୍ତୁ",
      "ମାଇକ୍ ରେ କହି ବାର୍ତ୍ତା ପଠାନ୍ତୁ",
      "ଗୋଲାପୀ ଭଏସ୍ ଚାଟ୍ ବଟନ୍ ସହିତ ଲାଇଭ୍ ଚାଟ୍ କରନ୍ତୁ",
    ],
    userNameLabel: "ବଟ୍ ନାମ",
    userNamePlaceholder: "ବଟ୍ ନାମ ଦିଅନ୍ତୁ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ସେଟିଂସ୍",
    language: "ଭାଷା (Language)",
    speechRate: "କଥାବାର୍ତ୍ତା ବେଗ",
    adjustRate: "ସ୍ୱରର ବେଗ ଆଡଜଷ୍ଟ କରନ୍ତୁ",
    speechPitch: "କଥାବାର୍ତ୍ତା ପିଚ୍",
    adjustPitch: "ସ୍ୱରର ପିଚ୍ ଆଡଜଷ୍ଟ କରନ୍ତୁ",
    q1: "ଡିଜିଟାଲ୍ ଗଭର୍ଣ୍ଣାନ୍ସ କ'ଣ?",
    q2: "ତ୍ରିସ୍ତରୀୟ ସଂରଚନା ବର୍ଣ୍ଣନା କରନ୍ତୁ।",
    q3: "ବୁଥ୍ ମ୍ୟାନେଜମେଣ୍ଟ କିପରି କାମ କରେ?",
    q4: "ପାରିବାରିକ ମେଣ୍ଟ ଆନ୍ଦୋଳନ କ'ଣ?",
    initialMessage:
      "ନମସ୍ତେ ଜେନ୍-ଜି! ଇ-ମୈତ୍ରୀ ପୋର୍ଟାଲକୁ ସ୍ୱାଗତ! କୁହନ୍ତୁ ବନ୍ଧୁ, ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି? ଆପଣଙ୍କୁ କେଉଁ ସୂଚନା ଦରକାର?",
    initialMessageWithName:
      "ନମସ୍ତେ ଜେନ୍-ଜି!🙏 ମୁଁ {botName}! ଇ-ମୈତ୍ରୀ ପୋର୍ଟାଲକୁ ସ୍ୱାଗତ!✨ ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି! ଆପଣଙ୍କୁ କେଉଁ ସୂଚନା ଦରକାର?👋",
    errorTraffic:
      "କ୍ଷମା କରିବେ, ବର୍ତ୍ତମାନ ବହୁତ ଟ୍ରାଫିକ୍ ଅଛି କିମ୍ବା କୋଟା ସରିଯାଇଛି। ଦୟାକରି କିଛି ସମୟ ପରେ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    errorTech:
      "କ୍ଷମା କରିବେ, ଏକ ବୈଷୟିକ ସମସ୍ୟା ଦେଖାଦେଇଛି। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    premiumQuotaExceeded:
      "ପ୍ରିମିୟମ୍ ଭଏସ୍ କୋଟା ସରିଯାଇଛି। ଷ୍ଟାଣ୍ଡାର୍ଡ ଭଏସକୁ ଫେରୁଛି।",
    newChat: "ନୂଆ ଚାଟ୍",
    moreOptions: "ଅଧିକ ବିକଳ୍ପ",
    chattingIn: "ଚାଟିଂ ଇନ୍",
    saveChat: "ଚାଟ୍ ସେଭ୍ କରନ୍ତୁ",
    enterChatName: "ଚାଟ୍ ନାମ ଦିଅନ୍ତୁ...",
    cancel: "ବାତିଲ୍ କରନ୍ତୁ",
    save: "ସେଭ୍ କରନ୍ତୁ",
    chatHistory: "ଚାଟ୍ ହିଷ୍ଟ୍ରି",
    noSavedChats: "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ସେଭ୍ ହୋଇଥିବା ଚାଟ୍ ନାହିଁ।",
    voiceEngine: "ଭଏସ୍ ଇଞ୍ଜିନ୍",
    standard: "ଷ୍ଟାଣ୍ଡାର୍ଡ",
    premium: "ପ୍ରିମିୟମ୍",
    clearChatHistory: "ଚାଟ୍ ହିଷ୍ଟ୍ରି ସଫା କରନ୍ତୁ",
    clearAll: "ସବୁ ସଫା କରନ୍ତୁ",
    areYouSureClear:
      "ଆପଣ ନିଶ୍ଚିତ କି ଆପଣ ସମସ୍ତ ସେଭ୍ ହୋଇଥିବା ଚାଟ୍ ଡିଲିଟ୍ କରିବାକୁ ଚାହୁଁଛନ୍ତି? ଏହାକୁ ଫେରାଇ ଆଣିହେବ ନାହିଁ।",
    uploadImage: "ସ୍କ୍ରିନସଟ୍ / ଇମେଜ୍ ଅପଲୋଡ୍ କରନ୍ତୁ",
    screenOn: "ସ୍କ୍ରିନ୍ ଅନ୍",
    screenOff: "ସ୍କ୍ରିନ୍ ଅଫ୍",
    stopGenerating: "ଜେନେରେଟ୍ କରିବା ବନ୍ଦ କରନ୍ତୁ",
    maxChatsError:
      "ଆପଣ କେବଳ 10 ଟି ଚାଟ୍ ସେଭ୍ କରିପାରିବେ। ନୂଆ ସେଭ୍ କରିବାକୁ ଦୟାକରି ଏକ ପୁରୁଣା ଚାଟ୍ ଡିଲିଟ୍ କରନ୍ତୁ।",
    edit: "ସମ୍ପାଦନ କରନ୍ତୁ",
    share: "ସେୟାର କରନ୍ତୁ",
    pinChat: "ଚାଟ୍ ପିନ୍ କରନ୍ତୁ",
    unpinChat: "ଚାଟ୍ ଅନପିନ୍ କରନ୍ତୁ",
    renameChat: "ଚାଟ୍ ର ନାମ ପରିବର୍ତ୍ତନ କରନ୍ତୁ",
    deleteChat: "ଚାଟ୍ ଡିଲିଟ୍ କରନ୍ତୁ",
    loading: "ଲୋଡ୍ ହେଉଛି...",
    chooseLanguage: "ଆପଣଙ୍କ ପସନ୍ଦର ଭାଷା ବାଛନ୍ତୁ",
    chooseVoiceEngine: "ଷ୍ଟାଣ୍ଡାର୍ଡ ଏବଂ ପ୍ରିମିୟମ୍ AI ଭଏସ୍ ମଧ୍ୟରୁ ବାଛନ୍ତୁ",
    selectPremiumVoice: "ଏକ ଉଚ୍ଚ-ଗୁଣବତ୍ତା AI ଭଏସ୍ ମଡେଲ୍ ବାଛନ୍ତୁ",
    selectStandardVoice: "ଏକ ଡିଭାଇସ୍ ଭଏସ୍ ବାଛନ୍ତୁ",
    autoSelect: "ସ୍ୱତଃ-ଚୟନ (ଡିଫଲ୍ଟ)",
    fenrirDesc: "ଫେନରିର୍ (ଶକ୍ତିଶାଳୀ, ପ୍ରାଧିକୃତ ପୁରୁଷ)",
    charonDesc: "ଚାରନ୍ (ଶାନ୍ତ, ମାପାଯାଇଥିବା ପୁରୁଷ)",
    puckDesc: "ପକ୍ (ବନ୍ଧୁତ୍ୱପୂର୍ଣ୍ଣ, ଶକ୍ତିଶାଳୀ ପୁରୁଷ)",
  },
  pa: {
    title: "ਜੇਨ-ਜੀ",
    subtitle: "ਏਆਈ ਮੈਸੇਂਜਰ, ਈ-ਮੈਤਰੀ.",
    you: "ਤੁਸੀਂ",
    copy: "ਕਾਪੀ ਕਰੋ",
    copied: "ਕਾਪੀ ਕੀਤਾ ਗਿਆ",
    listen: "ਸੁਣੋ",
    stop: "ਰੋਕੋ",
    back: "ਪਿੱਛੇ",
    listenAgain: "ਦੁਬਾਰਾ ਸੁਣੋ",
    speaking: "ਜੇਨ-ਜੀ ਬੋਲ ਰਹੇ ਹਨ...",
    listening: "ਜੇਨ-ਜੀ ਸੁਣ ਰਹੇ ਹਨ...",
    ready: "ਜੇਨ-ਜੀ ਤਿਆਰ ਹੈ",
    thinking: "ਸੋਚ ਰਹੇ ਹਨ...",
    liveChatOn: "ਲਾਈਵ ਵੌਇਸ ਚੈਟ ਚਾਲੂ ਹੈ: ਕਿਰਪਾ ਕਰਕੇ ਬੋਲੋ",
    stopVoiceChat: "ਵੌਇਸ ਚੈਟ ਬੰਦ ਕਰੋ",
    startVoiceChat: "ਲਾਈਵ ਵੌਇਸ ਚੈਟ ਸ਼ੁਰੂ ਕਰੋ",
    voiceTyping: "ਬੋਲ ਕੇ ਟਾਈਪ ਕਰੋ",
    stopVoiceTyping: "ਬੋਲਣਾ ਬੰਦ ਕਰੋ",
    speechNotSupported: "ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਸਪੀਚ ਰਿਕੋਗਨੀਸ਼ਨ ਸਪੋਰਟ ਨਹੀਂ ਹੈ।",
    liveChat: "ਲਾਈਵ ਚੈਟ",
    typeMessage: "ਸੁਨੇਹਾ ਟਾਈਪ ਕਰੋ...",
    typeMessages: [
      "ਆਪਣਾ ਸੁਨੇਹਾ ਇੱਥੇ ਟਾਈਪ ਕਰੋ",
      "ਮਾਈਕ ਵਿੱਚ ਬੋਲ ਕੇ ਸੁਨੇਹਾ ਭੇਜੋ",
      "ਗੁਲਾਬੀ ਵੌਇਸ ਚੈਟ ਬਟਨ ਨਾਲ ਲਾਈਵ ਚੈਟ ਕਰੋ",
    ],
    userNameLabel: "ਬੋਟ ਦਾ ਨਾਮ",
    userNamePlaceholder: "ਬੋਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ਸੈਟਿੰਗਾਂ",
    language: "ਭਾਸ਼ਾ (Language)",
    speechRate: "ਬੋਲਣ ਦੀ ਗਤੀ",
    adjustRate: "ਆਵਾਜ਼ ਦੀ ਗਤੀ ਸੈੱਟ ਕਰੋ",
    speechPitch: "ਬੋਲਣ ਦੀ ਪਿੱਚ",
    adjustPitch: "ਆਵਾਜ਼ ਦੀ ਪਿੱਚ ਸੈੱਟ ਕਰੋ",
    q1: "ਡਿਜੀਟਲ ਗਵਰਨੈਂਸ ਕੀ ਹੈ?",
    q2: "ਤਿੰਨ-ਪੱਧਰੀ ਢਾਂਚੇ ਦੀ ਵਿਆਖਿਆ ਕਰੋ।",
    q3: "ਬੂਥ ਪ੍ਰਬੰਧਨ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ?",
    q4: "ਪਰਿਵਾਰਕ ਗਠਜੋੜ ਅੰਦੋਲਨ ਕੀ ਹੈ?",
    initialMessage:
      "ਨਮਸਤੇ ਜੇਨ-ਜੀ! ਈ-ਮੈਤਰੀ ਪੋਰਟਲ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ! ਦੱਸੋ ਦੋਸਤ, ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ? ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?",
    initialMessageWithName:
      "ਨਮਸਤੇ ਜੇਨ-ਜੀ!🙏 ਮੈਂ {botName} ਹਾਂ! ਈ-ਮੈਤਰੀ ਪੋਰਟਲ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ!✨ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ! ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?👋",
    errorTraffic:
      "ਮੁਆਫ ਕਰਨਾ, ਇਸ ਸਮੇਂ ਬਹੁਤ ਟ੍ਰੈਫਿਕ ਹੈ ਜਾਂ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਕੁਝ ਸਮੇਂ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    errorTech:
      "ਮੁਆਫ ਕਰਨਾ, ਇੱਕ ਤਕਨੀਕੀ ਸਮੱਸਿਆ ਆਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    premiumQuotaExceeded:
      "ਪ੍ਰੀਮੀਅਮ ਵੌਇਸ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਸਟੈਂਡਰਡ ਵੌਇਸ 'ਤੇ ਸਵਿਚ ਕਰ ਰਿਹਾ ਹੈ।",
    newChat: "ਨਵੀਂ ਚੈਟ",
    moreOptions: "ਹੋਰ ਵਿਕਲਪ",
    chattingIn: "ਚੈਟਿੰਗ ਇਨ",
    saveChat: "ਚੈਟ ਸੇਵ ਕਰੋ",
    enterChatName: "ਚੈਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ...",
    cancel: "ਰੱਦ ਕਰੋ",
    save: "ਸੇਵ ਕਰੋ",
    chatHistory: "ਚੈਟ ਹਿਸਟਰੀ",
    noSavedChats: "ਹਾਲੇ ਤੱਕ ਕੋਈ ਸੇਵ ਕੀਤੀ ਚੈਟ ਨਹੀਂ ਹੈ।",
    voiceEngine: "ਵੌਇਸ ਇੰਜਣ",
    standard: "ਸਟੈਂਡਰਡ",
    premium: "ਪ੍ਰੀਮੀਅਮ",
    clearChatHistory: "ਚੈਟ ਹਿਸਟਰੀ ਸਾਫ਼ ਕਰੋ",
    clearAll: "ਸਭ ਸਾਫ਼ ਕਰੋ",
    areYouSureClear:
      "ਕੀ ਤੁਸੀਂ ਯਕੀਨੀ ਤੌਰ 'ਤੇ ਸਾਰੀਆਂ ਸੇਵ ਕੀਤੀਆਂ ਚੈਟਾਂ ਨੂੰ ਡਿਲੀਟ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ? ਇਸਨੂੰ ਵਾਪਸ ਨਹੀਂ ਲਿਆਂਦਾ ਜਾ ਸਕਦਾ।",
    uploadImage: "ਸਕ੍ਰੀਨਸ਼ਾਟ / ਚਿੱਤਰ ਅੱਪਲੋਡ ਕਰੋ",
    screenOn: "ਸਕ੍ਰੀਨ ਆਨ",
    screenOff: "ਸਕ੍ਰੀਨ ਆਫ",
    stopGenerating: "ਜਨਰੇਟ ਕਰਨਾ ਬੰਦ ਕਰੋ",
    maxChatsError:
      "ਤੁਸੀਂ ਸਿਰਫ਼ 10 ਚੈਟਾਂ ਤੱਕ ਸੇਵ ਕਰ ਸਕਦੇ ਹੋ। ਨਵੀਂ ਸੇਵ ਕਰਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਪੁਰਾਣੀ ਚੈਟ ਡਿਲੀਟ ਕਰੋ।",
    edit: "ਸੋਧੋ",
    share: "ਸਾਂਝਾ ਕਰੋ",
    pinChat: "ਚੈਟ ਪਿੰਨ ਕਰੋ",
    unpinChat: "ਚੈਟ ਅਣਪਿੰਨ ਕਰੋ",
    renameChat: "ਚੈਟ ਦਾ ਨਾਮ ਬਦਲੋ",
    deleteChat: "ਚੈਟ ਡਿਲੀਟ ਕਰੋ",
    loading: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...",
    chooseLanguage: "ਆਪਣੀ ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ ਚੁਣੋ",
    chooseVoiceEngine: "ਸਟੈਂਡਰਡ ਅਤੇ ਪ੍ਰੀਮੀਅਮ AI ਆਵਾਜ਼ਾਂ ਵਿੱਚੋਂ ਚੁਣੋ",
    selectPremiumVoice: "ਇੱਕ ਉੱਚ-ਗੁਣਵੱਤਾ AI ਵੌਇਸ ਮਾਡਲ ਚੁਣੋ",
    selectStandardVoice: "ਇੱਕ ਡਿਵਾਈਸ ਵੌਇਸ ਚੁਣੋ",
    autoSelect: "ਸਵੈ-ਚੋਣ (ਡਿਫੌਲਟ)",
    fenrirDesc: "ਫੈਨਰਿਰ (ਮਜ਼ਬੂਤ, ਅਧਿਕਾਰਤ ਪੁਰਸ਼)",
    charonDesc: "ਚੈਰੋਨ (ਸ਼ਾਂਤ, ਮਾਪਿਆ ਪੁਰਸ਼)",
    puckDesc: "ਪੱਕ (ਦੋਸਤਾਨਾ, ਊਰਜਾਵਾਨ ਪੁਰਸ਼)",
  },
  ur: {
    title: "نارڈ",
    subtitle: "اے آئی میسنجر، ای-میتری.",
    you: "آپ",
    copy: "کاپی کریں",
    copied: "کاپی ہو گیا",
    listen: "سنیں",
    stop: "روکیں",
    back: "پیچھے",
    listenAgain: "دوبارہ سنیں",
    speaking: "نارڈ بول رہے ہیں...",
    listening: "نارڈ سن رہے ہیں...",
    ready: "نارڈ تیار ہیں",
    thinking: "سوچ رہے ہیں...",
    liveChatOn: "لائیو وائس چیٹ آن ہے: براہ کرم بولیں",
    stopVoiceChat: "وائس چیٹ بند کریں",
    startVoiceChat: "لائیو وائس چیٹ شروع کریں",
    voiceTyping: "وائس ٹائپنگ",
    stopVoiceTyping: "وائس ٹائپنگ بند کریں",
    speechNotSupported: "آپ کے براؤزر میں اسپیچ ریکگنیشن سپورٹ نہیں ہے۔",
    liveChat: "لائیو چیٹ",
    typeMessage: "پیغام ٹائپ کریں...",
    typeMessages: [
      "اپنا پیغام یہاں ٹائپ کریں",
      "مائیک میں بول کر پیغام بھیجیں",
      "گلابی وائس چیٹ بٹن کے ساتھ لائیو چیٹ کریں",
    ],
    userNameLabel: "بوٹ کا نام",
    userNamePlaceholder: "بوٹ کا نام درج کریں",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ترتیبات",
    language: "زبان (Language)",
    speechRate: "بولنے کی رفتار",
    adjustRate: "آواز کی رفتار سیٹ کریں",
    speechPitch: "بولنے کی پچ",
    adjustPitch: "آواز کی پچ سیٹ کریں",
    q1: "ڈیجیٹل گورننس کیا ہے؟",
    q2: "تین درجاتی ڈھانچے کی وضاحت کریں۔",
    q3: "بوتھ مینجمنٹ کیسے کام کرتا ہے؟",
    q4: "خاندانی اتحاد کی تحریک کیا ہے؟",
    initialMessage:
      "ہیلو جین-جی! ای-میتری پورٹل میں خوش آمدید! بتائیں دوست، میں آپ کی کیسے مدد کر سکتا ہوں؟ آپ کو کیا معلومات چاہیے؟",
    initialMessageWithName:
      "ہیلو جین-جی!🙏 میں {botName} ہوں! ای-میتری پورٹل میں خوش آمدید!✨ میں آپ کی کیسے مدد کر سکتا ہوں! آپ کو کیا معلومات چاہیے؟👋",
    errorTraffic:
      "معذرت، اس وقت بہت ٹریفک ہے یا کوٹہ ختم ہو گیا ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔",
    errorTech: "معذرت، ایک تکنیکی مسئلہ پیش آیا ہے۔ براہ کرم دوبارہ کوشش کریں۔",
    premiumQuotaExceeded:
      "پریمیم وائس کوٹہ ختم ہو گیا ہے۔ معیاری وائس پر سوئچ کر رہا ہے۔",
    newChat: "نئی چیٹ",
    moreOptions: "مزید اختیارات",
    chattingIn: "چیٹنگ ان",
    saveChat: "چیٹ محفوظ کریں",
    enterChatName: "چیٹ کا نام درج کریں...",
    cancel: "منسوخ کریں",
    save: "محفوظ کریں",
    chatHistory: "چیٹ ہسٹری",
    noSavedChats: "ابھی تک کوئی محفوظ شدہ چیٹ نہیں ہے۔",
    voiceEngine: "وائس انجن",
    standard: "معیاری",
    premium: "پریمیم",
    clearChatHistory: "چیٹ ہسٹری صاف کریں",
    clearAll: "سب صاف کریں",
    areYouSureClear:
      "کیا آپ واقعی تمام محفوظ شدہ چیٹس کو حذف کرنا چاہتے ہیں؟ اسے کالعدم نہیں کیا جا سکتا۔",
    uploadImage: "اسکرین شاٹ / تصویر اپ لوڈ کریں",
    screenOn: "اسکرین آن",
    screenOff: "اسکرین آف",
    stopGenerating: "بنانا بند کریں",
    maxChatsError:
      "آپ صرف 10 چیٹس تک محفوظ کر سکتے ہیں۔ نئی محفوظ کرنے کے لیے براہ کرم پرانی چیٹ حذف کریں۔",
    edit: "ترمیم کریں",
    share: "شیئر کریں",
    pinChat: "چیٹ پن کریں",
    unpinChat: "چیٹ ان پن کریں",
    renameChat: "چیٹ کا نام تبدیل کریں",
    deleteChat: "چیٹ حذف کریں",
    loading: "لوڈ ہو رہا ہے...",
    chooseLanguage: "اپنی پسندیدہ زبان منتخب کریں",
    chooseVoiceEngine: "معیاری اور پریمیم AI آوازوں کے درمیان انتخاب کریں",
    selectPremiumVoice: "ایک اعلیٰ معیار کا AI وائس ماڈل منتخب کریں",
    selectStandardVoice: "آلہ کی آواز منتخب کریں",
    autoSelect: "خودکار انتخاب (طے شدہ)",
    fenrirDesc: "فینریر (مضبوط، مستند مرد)",
    charonDesc: "کیرون (پرسکون، نپا تلا مرد)",
    puckDesc: "پک (دوستانہ، توانا مرد)",
  },
  as: {
    title: "নর্ড",
    subtitle: "এআই মেছেঞ্জাৰ, ই-মৈত্ৰী.",
    you: "আপুনি",
    copy: "কপি কৰক",
    copied: "কপি কৰা হৈছে",
    listen: "শুনক",
    stop: "বন্ধ কৰক",
    back: "উভতি যাওক",
    listenAgain: "আকৌ শুনক",
    speaking: "নর্ডয়ে কথা পাতি আছে...",
    listening: "নর্ডয়ে শুনি আছে...",
    thinking: "ভাবি আছে...",
    liveChatOn: "লাইভ ভইচ চেট অন আছে: অনুগ্ৰহ কৰি কওক",
    stopVoiceChat: "ভইচ চেট বন্ধ কৰক",
    startVoiceChat: "লাইভ ভইচ চেট আৰম্ভ কৰক",
    voiceTyping: "ভইচ টাইপিং",
    stopVoiceTyping: "ভইচ টাইপিং বন্ধ কৰক",
    speechNotSupported: "আপোনাৰ ব্ৰাউজাৰত স্পীচ ৰিকগনিচন চাপোৰ্ট নকৰে।",
    liveChat: "লাইভ চেট",
    typeMessage: "এটা মেছেজ টাইপ কৰক...",
    typeMessages: [
      "আপোনাৰ বাৰ্তা ইয়াত টাইপ কৰক",
      "মাইকত কথা পাতি বাৰ্তা পঠাওক",
      "গোলাপী ভইচ চেট বুটামৰ সৈতে লাইভ চেট কৰক",
    ],
    userNameLabel: "বটৰ নাম",
    userNamePlaceholder: "বটৰ নাম লিখক",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ছেটিংছ",
    language: "ভাষা (Language)",
    speechRate: "কথা কোৱাৰ হাৰ",
    adjustRate: "ভইচৰ হাৰ মিলাওক",
    speechPitch: "কথা কোৱাৰ পিটচ",
    adjustPitch: "ভইচৰ পিটচ মিলাওক",
    q1: "ডিজিটেল গৱৰ্নেন্স কি?",
    q2: "ত্ৰি-স্তৰীয় গাঁথনি বৰ্ণনা কৰক।",
    q3: "বুথ পৰিচালনা কেনেকৈ কাম কৰে?",
    q4: "পাৰিবাৰিক মিত্ৰতা আন্দোলন কি?",
    initialMessage:
      "নমস্কাৰ জেন-জি! ই-মৈত্ৰী পোৰ্টেললৈ স্বাগতম! কওক বন্ধু, মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ? আপোনাক কি তথ্য লাগে?",
    initialMessageWithName:
      "নমস্কাৰ জেন-জি!🙏 মই {botName}! ই-মৈত্ৰী পোৰ্টেললৈ স্বাগতম!✨ মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ! আপোনাক কি তথ্য লাগে?👋",
    errorTraffic:
      "ক্ষমা কৰিব, বৰ্তমান বহুত ট্ৰেফিক আছে বা কোটা শেষ হৈ গৈছে। অনুগ্ৰহ কৰি কিছু সময় পিছত পুনৰ চেষ্টা কৰক।",
    errorTech:
      "ক্ষমা কৰিব, এটা কাৰিকৰী সমস্যা হৈছে। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
    premiumQuotaExceeded:
      "প্ৰিমিয়াম ভইচ কোটা শেষ হৈছে। ষ্টেণ্ডাৰ্ড ভইচলৈ সলনি কৰা হৈছে।",
    newChat: "নতুন চেট",
    moreOptions: "অধিক বিকল্প",
    chattingIn: "চেটিং ইন",
    saveChat: "চেট ছেভ কৰক",
    enterChatName: "চেটৰ নাম দিয়ক...",
    cancel: "বাতিল কৰক",
    save: "ছেভ কৰক",
    chatHistory: "চেট হিষ্ট্ৰী",
    noSavedChats: "এতিয়ালৈকে কোনো ছেভ কৰা চেট নাই।",
    voiceEngine: "ভইচ ইঞ্জিন",
    standard: "ষ্টেণ্ডাৰ্ড",
    premium: "প্ৰিমিয়াম",
    clearChatHistory: "চেট হিষ্ট্ৰী চাফা কৰক",
    clearAll: "সকলো চাফা কৰক",
    areYouSureClear:
      "আপুনি নিশ্চিতনে যে আপুনি সকলো ছেভ কৰা চেট ডিলিট কৰিব বিচাৰে? ইয়াক ঘূৰাই আনিব নোৱাৰি।",
    uploadImage: "স্ক্ৰীণশ্বট / ছবি আপলোড কৰক",
    screenOn: "স্ক্ৰীণ অন",
    screenOff: "স্ক্ৰীণ অফ",
    stopGenerating: "জেনেৰেট কৰা বন্ধ কৰক",
    maxChatsError:
      "আপুনি কেৱল ১০ খন চেট ছেভ কৰিব পাৰিব। নতুন এখন ছেভ কৰিবলৈ অনুগ্ৰহ কৰি পুৰণি চেট ডিলিট কৰক।",
    edit: "সম্পাদনা কৰক",
    share: "শ্বেয়াৰ কৰক",
    pinChat: "চেট পিন কৰক",
    unpinChat: "চেট আনপিন কৰক",
    renameChat: "চেটৰ নাম সলনি কৰক",
    deleteChat: "চেট ডিলিট কৰক",
    loading: "ল'ড হৈ আছে...",
    chooseLanguage: "আপোনাৰ পছন্দৰ ভাষা বাছক",
    chooseVoiceEngine: "ষ্টেণ্ডাৰ্ড আৰু প্ৰিমিয়াম AI মাতৰ মাজত বাছক",
    selectPremiumVoice: "এটা উচ্চ-মানৰ AI ভইচ মডেল বাছক",
    selectStandardVoice: "এটা ডিভাইচ ভইচ বাছক",
    autoSelect: "স্বয়ংক্ৰিয়-বাছনি (ডিফল্ট)",
    fenrirDesc: "ফেনৰিৰ (শক্তিশালী, কৰ্তৃত্বশীল পুৰুষ)",
    charonDesc: "কেৰন (শান্ত, জোখ-মাখৰ পুৰুষ)",
    puckDesc: "পাক (বন্ধুত্বপূৰ্ণ, উদ্যমী পুৰুষ)",
  },
  ne: {
    title: "नॉर्ड",
    subtitle: "एआई मेसेन्जर, ई-मैत्री।",
    you: "तपाईं",
    copy: "कपी गर्नुहोस्",
    copied: "कपी गरियो",
    listen: "सुन्नुहोस्",
    stop: "रोक्नुहोस्",
    back: "पछाडि",
    listenAgain: "फेरि सुन्नुहोस्",
    speaking: "नॉर्ड बोल्दै हुनुहुन्छ...",
    listening: "नॉर्ड सुन्दै हुनुहुन्छ...",
    thinking: "सोच्दै हुनुहुन्छ...",
    liveChatOn: "लाइभ भ्वाइस च्याट अन छ: कृपया बोल्नुहोस्",
    stopVoiceChat: "भ्वाइस च्याट रोक्नुहोस्",
    startVoiceChat: "लाइभ भ्वाइस च्याट सुरु गर्नुहोस्",
    voiceTyping: "भ्वाइस टाइपिङ",
    stopVoiceTyping: "भ्वाइस टाइपिङ रोक्नुहोस्",
    speechNotSupported: "यस ब्राउजरमा स्पीच रिकग्निसन समर्थित छैन।",
    liveChat: "लाइभ च्याट",
    typeMessage: "सन्देश टाइप गर्नुहोस्...",
    typeMessages: [
      "तपाईंको सन्देश यहाँ टाइप गर्नुहोस्",
      "माइकमा बोलेर सन्देश पठाउनुहोस्",
      "गुलाबी भ्वाइस च्याट बटनको साथ लाइभ च्याट गर्नुहोस्",
    ],
    userNameLabel: "बोटको नाम",
    userNamePlaceholder: "बोटको नाम प्रविष्ट गर्नुहोस्",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफर्म द्वारा संचालित।",
    settings: "सेटिङहरू",
    language: "भाषा",
    speechRate: "बोल्ने गति",
    adjustRate: "आवाजको गति समायोजन गर्नुहोस्",
    speechPitch: "आवाजको पिच",
    adjustPitch: "आवाजको पिच समायोजन गर्नुहोस्",
    q1: "डिजिटल गभर्नेन्स भनेको के हो?",
    q2: "त्रि-स्तरीय संरचना व्याख्या गर्नुहोस्।",
    q3: "बुथ व्यवस्थापनले कसरी काम गर्छ?",
    q4: "पारिवारिक गठबन्धन आन्दोलन के हो?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टलमा स्वागत छ! भन्नुहोस् साथी, म तपाईंलाई कसरी मद्दत गर्न सक्छु? तपाईंलाई के जानकारी चाहिन्छ?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 म {botName} हुँ! ई-मैत्री पोर्टलमा स्वागत छ!✨ म तपाईंलाई कसरी मद्दत गर्न सक्छु! तपाईंलाई के जानकारी चाहिन्छ?👋",
    errorTraffic:
      "माफ गर्नुहोस्, अहिले धेरै ट्राफिक छ वा कोटा सकिएको छ। कृपया पछि फेरि प्रयास गर्नुहोस्।",
    errorTech:
      "माफ गर्नुहोस्, प्राविधिक समस्या आयो। कृपया फेरि प्रयास गर्नुहोस्।",
    premiumQuotaExceeded: "प्रिमियम भ्वाइस कोटा नाघ्यो। मानक आवाजमा फर्किदै।",
    newChat: "नयाँ च्याट",
    moreOptions: "थप विकल्पहरू",
    chattingIn: "च्याट गर्दै",
    saveChat: "च्याट सेभ गर्नुहोस्",
    enterChatName: "च्याटको नाम प्रविष्ट गर्नुहोस्...",
    cancel: "रद्द गर्नुहोस्",
    save: "सेभ गर्नुहोस्",
    chatHistory: "च्याट इतिहास",
    noSavedChats: "कुनै सेभ गरिएको च्याट छैन।",
    voiceEngine: "भ्वाइस इन्जिन",
    standard: "मानक",
    premium: "प्रिमियम",
    clearChatHistory: "च्याट इतिहास खाली गर्नुहोस्",
    clearAll: "सबै खाली गर्नुहोस्",
    areYouSureClear:
      "के तपाईं पक्का सबै सेभ गरिएका च्याटहरू मेटाउन चाहनुहुन्छ? यो पूर्ववत गर्न सकिँदैन।",
    uploadImage: "स्क्रिनसट / तस्विर अपलोड गर्नुहोस्",
    screenOn: "स्क्रिन अन",
    screenOff: "स्क्रिन अफ",
    stopGenerating: "उत्पन्न गर्न रोक्नुहोस्",
    maxChatsError:
      "तपाईं १० वटा च्याट मात्र सेभ गर्न सक्नुहुन्छ। नयाँ सेभ गर्न कृपया पुरानो च्याट मेटाउनुहोस्।",
    edit: "सम्पादन गर्नुहोस्",
    share: "सेयर गर्नुहोस्",
    pinChat: "च्याट पिन गर्नुहोस्",
    unpinChat: "च्याट अनपिन गर्नुहोस्",
    renameChat: "च्याटको नाम फेर्नुहोस्",
    deleteChat: "च्याट मेटाउनुहोस्",
    loading: "लोड हुँदैछ...",
    chooseLanguage: "आफ्नो मनपर्ने भाषा छान्नुहोस्",
    chooseVoiceEngine: "मानक र प्रिमियम एआई आवाजहरू बीच छान्नुहोस्",
    selectPremiumVoice: "उच्च गुणस्तरको एआई भ्वाइस मोडेल छान्नुहोस्",
    selectStandardVoice: "उपकरणको आवाज छान्नुहोस्",
    autoSelect: "स्वतः छान्नुहोस् (डिफल्ट)",
    fenrirDesc: "फेनरिर (बलियो, आधिकारिक पुरुष)",
    charonDesc: "क्यारोन (शान्त, नापिएको पुरुष)",
    puckDesc: "पक (मैत्रीपूर्ण, ऊर्जावान पुरुष)",
  },
  mai: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री।",
    you: "अहाँ",
    copy: "कॉपी करू",
    copied: "कॉपी भेल",
    listen: "सुनू",
    stop: "रोकू",
    back: "पाछाँ",
    listenAgain: "फेर सँ सुनू",
    speaking: "नॉर्ड बाजि रहल छथि...",
    listening: "नॉर्ड सुनि रहल छथि...",
    thinking: "सोचि रहल छथि...",
    liveChatOn: "लाइव वॉयस चैट ऑन अछि: कृपया बाजू",
    stopVoiceChat: "वॉयस चैट रोकू",
    startVoiceChat: "लाइव वॉयस चैट शुरू करू",
    voiceTyping: "वॉयस टाइपिंग",
    stopVoiceTyping: "वॉयस टाइपिंग रोकू",
    speechNotSupported: "ई ब्राउजर मे स्पीच रिकग्निशन समर्थित नहि अछि।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करू...",
    typeMessages: [
      "अपन संदेश एतय टाइप करू",
      "माइक सँ बाजि कऽ संदेश पठाउ",
      "गुलाबी वॉयस चैट बटन सँ लाइव चैट करू",
    ],
    userNameLabel: "बॉट के नाम",
    userNamePlaceholder: "बॉट के नाम दर्ज करू",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफॉर्म द्वारा संचालित।",
    settings: "सेटिंग्स",
    language: "भाषा",
    speechRate: "बाजै के गति",
    adjustRate: "आवाज के गति सेट करू",
    speechPitch: "आवाज के पिच",
    adjustPitch: "आवाज के पिच सेट करू",
    q1: "डिजिटल गवर्नेंस की थिक?",
    q2: "त्रि-स्तरीय संरचना केँ बुझाउ।",
    q3: "बूथ प्रबंधन कोना काज करैत अछि?",
    q4: "पारिवारिक गठबंधन आंदोलन की थिक?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टल मे अहाँक स्वागत अछि! कहू मित्र, हम अहाँक कोना मदद क सकैत छी? अहाँ केँ की जानकारी चाही?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 हम {botName} छी! ई-मैत्री पोर्टल मे अहाँक स्वागत अछि!✨ हम अहाँक कोना मदद क सकैत छी! अहाँ केँ की जानकारी चाही?👋",
    errorTraffic:
      "क्षमा करू, अखन बहुत बेसी ट्रैफिक अछि वा कोटा खतम भ गेल अछि। कृपया बाद मे फेर सँ प्रयास करू।",
    errorTech: "क्षमा करू, तकनीकी समस्या आबि गेल। कृपया फेर सँ प्रयास करू।",
    premiumQuotaExceeded:
      "प्रीमियम वॉयस कोटा पार भ गेल। मानक आवाज पर वापस जा रहल अछि।",
    newChat: "नव चैट",
    moreOptions: "आरो विकल्प",
    chattingIn: "चैट क रहल छी",
    saveChat: "चैट सेव करू",
    enterChatName: "चैट के नाम दर्ज करू...",
    cancel: "रद्द करू",
    save: "सेव करू",
    chatHistory: "चैट इतिहास",
    noSavedChats: "कोनो सेव कएल चैट नहि अछि।",
    voiceEngine: "वॉयस इंजन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चैट इतिहास साफ करू",
    clearAll: "सब साफ करू",
    areYouSureClear:
      "की अहाँ पक्का सब सेव कएल चैट डिलीट करय चाहैत छी? एकरा वापस नहि कएल जा सकैत अछि।",
    uploadImage: "स्क्रीनशॉट / फोटो अपलोड करू",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "उत्पन्न करब रोकू",
    maxChatsError:
      "अहाँ केवल 10 टा चैट सेव क सकैत छी। नव सेव करय लेल कृपया पुरान चैट डिलीट करू।",
    edit: "संपादित करू",
    share: "शेयर करू",
    pinChat: "चैट पिन करू",
    unpinChat: "चैट अनपिन करू",
    renameChat: "चैट के नाम बदलू",
    deleteChat: "चैट डिलीट करू",
    loading: "लोड भ रहल अछि...",
    chooseLanguage: "अपन पसंदीदा भाषा चुनू",
    chooseVoiceEngine: "मानक आ प्रीमियम एआई आवाज के बीच चुनू",
    selectPremiumVoice: "एगो उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनू",
    selectStandardVoice: "डिवाइस के आवाज चुनू",
    autoSelect: "स्वतः चुनू (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपल-तौल्ल पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)",
  },
  sd: {
    title: "نارڊ",
    subtitle: "اي آءِ ميسينجر، اي-ميتري.",
    you: "توهان",
    copy: "ڪاپي ڪريو",
    copied: "ڪاپي ٿي ويو",
    listen: "ٻڌو",
    stop: "روڪيو",
    back: "واپس",
    listenAgain: "ٻيهر ٻڌو",
    speaking: "نارڊ ڳالهائي رهيو آهي...",
    listening: "نارڊ ٻڌي رهيو آهي...",
    thinking: "سوچي رهيو آهي...",
    liveChatOn: "لائيو وائس چيٽ آن آهي: مهرباني ڪري ڳالهايو",
    stopVoiceChat: "وائس چيٽ روڪيو",
    startVoiceChat: "لائيو وائس چيٽ شروع ڪريو",
    voiceTyping: "وائس ٽائپنگ",
    stopVoiceTyping: "وائس ٽائپنگ روڪيو",
    speechNotSupported: "هن برائوزر ۾ اسپيچ ريڪگنيشن سپورٽ ناهي.",
    liveChat: "لائيو چيٽ",
    typeMessage: "هڪ پيغام لکو...",
    typeMessages: [
      "پنهنجو پيغام هتي ٽائپ ڪريو",
      "مائڪ ۾ ڳالهائي پيغام موڪليو",
      "گلابي وائس چيٽ بٽڻ سان لائيو چيٽ ڪريو",
    ],
    userNameLabel: "بوٽ جو نالو",
    userNamePlaceholder: "بوٽ جو نالو داخل ڪريو",
    poweredBy: "اي-ميتري ڊجيٽل پليٽ فارم پاران هلندڙ.",
    settings: "سيٽنگون",
    language: "ٻولي",
    speechRate: "ڳالهائڻ جي رفتار",
    adjustRate: "آواز جي رفتار سيٽ ڪريو",
    speechPitch: "آواز جي پچ",
    adjustPitch: "آواز جي پچ سيٽ ڪريو",
    q1: "ڊجيٽل گورننس ڇا آهي؟",
    q2: "ٽي-سطحي ڍانچي جي وضاحت ڪريو.",
    q3: "بوٿ مئنيجمينٽ ڪيئن ڪم ڪندو آهي؟",
    q4: "فيملي الائنس موومينٽ ڇا آهي؟",
    initialMessage:
      "هيلو جين-جي! اي-ميتري پورٽل ۾ ڀليڪار! ٻڌايو دوست، مان توهان جي ڪيئن مدد ڪري سگهان ٿو؟ توهان کي ڪهڙي ڄاڻ گهرجي؟",
    initialMessageWithName:
      "هيلو جين-جي!🙏 مان {botName} آهيان! اي-ميتري پورٽل ۾ ڀليڪار!✨ مان توهان جي ڪيئن مدد ڪري سگهان ٿو! توهان کي ڪهڙي ڄاڻ گهرجي؟👋",
    errorTraffic:
      "معاف ڪجو، هن وقت تمام گهڻي ٽرئفڪ آهي يا ڪوٽا ختم ٿي وئي آهي. مهرباني ڪري بعد ۾ ٻيهر ڪوشش ڪريو.",
    errorTech:
      "معاف ڪجو، هڪ ٽيڪنيڪل مسئلو پيش آيو. مهرباني ڪري ٻيهر ڪوشش ڪريو.",
    premiumQuotaExceeded:
      "پريميئم وائس ڪوٽا ختم ٿي وئي. معياري آواز ڏانهن واپس.",
    newChat: "نئين چيٽ",
    moreOptions: "وڌيڪ آپشن",
    chattingIn: "چيٽنگ ۾",
    saveChat: "چيٽ سيو ڪريو",
    enterChatName: "چيٽ جو نالو داخل ڪريو...",
    cancel: "رد ڪريو",
    save: "سيو ڪريو",
    chatHistory: "چيٽ جي تاريخ",
    noSavedChats: "ڪا به سيو ٿيل چيٽ ناهي.",
    voiceEngine: "وائس انجڻ",
    standard: "معياري",
    premium: "پريميئم",
    clearChatHistory: "چيٽ جي تاريخ صاف ڪريو",
    clearAll: "سڀ صاف ڪريو",
    areYouSureClear:
      "ڇا توهان پڪ سان سڀ سيو ٿيل چيٽ ڊليٽ ڪرڻ چاهيو ٿا؟ هن کي واپس نٿو ڪري سگهجي.",
    uploadImage: "اسڪرين شاٽ / تصوير اپلوڊ ڪريو",
    screenOn: "اسڪرين آن",
    screenOff: "اسڪرين آف",
    stopGenerating: "ٺاهڻ روڪيو",
    maxChatsError:
      "توهان صرف 10 چيٽس تائين سيو ڪري سگهو ٿا. نئين سيو ڪرڻ لاءِ مهرباني ڪري پراڻي چيٽ ڊليٽ ڪريو.",
    edit: "ايڊٽ ڪريو",
    share: "شيئر ڪريو",
    pinChat: "چيٽ پن ڪريو",
    unpinChat: "چيٽ ان پن ڪريو",
    renameChat: "چيٽ جو نالو تبديل ڪريو",
    deleteChat: "چيٽ ڊليٽ ڪريو",
    loading: "لوڊ ٿي رهيو آهي...",
    chooseLanguage: "پنهنجي پسنديده ٻولي چونڊيو",
    chooseVoiceEngine: "معياري ۽ پريميئم اي آءِ آوازن جي وچ ۾ چونڊيو",
    selectPremiumVoice: "هڪ اعليٰ معيار جو اي آءِ وائس ماڊل چونڊيو",
    selectStandardVoice: "ڊوائيس جو آواز چونڊيو",
    autoSelect: "خودڪار چونڊ (ڊفالٽ)",
    fenrirDesc: "فينرير (مضبوط، مستند مرد)",
    charonDesc: "ڪيرون (پرسڪون، ماپيل مرد)",
    puckDesc: "پڪ (دوستانه، توانائي وارو مرد)",
  },
  kok: {
    title: "नॉर्ड",
    subtitle: "एआय मेसेंजर, ई-मैत्री.",
    you: "तुमी",
    copy: "कॉपी करात",
    copied: "कॉपी केले",
    listen: "आयकात",
    stop: "रावयात",
    back: "फाटीं",
    listenAgain: "परत आयकात",
    speaking: "नॉर्ड उलयता...",
    listening: "नॉर्ड आयकता...",
    thinking: "विचार करता...",
    liveChatOn: "लायव्ह व्हॉइस चॅट चालू आसा: उपकार करून उलय",
    stopVoiceChat: "व्हॉइस चॅट रावयात",
    startVoiceChat: "लायव्ह व्हॉइस चॅट सुरू करात",
    voiceTyping: "व्हॉइस टायपिंग",
    stopVoiceTyping: "व्हॉइस टायपिंग रावयात",
    speechNotSupported: "ह्या ब्राउझरांत स्पीच रिकग्निशन समर्थित ना.",
    liveChat: "लायव्ह चॅट",
    typeMessage: "संदेश टायप करात...",
    typeMessages: [
      "तुमचो संदेश हांगा टायप करात",
      "मायकांत उलोवन संदेश धाडात",
      "गुलाबी व्हॉइस चॅट बटणा वांगडा लायव्ह चॅट करात",
    ],
    userNameLabel: "बॉटचें नांव",
    userNamePlaceholder: "बॉटचें नांव बरोवचें",
    poweredBy: "ई-मैत्री डिजिटल प्लॅटफॉर्मान संचालित.",
    settings: "सेटिंग्ज",
    language: "भास",
    speechRate: "उलोवपाची गती",
    adjustRate: "आवाजाची गती अ‍ॅडजस्ट करात",
    speechPitch: "आवाजाची पीच",
    adjustPitch: "आवाजाची पीच अ‍ॅडजस्ट करात",
    q1: "डिजिटल गव्हर्नन्स म्हणल्यार किदें?",
    q2: "त्रि-स्तरीय रचना स्पश्ट करात.",
    q3: "बूथ मॅनेजमेंट कशें काम करता?",
    q4: "फॅमिली अलायंस मूव्हमेंट किदें आसा?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टलांत येवकार! सांगा इश्टा, हांव तुमची कशी मजत करूं शकता? तुमकां खंयची म्हायती जाय?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 हांव {botName}! ई-मैत्री पोर्टलांत येवकार!✨ हांव तुमची कशी मजत करूं शकता! तुमकां खंयची म्हायती जाय?👋",
    errorTraffic:
      "माफ करात, सद्या खूब ट्रॅफिक आसा वा कोटा सोंपला. उपकार करून मागीर परत यत्न करात.",
    errorTech: "माफ करात, तांत्रिक अडचण आयल्या. उपकार करून परत यत्न करात.",
    premiumQuotaExceeded:
      "प्रीमियम व्हॉइस कोटा सोंपला. स्टँडर्ड आवाजाचेर परत वता.",
    newChat: "नवी चॅट",
    moreOptions: "आनीक पर्याय",
    chattingIn: "चॅटिंग करता",
    saveChat: "चॅट सेव्ह करात",
    enterChatName: "चॅटीचें नांव दियात...",
    cancel: "रद्द करात",
    save: "सेव्ह करात",
    chatHistory: "चॅट इतिहास",
    noSavedChats: "खंयचीच चॅट सेव्ह करूंक ना.",
    voiceEngine: "व्हॉइस इंजिन",
    standard: "स्टँडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चॅट इतिहास निवळ करात",
    clearAll: "सगळें निवळ करात",
    areYouSureClear:
      "तुमी खऱ्यानीच सगळ्यो सेव्ह केल्लो चॅटी डिलीट करूंक सोदतात? हें परत मेळचें ना.",
    uploadImage: "स्क्रीनशॉट / चित्र अपलोड करात",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "तयार करप रावयात",
    maxChatsError:
      "तुमी फकत 10 चॅटी सेव्ह करूंक शकतात. नवी सेव्ह करपा खातीर उपकार करून पोरनी चॅट डिलीट करात.",
    edit: "संपादित करात",
    share: "शेअर करात",
    pinChat: "चॅट पिन करात",
    unpinChat: "चॅट अनपिन करात",
    renameChat: "चॅटीचें नांव बदलात",
    deleteChat: "चॅट डिलीट करात",
    loading: "लोड जाता...",
    chooseLanguage: "तुमची आवडटी भास वेंचून काडात",
    chooseVoiceEngine: "स्टँडर्ड आनी प्रीमियम एआय आवाजां मदीं वेंचून काडात",
    selectPremiumVoice: "उच्च दर्जाचें एआय व्हॉइस मॉडेल वेंचून काडात",
    selectStandardVoice: "डिव्हायसाचो आवाज वेंचून काडात",
    autoSelect: "स्वयंचलित वेंचून काडात (डिफॉल्ट)",
    fenrirDesc: "फेनरिर (घट्ट, अधिकृत दादलो)",
    charonDesc: "कॅरॉन (शांत, मेजिल्लो दादलो)",
    puckDesc: "पक (इश्टागतीचो, ऊर्जावान दादलो)",
  },
  doi: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री।",
    you: "तुस",
    copy: "कापी करो",
    copied: "कापी कीता",
    listen: "सुनो",
    stop: "रोको",
    back: "पिच्छें",
    listenAgain: "परतियै सुनो",
    speaking: "नॉर्ड गल्ल करदा ऐ...",
    listening: "नॉर्ड सुनदा ऐ...",
    thinking: "सोचदा ऐ...",
    liveChatOn: "लाइव वॉयस चैट ऑन ऐ: किरपा करियै गल्ल करो",
    stopVoiceChat: "वॉयस चैट रोको",
    startVoiceChat: "लाइव वॉयस चैट शुरू करो",
    voiceTyping: "वॉयस टाइपिंग",
    stopVoiceTyping: "वॉयस टाइपिंग रोको",
    speechNotSupported: "इस ब्राउज़र च स्पीच रिकग्निशन समर्थित नेईं ऐ।",
    liveChat: "लाइव चैट",
    typeMessage: "सनेआ टाइप करो...",
    typeMessages: [
      "अपना सनेआ इत्थै टाइप करो",
      "माइक च बोलियै सनेआ भेजो",
      "गुलाबी वायस चैट बटन कन्नै लाइव चैट करो",
    ],
    userNameLabel: "बॉट दा नां",
    userNamePlaceholder: "बॉट दा नां दर्ज करो",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफॉर्म राहें संचालित।",
    settings: "सेटिंगां",
    language: "भाशा",
    speechRate: "बोलने दी गति",
    adjustRate: "अवाज दी गति सेट करो",
    speechPitch: "अवाज दी पिच",
    adjustPitch: "अवाज दी पिच सेट करो",
    q1: "डिजिटल गवर्नेंस केह् ऐ?",
    q2: "त्रि-स्तरीय संरचना दी व्याख्या करो।",
    q3: "बूथ मैनेजमेंट कियां कम्म करदा ऐ?",
    q4: "फैमिली अलायंस मूवमेंट केह् ऐ?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री पोर्टल च तुंदा स्वागत ऐ! दस्सो दोस्त, मैं तुंदी केह् मदद करी सकनां? तुसेंगी केह् जानकारी लोड़िदी ऐ?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 मैं {botName} आं! ई-मैत्री पोर्टल च तुंदा स्वागत ऐ!✨ मैं तुंदी केह् मदद करी सकनां! तुसेंगी केह् जानकारी लोड़िदी ऐ?👋",
    errorTraffic:
      "माफ करना, इसलै मते लोक इस्तेमाल करदे न जां कोटा मुक्की गेआ ऐ। किरपा करियै बाद च परतियै कोशिश करो।",
    errorTech:
      "माफ करना, कोई तकनीकी खराबी आई गेई ऐ। किरपा करियै परतियै कोशिश करो।",
    premiumQuotaExceeded:
      "प्रीमियम वॉयस कोटा मुक्की गेआ ऐ। स्टैंडर्ड अवाज पर वापस जा करदे आं।",
    newChat: "नमीं चैट",
    moreOptions: "होर विकल्प",
    chattingIn: "चैट करदे आं",
    saveChat: "चैट सेव करो",
    enterChatName: "चैट दा नां दर्ज करो...",
    cancel: "रद्द करो",
    save: "सेव करो",
    chatHistory: "चैट दा इतिहास",
    noSavedChats: "कोई सेव कीती दी चैट नेईं ऐ।",
    voiceEngine: "वॉयस इंजन",
    standard: "स्टैंडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चैट दा इतिहास साफ करो",
    clearAll: "सब साफ करो",
    areYouSureClear:
      "के तुस पक्का सब सेव कीती दी चैट डिलीट करना चांदे ओ? इसगी वापस नेईं कीता जाई सकदा।",
    uploadImage: "स्क्रीनशॉट / फोटो अपलोड करो",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "बनाना रोको",
    maxChatsError:
      "तुस सिर्फ 10 चैट सेव करी सकदे ओ। नमीं सेव करने लेई किरपा करियै पुरानी चैट डिलीट करो।",
    edit: "संपादित करो",
    share: "शेयर करो",
    pinChat: "चैट पिन करो",
    unpinChat: "चैट अनपिन करो",
    renameChat: "चैट दा नां बदलो",
    deleteChat: "चैट डिलीट करो",
    loading: "लोड होआ करदा ऐ...",
    chooseLanguage: "अपनी मनपसंद भाशा चुनो",
    chooseVoiceEngine: "स्टैंडर्ड ते प्रीमियम एआई अवाजें बिच्च चुनो",
    selectPremiumVoice: "इक उच्च गुणवत्ता आह् ला एआई वॉयस मॉडल चुनो",
    selectStandardVoice: "डिवाइस दी अवाज चुनो",
    autoSelect: "स्वतः चुनो (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक मर्द)",
    charonDesc: "कैरन (शांत, नपेआ-तुलेआ मर्द)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान मर्द)",
  },
  ks: {
    title: "نارڈ",
    subtitle: "اے آئی میسنجر، ای-میتری۔",
    you: "تُہۍ",
    copy: "کأپی کٔرِو",
    copied: "کأپی گٔیہ",
    listen: "بوزِو",
    stop: "رُکِو",
    back: "واپس",
    listenAgain: "دوبارٕ بوزِو",
    speaking: "نارڈ چھُ بولان...",
    listening: "نارڈ چھُ بوزان...",
    thinking: "سوچان چھُ...",
    liveChatOn: "لائیو وائس چیٹ چھُ آن: مہربٲنی کٔرِتھ کَتھ کٔرِو",
    stopVoiceChat: "وائس چیٹ رُکٲوِو",
    startVoiceChat: "لائیو وائس چیٹ شۆروٗع کٔرِو",
    voiceTyping: "وائس ٹائپنگ",
    stopVoiceTyping: "وائس ٹائپنگ رُکٲوِو",
    speechNotSupported: "یَتھ براؤزرس مَنٛز چھُنٕہ سپیچ رِکگنِشن سپورٹ۔",
    liveChat: "لائیو چیٹ",
    typeMessage: "میسج ٹائپ کٔرِو...",
    typeMessages: [
      "پَنُن میسج یَتھ جاے ٹائپ کٔرِو",
      "مائکَس مَنٛز کَتھ کٔرِتھ میسج دِیِو",
      "گُلابی وائس چیٹ بَٹُن سٟتۍ لائیو چیٹ کٔرِو",
    ],
    userNameLabel: "بوٹُن ناو",
    userNamePlaceholder: "بوٹُن ناو دَرٕج کٔرِو",
    poweredBy: "ای-میتری ڈیجیٹل پلیٹ فارم دٔسۍ چلاونہٕ یِوان۔",
    settings: "سیٹنگز",
    language: "زبان",
    speechRate: "کَتھ کرنٕچ رفتار",
    adjustRate: "آوازٕچ رفتار سیٹ کٔرِو",
    speechPitch: "آوازٕچ پِچ",
    adjustPitch: "آوازٕچ پِچ سیٹ کٔرِو",
    q1: "ڈیجیٹل گورننس کیاہ چھُ؟",
    q2: "ترٛے سطحٕچ ساختٕچ وضاحت کٔرِو۔",
    q3: "بوتھ مینجمنٹ کِتھ کٔنۍ چھُ کٲم کران؟",
    q4: "فیملی الائنس موومنٹ کیاہ چھُ؟",
    initialMessage:
      "ہیلو جین-جی! ای-میتری پورٹلس مَنٛز خۄش آمدید! ونِو دوست، بہٕ کِتھ کٔنۍ ہیکہٕ تُہنٛز مَدَتھ کٔرِتھ؟ تُہۍ کیاہ مولوٗمات چھِو یژھان؟",
    initialMessageWithName:
      "ہیلو جین-جی!🙏 بہٕ چھُس {botName}! ای-میتری پورٹلس مَنٛز خۄش آمدید!✨ بہٕ کِتھ کٔنۍ ہیکہٕ تُہنٛز مَدَتھ کٔرِتھ! تُہۍ کیاہ مولوٗمات چھِو یژھان؟👋",
    errorTraffic:
      "معاف کٔرِو، یِمہِ وِزِ چھُ واریاہ ٹریفک یا کوٹا چھُ خَتٕم گومُت۔ مہربٲنی کٔرِتھ پَتہٕ دوبارٕ کوٗشِش کٔرِو۔",
    errorTech:
      "معاف کٔرِو، اَکھ تکنیکی مسلٕہ آو۔ مہربٲنی کٔرِتھ دوبارٕ کوٗشِش کٔرِو۔",
    premiumQuotaExceeded:
      "پریمیم وائس کوٹا چھُ خَتٕم گومُت۔ سٹینڈرڈ آوازس پؠٹھ واپس گژھان۔",
    newChat: "نۆو چیٹ",
    moreOptions: "مزید آپشن",
    chattingIn: "چیٹنگ کران",
    saveChat: "چیٹ سیو کٔرِو",
    enterChatName: "چیٹُک ناو دَرٕج کٔرِو...",
    cancel: "کینسل کٔرِو",
    save: "سیو کٔرِو",
    chatHistory: "چیٹ ہسٹری",
    noSavedChats: "کاہ تِہ سیو کٔرمٕژ چیٹ چھِنہٕ۔",
    voiceEngine: "وائس اِنجن",
    standard: "سٹینڈرڈ",
    premium: "پریمیم",
    clearChatHistory: "چیٹ ہسٹری صاف کٔرِو",
    clearAll: "سٲری صاف کٔرِو",
    areYouSureClear:
      "کیاہ تُہۍ چھِو پزۍ پٲٹھۍ سٲری سیو کٔرمٕژ چیٹ ڈیلیٹ کرُن یژھان؟ یہِ چھُنٕہ واپس یِوان۔",
    uploadImage: "سکرین شاٹ / فوٹو اَپلوڈ کٔرِو",
    screenOn: "سکرین آن",
    screenOff: "سکرین آف",
    stopGenerating: "بناون رُکٲوِو",
    maxChatsError:
      "تُہۍ ہیکِو صِرِف 10 چیٹ سیو کٔرِتھ۔ نٔو سیو کرنٕہ خٲطرٕ مہربٲنی کٔرِتھ پرٲنۍ چیٹ ڈیلیٹ کٔرِو۔",
    edit: "ایڈٹ کٔرِو",
    share: "شیئر کٔرِو",
    pinChat: "چیٹ پِن کٔرِو",
    unpinChat: "چیٹ اَن پِن کٔرِو",
    renameChat: "چیٹُک ناو بَدلٲوِو",
    deleteChat: "چیٹ ڈیلیٹ کٔرِو",
    loading: "لوڈ گژھان...",
    chooseLanguage: "پَنٕنۍ پسندیدٕ زبان چُنِو",
    chooseVoiceEngine: "سٹینڈرڈ تہٕ پریمیم اے آئی آوازن مَنٛز چُنِو",
    selectPremiumVoice: "اَکھ اعلیٰ معیارُک اے آئی وائس ماڈل چُنِو",
    selectStandardVoice: "ڈیوائسٕچ آواز چُنِو",
    autoSelect: "خودکار چُنِو (ڈیفالٹ)",
    fenrirDesc: "فینریر (مضبوط، مستند مرد)",
    charonDesc: "کیرون (پرسکون، نَپِتھ مرد)",
    puckDesc: "پک (دوستانہ، توانا مرد)",
  },
  sa: {
    title: "नॉर्ड",
    subtitle: "एआई-सहायकः, ई-मैत्री।",
    you: "भवान्",
    copy: "प्रतिलिपिं करोतु",
    copied: "प्रतिलिपिः कृता",
    listen: "शृणोतु",
    stop: "स्थगयतु",
    back: "पृष्ठतः",
    listenAgain: "पुनः शृणोतु",
    speaking: "नॉर्ड वदति...",
    listening: "नॉर्ड शृणोति...",
    thinking: "चिन्तयति...",
    liveChatOn: "सजीव-संवादः आरब्धः: कृपया वदतु",
    stopVoiceChat: "ध्वनि-संवादं स्थगयतु",
    startVoiceChat: "सजीव-ध्वनि-संवादम् आरभताम्",
    voiceTyping: "ध्वनि-टङ्कणम्",
    stopVoiceTyping: "ध्वनि-टङ्कणं स्थगयतु",
    speechNotSupported: "अस्मिन् ब्राउजर् मध्ये भाषण-अभिज्ञानं न समर्थितम्।",
    liveChat: "सजीव-संवादः",
    typeMessage: "सन्देशं टङ्कयतु...",
    typeMessages: [
      "स्वसन्देशम् अत्र टङ्कयतु",
      "ध्वनिग्राहके उक्त्वा सन्देशं प्रेषयतु",
      "पाटलवर्णस्य ध्वनि-संवाद-गुण्डेन सजीव-संवादं करोतु",
    ],
    userNameLabel: "बॉट-नाम",
    userNamePlaceholder: "बॉट-नाम लिखतु",
    poweredBy: "ई-मैत्री डिजिटल-मञ्चेन सञ्चालितम्।",
    settings: "सेटिंग्स्",
    language: "भाषा",
    speechRate: "भाषणस्य गतिः",
    adjustRate: "ध्वनेः गतिं व्यवस्थापयतु",
    speechPitch: "स्वरः",
    adjustPitch: "ध्वनेः स्वरं व्यवस्थापयतु",
    q1: "डिजिटल-गवर्नेंस किम् अस्ति?",
    q2: "त्रि-स्तरीय-संरचनां स्पष्टीकरोतु।",
    q3: "बूथ-प्रबन्धनं कथं कार्यं करोति?",
    q4: "पारिवारिक-गठबन्धन-आन्दोलनं किम् अस्ति?",
    initialMessage:
      "नमस्ते जेन-जी! ई-मैत्री-पोर्टल् मध्ये भवतः स्वागतम्! वदतु मित्र, अहं भवतः कथं साहाय्यं कर्तुं शक्नोमि? भवान् काम् सूचनाम् इच्छति?",
    initialMessageWithName:
      "नमस्ते जेन-जी!🙏 अहं {botName} अस्मि! ई-मैत्री-पोर्टल् मध्ये भवतः स्वागतम्!✨ अहं भवतः कथं साहाय्यं कर्तुं शक्नोमि! भवान् काम् सूचनाम् इच्छति?👋",
    errorTraffic:
      "क्षम्यताम्, इदानीम् अत्यधिकः यातायात-भारः अस्ति अथवा कोटा समाप्तः। कृपया किञ्चित्कालानन्तरं पुनः प्रयतताम्।",
    errorTech: "क्षम्यताम्, काचित् तकनीकी समस्या अस्ति। कृपया पुनः प्रयतताम्।",
    premiumQuotaExceeded:
      "प्रीमियम-ध्वनि-कोटा समाप्तः। सामान्य-ध्वनौ प्रत्यागच्छति।",
    newChat: "नूतनः संवादः",
    moreOptions: "अधिक-विकल्पाः",
    chattingIn: "संवादः चलति",
    saveChat: "संवादं रक्षतु",
    enterChatName: "संवादस्य नाम लिखतु...",
    cancel: "रद्द करोतु",
    save: "रक्षतु",
    chatHistory: "संवाद-इतिहासः",
    noSavedChats: "कोऽपि रक्षितः संवादः नास्ति।",
    voiceEngine: "ध्वनि-इञ्जिनम्",
    standard: "सामान्यम्",
    premium: "प्रीमियम",
    clearChatHistory: "संवाद-इतिहासं मार्जयेत्",
    clearAll: "सर्वं मार्जयेत्",
    areYouSureClear:
      "किं भवान् सर्वान् रक्षितान् संवादान् मार्जयितुम् इच्छति? एतत् पुनः प्राप्तुं न शक्यते।",
    uploadImage: "चित्रं / स्क्रीनशॉट् अपलोड् करोतु",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "निर्माणं स्थगयतु",
    maxChatsError:
      "भवान् केवलं १० संवादान् रक्षितुं शक्नोति। नूतनं रक्षितुं कृपया पुरातनं संवादं मार्जयेत्।",
    edit: "सम्पादयतु",
    share: "साझा करोतु",
    pinChat: "संवादं पिन करोतु",
    unpinChat: "संवादम् अनपिन करोतु",
    renameChat: "संवादस्य नाम परिवर्तयतु",
    deleteChat: "संवादं मार्जयेत्",
    loading: "लोड् भवति...",
    chooseLanguage: "स्वस्य इष्टतमां भाषां चिनोतु",
    chooseVoiceEngine: "सामान्य-प्रीमियम-एआई-ध्वन्योः मध्ये चिनोतु",
    selectPremiumVoice: "उच्च-गुणवत्तायुक्तम् एआई-ध्वनि-प्रतिरूपं चिनोतु",
    selectStandardVoice: "यन्त्रस्य ध्वनिं चिनोतु",
    autoSelect: "स्वतः चिनोतु (डिफॉल्ट्)",
    fenrirDesc: "फेनरिर (दृढः, आधिकारिकः पुरुषः)",
    charonDesc: "कैरन (शान्तः, गम्भीरः पुरुषः)",
    puckDesc: "पक (मैत्रीपूर्णः, ऊर्जावान् पुरुषः)",
  },
  sat: {
    title: "ᱱᱚᱨᱰ",
    subtitle: "ᱮᱟᱭᱤ ᱢᱮᱥᱮᱱᱡᱟᱨ, ᱤ-ᱢᱟᱭᱛᱨᱤ᱾",
    you: "ᱟᱢ",
    copy: "ᱱᱚᱠᱚᱞ ᱢᱮ",
    copied: "ᱱᱚᱠᱚᱞ ᱟᱠᱟᱱᱟ",
    listen: "ᱟᱸᱡᱚᱢ ᱢᱮ",
    stop: "ᱛᱤᱸᱜᱩ ᱢᱮ",
    back: "ᱛᱟᱭᱚᱢ",
    listenAgain: "ᱟᱨᱦᱚᱸ ᱟᱸᱡᱚᱢ ᱢᱮ",
    speaking: "ᱱᱚᱨᱰ ᱨᱚᱲ ᱮᱫᱟᱭ...",
    listening: "ᱱᱚᱨᱰ ᱟᱸᱡᱚᱢ ᱮᱫᱟᱭ...",
    thinking: "ᱩᱭᱦᱟᱹᱨ ᱮᱫᱟᱭ...",
    liveChatOn: "ᱞᱟᱭᱤᱵᱽ ᱨᱚᱯᱚᱲ ᱮᱦᱚᱵ ᱮᱱᱟ: ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱨᱚᱲ ᱢᱮ",
    stopVoiceChat: "ᱟᱲᱟᱝ ᱨᱚᱯᱚᱲ ᱛᱤᱸᱜᱩ ᱢᱮ",
    startVoiceChat: "ᱞᱟᱭᱤᱵᱽ ᱟᱲᱟᱝ ᱨᱚᱯᱚᱲ ᱮᱦᱚᱵ ᱢᱮ",
    voiceTyping: "ᱟᱲᱟᱝ ᱴᱟᱭᱯᱤᱝ",
    stopVoiceTyping: "ᱟᱲᱟᱝ ᱴᱟᱭᱯᱤᱝ ᱛᱤᱸᱜᱩ ᱢᱮ",
    speechNotSupported: "ᱱᱚᱣᱟ ᱵᱨᱟᱣᱡᱟᱨ ᱨᱮ ᱥᱯᱤᱪ ᱨᱤᱠᱚᱜᱽᱱᱤᱥᱚᱱ ᱵᱟᱹᱱᱩᱜᱼᱟ᱾",
    liveChat: "ᱞᱟᱭᱤᱵᱽ ᱨᱚᱯᱚᱲ",
    typeMessage: "ᱢᱮᱥᱮᱡᱽ ᱴᱟᱭᱤᱯ ᱢᱮ...",
    typeMessages: [
      "ᱟᱢᱟᱜ ᱢᱮᱥᱮᱡᱽ ᱱᱚᱸᱰᱮ ᱴᱟᱭᱤᱯ ᱢᱮ",
      "ᱢᱟᱭᱤᱠ ᱨᱮ ᱨᱚᱲ ᱠᱟᱛᱮ ᱢᱮᱥᱮᱡᱽ ᱵᱷᱮᱡᱟᱭ ᱢᱮ",
      "ᱜᱩᱞᱟᱹᱯᱤ ᱵᱷᱚᱭᱮᱥ ᱪᱮᱴ ᱵᱚᱛᱟᱢ ᱥᱟᱶ ᱞᱟᱭᱤᱵᱽ ᱪᱮᱴ ᱢᱮ",
    ],
    userNameLabel: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ",
    userNamePlaceholder: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ",
    poweredBy: "ᱤ-ᱢᱟᱭᱛᱨᱤ ᱰᱤᱡᱤᱴᱟᱞ ᱯᱞᱮᱴᱯᱷᱚᱨᱢ ᱦᱚᱛᱮᱛᱮ ᱪᱟᱞᱟᱜ ᱠᱟᱱᱟ᱾",
    settings: "ᱥᱮᱴᱤᱝᱥ",
    language: "ᱯᱟᱹᱨᱥᱤ",
    speechRate: "ᱨᱚᱲ ᱨᱮᱭᱟᱜ ᱜᱟᱹᱛᱤ",
    adjustRate: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱜᱟᱹᱛᱤ ᱴᱷᱤᱠ ᱢᱮ",
    speechPitch: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱥᱟᱰᱮ",
    adjustPitch: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱥᱟᱰᱮ ᱴᱷᱤᱠ ᱢᱮ",
    q1: "ᱰᱤᱡᱤᱴᱟᱞ ᱜᱚᱵᱷᱚᱨᱱᱮᱱᱥ ᱫᱚ ᱪᱮᱫ ᱠᱟᱱᱟ?",
    q2: "ᱯᱮ-ᱛᱷᱚᱠ ᱨᱮᱭᱟᱜ ᱜᱚᱲᱦᱚᱱ ᱵᱩᱡᱷᱟᱹᱣ ᱢᱮ᱾",
    q3: "ᱵᱩᱛᱷ ᱢᱮᱱᱮᱡᱽᱢᱮᱱᱴ ᱪᱮᱫ ᱞᱮᱠᱟ ᱠᱟᱹᱢᱤᱭᱟ?",
    q4: "ᱯᱷᱮᱢᱤᱞᱤ ᱮᱞᱟᱭᱮᱱᱥ ᱢᱩᱵᱷᱢᱮᱱᱴ ᱫᱚ ᱪᱮᱫ ᱠᱟᱱᱟ?",
    initialMessage:
      "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ! ᱤ-ᱢᱟᱭᱛᱨᱤ ᱯᱚᱨᱴᱟᱞ ᱨᱮ ᱟᱢᱟᱜ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ! ᱞᱟᱹᱭ ᱢᱮ ᱜᱟᱛᱮ, ᱤᱧ ᱪᱮᱫ ᱞᱮᱠᱟᱧ ᱜᱚᱲᱚ ᱫᱟᱲᱮᱭᱟᱢᱟ? ᱟᱢ ᱪᱮᱫ ᱵᱟᱰᱟᱭ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ?",
    initialMessageWithName:
      "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ!🙏 ᱤᱧ ᱫᱚ {botName} ᱠᱟᱹᱱᱟᱹᱧ! ᱤ-ᱢᱟᱭᱛᱨᱤ ᱯᱚᱨᱴᱟᱞ ᱨᱮ ᱟᱢᱟᱜ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ!✨ ᱤᱧ ᱪᱮᱫ ᱞᱮᱠᱟᱧ ᱜᱚᱲᱚ ᱫᱟᱲᱮᱭᱟᱢᱟ! ᱟᱢ ᱪᱮᱫ ᱵᱟᱰᱟᱭ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ?👋",
    errorTraffic:
      "ᱤᱠᱟᱹ ᱠᱟᱹᱧ ᱢᱮ, ᱱᱤᱛᱚᱜ ᱟᱹᱰᱤ ᱡᱟᱹᱥᱛᱤ ᱴᱨᱟᱯᱷᱤᱠ ᱢᱮᱱᱟᱜᱼᱟ ᱥᱮ ᱠᱳᱴᱟ ᱪᱟᱵᱟ ᱟᱠᱟᱱᱟ᱾ ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱛᱟᱭᱚᱢ ᱛᱮ ᱪᱮᱥᱴᱟᱭ ᱢᱮ᱾",
    errorTech:
      "ᱤᱠᱟᱹ ᱠᱟᱹᱧ ᱢᱮ, ᱢᱤᱫᱴᱟᱝ ᱴᱮᱠᱱᱤᱠᱟᱞ ᱮᱴᱠᱮᱴᱚᱬᱮ ᱦᱩᱭ ᱮᱱᱟ᱾ ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱟᱨᱦᱚᱸ ᱪᱮᱥᱴᱟᱭ ᱢᱮ᱾",
    premiumQuotaExceeded:
      "ᱯᱨᱤᱢᱤᱭᱟᱢ ᱟᱲᱟᱝ ᱠᱳᱴᱟ ᱪᱟᱵᱟ ᱟᱠᱟᱱᱟ᱾ ᱥᱴᱮᱱᱰᱟᱨᱰ ᱟᱲᱟᱝ ᱛᱮ ᱨᱩᱣᱟᱹᱲ ᱠᱟᱱᱟ᱾",
    newChat: "ᱱᱟᱶᱟ ᱨᱚᱯᱚᱲ",
    moreOptions: "ᱟᱨᱦᱚᱸ ᱚᱯᱥᱚᱱ",
    chattingIn: "ᱨᱚᱯᱚᱲ ᱠᱟᱱᱟ",
    saveChat: "ᱨᱚᱯᱚᱲ ᱥᱟᱧᱪᱟᱣ ᱢᱮ",
    enterChatName: "ᱨᱚᱯᱚᱲ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ ᱮᱢ ᱢᱮ...",
    cancel: "ᱵᱟᱹᱛᱤᱞ ᱢᱮ",
    save: "ᱥᱟᱧᱪᱟᱣ ᱢᱮ",
    chatHistory: "ᱨᱚᱯᱚᱲ ᱱᱟᱜᱟᱢ",
    noSavedChats: "ᱚᱠᱟ ᱨᱚᱯᱚᱲ ᱦᱚᱸ ᱵᱟᱝ ᱥᱟᱧᱪᱟᱣ ᱟᱠᱟᱱᱟ᱾",
    voiceEngine: "ᱟᱲᱟᱝ ᱤᱧᱡᱤᱱ",
    standard: "ᱥᱴᱮᱱᱰᱟᱨᱰ",
    premium: "ᱯᱨᱤᱢᱤᱭᱟᱢ",
    clearChatHistory: "ᱨᱚᱯᱚᱲ ᱱᱟᱜᱟᱢ ᱯᱷᱟᱨᱪᱟᱭ ᱢᱮ",
    clearAll: "ᱡᱚᱛᱚ ᱯᱷᱟᱨᱪᱟᱭ ᱢᱮ",
    areYouSureClear:
      "ᱪᱮᱫ ᱟᱢ ᱥᱟᱹᱨᱤ ᱜᱮ ᱡᱚᱛᱚ ᱥᱟᱧᱪᱟᱣ ᱟᱠᱟᱱ ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ? ᱱᱚᱣᱟ ᱫᱚ ᱨᱩᱣᱟᱹᱲ ᱵᱟᱝ ᱜᱟᱱᱚᱜᱼᱟ᱾",
    uploadImage: "ᱥᱠᱨᱤᱱᱥᱚᱴ / ᱪᱤᱛᱟᱹᱨ ᱟᱯᱞᱳᱰ ᱢᱮ",
    screenOn: "ᱥᱠᱨᱤᱱ ᱚᱱ",
    screenOff: "ᱥᱠᱨᱤᱱ ᱚᱯᱷ",
    stopGenerating: "ᱵᱮᱱᱟᱣ ᱛᱤᱸᱜᱩ ᱢᱮ",
    maxChatsError:
      "ᱟᱢ ᱫᱚ ᱑᱐ ᱜᱚᱴᱟᱝ ᱨᱚᱯᱚᱲ ᱜᱮᱢ ᱥᱟᱧᱪᱟᱣ ᱫᱟᱲᱮᱭᱟᱜᱼᱟ᱾ ᱱᱟᱶᱟ ᱥᱟᱧᱪᱟᱣ ᱞᱟᱹᱜᱤᱫ ᱢᱟᱨᱮ ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱢᱮ᱾",
    edit: "ᱥᱟᱯᱲᱟᱣ ᱢᱮ",
    share: "ᱦᱟᱹᱴᱤᱧ ᱢᱮ",
    pinChat: "ᱨᱚᱯᱚᱲ ᱯᱤᱱ ᱢᱮ",
    unpinChat: "ᱨᱚᱯᱚᱲ ᱟᱱᱯᱤᱱ ᱢᱮ",
    renameChat: "ᱨᱚᱯᱚᱲ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ ᱵᱚᱫᱚᱞ ᱢᱮ",
    deleteChat: "ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱢᱮ",
    loading: "ᱞᱳᱰᱚᱜ ᱠᱟᱱᱟ...",
    chooseLanguage: "ᱟᱢᱟᱜ ᱠᱩᱥᱤᱭᱟᱜ ᱯᱟᱹᱨᱥᱤ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    chooseVoiceEngine: "ᱥᱴᱮᱱᱰᱟᱨᱰ ᱟᱨ ᱯᱨᱤᱢᱤᱭᱟᱢ ᱮᱟᱭᱤ ᱟᱲᱟᱝ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    selectPremiumVoice: "ᱱᱟᱯᱟᱭ ᱠᱣᱟᱞᱤᱴᱤ ᱮᱟᱭᱤ ᱟᱲᱟᱝ ᱢᱚᱰᱮᱞ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    selectStandardVoice: "ᱰᱤᱵᱷᱟᱭᱤᱥ ᱨᱮᱭᱟᱜ ᱟᱲᱟᱝ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    autoSelect: "ᱟᱡ ᱛᱮ ᱵᱟᱪᱷᱟᱣ (ᱰᱤᱯᱷᱚᱞᱴ)",
    fenrirDesc: "ᱯᱷᱮᱱᱨᱤᱨ (ᱠᱮᱴᱮᱡ, ᱚᱫᱷᱤᱠᱟᱨᱤ ᱠᱚᱲᱟ)",
    charonDesc: "ᱠᱮᱨᱚᱱ (ᱛᱷᱤᱨ, ᱥᱚᱢᱟᱱ ᱠᱚᱲᱟ)",
    puckDesc: "ᱯᱟᱠ (ᱜᱟᱛᱮ ᱞᱮᱠᱟ, ᱮᱱᱟᱨᱡᱮᱴᱤᱠ ᱠᱚᱲᱟ)",
  },
  brx: {
    title: "नॉर्ड",
    subtitle: "AI मेसेंजर, ई-मैत्री।",
    you: "नोंथां",
    copy: "कपि खालाम",
    copied: "कपि खालामबाय",
    listen: "खोनासं",
    stop: "थाद'",
    back: "उनथिं",
    listenAgain: "फिन खोनासं",
    speaking: "नॉर्ड बुंगासिनो दं...",
    listening: "नॉर्ड खोनासं-गासिनो दं...",
    thinking: "सानगासिनो दं...",
    liveChatOn: "लाइभ गारां सावरायनाय जागायबाय: अननानै बुं",
    stopVoiceChat: "गारां सावरायनायखौ थाद'हो",
    startVoiceChat: "लाइभ गारां सावरायनायखौ जागाय",
    voiceTyping: "गारां टाइपिं",
    stopVoiceTyping: "गारां टाइपिंखौ थाद'हो",
    speechNotSupported: "बे ब्राउजाराव गारां सिनायनाय गैया।",
    liveChat: "लाइभ सावरायनाय",
    typeMessage: "मेसेज टाइप खालाम...",
    typeMessages: [
      "नोंथांनि मेसेजखौ बेवहाय टाइप खालाम",
      "माइकआव बुंनानै मेसेज दैथाय",
      "गोलाफि गारां सावरायनाय बुथामजों लाइभ सावराय",
    ],
    userNameLabel: "बटनि मुं",
    userNamePlaceholder: "बटनि मुं लिर",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफर्मजों सामलायजानाय।",
    settings: "सेटिंस",
    language: "राव",
    speechRate: "बुंनायनि गोख्रैथि",
    adjustRate: "गारांनि गोख्रैथिखौ थि खालाम",
    speechPitch: "गारांनि पिच",
    adjustPitch: "गारांनि पिचखौ थि खालाम",
    q1: "डिजिटल गभर्नेन्सआ मा?",
    q2: "थाम-थाखोआरि दाथायखौ बेखेव।",
    q3: "बुथ सामलायनाया माबोरै खामानि मावो?",
    q4: "नखर आफाद आन्दोलनआ मा?",
    initialMessage:
      "खुलुमबाय जेन-जी! ई-मैत्री पोर्टेलाव नोंथांखौ बरायबाय! बुं लोगो, आं नोंथांखौ माबोरै हेफाजाब खालामनो हागोन? नोंथांनो मा फोरमायथि नांगौ?",
    initialMessageWithName:
      "खुलुमबाय जेन-जी!🙏 आं {botName}! ई-मैत्री पोर्टेलाव नोंथांखौ बरायबाय!✨ आं नोंथांखौ माबोरै हेफाजाब खालामनो हागोन! नोंथांनो मा फोरमायथि नांगौ?👋",
    errorTraffic:
      "निमाहा हो, दा गोबां ट्राफिक दं एबा कोटा जोबबाय। अननानै उनाव नाजाफिन।",
    errorTech: "निमाहा हो, माबा मोनसे जेंना जादों। अननानै नाजाफिन।",
    premiumQuotaExceeded:
      "प्रिमियाम गारां कोटा जोबबाय। स्ट्यान्डार्ड गारांआव थांफिनबाय।",
    newChat: "गोदान सावरायनाय",
    moreOptions: "गोबां बासिख'नाय",
    chattingIn: "सावरायगासिनो दं",
    saveChat: "सावरायनायखौ दोनथ'",
    enterChatName: "सावरायनायनि मुं लिर...",
    cancel: "बातिल खालाम",
    save: "दोनथ'",
    chatHistory: "सावरायनायनि जारिमिन",
    noSavedChats: "जेबो दोनथ'नाय सावरायनाय गैया।",
    voiceEngine: "गारां इन्जिन",
    standard: "स्ट्यान्डार्ड",
    premium: "प्रिमियाम",
    clearChatHistory: "सावरायनायनि जारिमिनखौ हुखुमोर",
    clearAll: "गासैखौबो हुखुमोर",
    areYouSureClear:
      "नोंथांआ गासै दोनथ'नाय सावरायनायखौ हुखुमोरनो सानमारदोंना? बेखौ फिन लाबोनो हानाय नङा।",
    uploadImage: "स्क्रिनसट / सावगारि आपलोड खालाम",
    screenOn: "स्क्रिन अन",
    screenOff: "स्क्रिन अफ",
    stopGenerating: "दाबावनायखौ थाद'हो",
    maxChatsError:
      "नोंथांआ 10 सावरायनायल' दोनथ'नो हागोन। गोदान दोनथ'नो थाखाय अननानै गोजाम सावरायनायखौ हुखुमोर।",
    edit: "सुजु",
    share: "रानना हो",
    pinChat: "सावरायनायखौ पिन खालाम",
    unpinChat: "सावरायनायखौ आनपिन खालाम",
    renameChat: "सावरायनायनि मुं सोलाय",
    deleteChat: "सावरायनायखौ हुखुमोर",
    loading: "लोड जागासिनो दं...",
    chooseLanguage: "नोंथांनि मोजां मोननाय रावखौ बासिख'",
    chooseVoiceEngine: "स्ट्यान्डार्ड आरो प्रिमियाम AI गारांनि गेजेराव बासिख'",
    selectPremiumVoice: "गोजौ गुननि AI गारां मोडेलखौ बासिख'",
    selectStandardVoice: "डिभाइसनि गारांखौ बासिख'",
    autoSelect: "गावनोगाव बासिख' (डिफल्ट)",
    fenrirDesc: "फेनरिर (गोख्रै, गोहोआरि हौवा)",
    charonDesc: "कैरन (सिरि, समान हौवा)",
    puckDesc: "पाक (लोगोआरि, गोख्रै हौवा)",
  },
  mni: {
    title: "নর্ড",
    subtitle: "AI মেসেঞ্জার, ই-মৈত্রী।",
    you: "নহাক",
    copy: "কপি তৌবিয়ু",
    copied: "কপি তৌরে",
    listen: "তাবিয়ু",
    stop: "লেপ্পিয়ু",
    back: "হন্দোকপিয়ু",
    listenAgain: "অমুক হন্না তাবিয়ু",
    speaking: "নর্ড ঙাংলি...",
    listening: "নর্ড তালি...",
    thinking: "খল্লি...",
    liveChatOn: "লাইভ ভোইস চ্যাট ওন তৌরে: চানবীদুনা ঙাংবিয়ু",
    stopVoiceChat: "ভোইস চ্যাট লেপ্পিয়ু",
    startVoiceChat: "লাইভ ভোইস চ্যাট হৌবিয়ু",
    voiceTyping: "ভোইস টাইপিং",
    stopVoiceTyping: "ভোইস টাইপিং লেপ্পিয়ু",
    speechNotSupported: "ব্রাউজার অসিদা স্পীচ রিকগনিশন সাপোর্ট তৌদে।",
    liveChat: "লাইভ চ্যাট",
    typeMessage: "মেসেজ টাইপ তৌবিয়ু...",
    typeMessages: [
      "নহাক্কী মেসেজ মফম অসিদা টাইপ তৌবিয়ু",
      "মাইক্তা ঙাংদুনা মেসেজ থাবিয়ু",
      "পিঙ্ক ভোইস চ্যাট বটনগা লোয়ননা লাইভ চ্যাট তৌবিয়ু",
    ],
    userNameLabel: "বোটকী মমিং",
    userNamePlaceholder: "বোটকী মমিং ইবিয়ু",
    poweredBy: "ই-মৈত্রী ডিজিটাল প্লাটফর্মনা পাউবা।",
    settings: "সেটিংস",
    language: "লোন",
    speechRate: "ঙাংবগী খোংজেল",
    adjustRate: "খোঞ্জেলগী খোংজেল শেমদোকপিয়ু",
    speechPitch: "খোল্লেল",
    adjustPitch: "খোল্লেল শেমদোকপিয়ু",
    q1: "ডিজিটাল গভর্নেন্স হায়বসি করিনো?",
    q2: "থ্রি-টিয়ার স্ট্রাকচরগী মরমদা তাকপিয়ু।",
    q3: "বুথ ম্যানেজমেন্টনা করম্না থবক তৌবগে?",
    q4: "ফ্যামিলি এলায়েন্স মুভমেন্ট হায়বসি করিনো?",
    initialMessage:
      "খুরুমজরি জেন-জি! ই-মৈত্রী পোর্টেলদা তরাম্না ওকচরি! হায়বিয়ু মরুপ, ঐনা নহাক্কী করম্না মতেং পাংবা ঙমগনি? নহাক্না করি ইনফরমেশন পাম্বিগে?",
    initialMessageWithName:
      "খুরুমজরি জেন-জি!🙏 ঐ {botName} নি! ই-মৈত্রী পোর্টেলদা তরাম্না ওকচরি!✨ ঐনা নহাক্কী করম্না মতেং পাংবা ঙমগনি! নহাক্না করি ইনফরমেশন পাম্বিগে?👋",
    errorTraffic:
      "ঙাকপিয়ু, হৌজিক য়াম্না ট্রাফিক লৈ নত্রগা কোটা লোইরে। চানবীদুনা মতুংদা অমুক হন্না হোত্নবিয়ু।",
    errorTech:
      "ঙাকপিয়ু, টেকনিকেল ওইবা অৱাবা অমা লৈরে। চানবীদুনা অমুক হন্না হোত্নবিয়ু।",
    premiumQuotaExceeded:
      "প্রিমিয়াম ভোইস কোটা লোইরে। স্ট্যান্ডার্ড ভোইসতা হন্দোক্লে।",
    newChat: "অনোউবা চ্যাট",
    moreOptions: "অতোপ্পা অপশনশিং",
    chattingIn: "চ্যাট তৌরি",
    saveChat: "চ্যাট সেভ তৌবিয়ু",
    enterChatName: "চ্যাটকী মিং থোনবিয়ু...",
    cancel: "কেন্সেল তৌবিয়ু",
    save: "সেভ তৌবিয়ু",
    chatHistory: "চ্যাট হিস্ট্রি",
    noSavedChats: "সেভ তৌবা চ্যাট অমত্তা লৈতে।",
    voiceEngine: "খোঞ্জেল ইঞ্জিন",
    standard: "স্ট্যান্ডার্ড",
    premium: "প্রিমিয়াম",
    clearChatHistory: "চ্যাট হিস্ট্রি মুত্থত্পিয়ু",
    clearAll: "পুম্নমক মুত্থত্পিয়ু",
    areYouSureClear:
      "নহাক্না সেভ তৌবা চ্যাট পুম্নমক মুত্থত্পা পাম্ব্রা? অসি অমুক হন্না ফংলোই।",
    uploadImage: "স্ক্রিনশট / ফটো আপলোড তৌবিয়ু",
    screenOn: "স্ক্রিন ওন",
    screenOff: "স্ক্রিন ওফ",
    stopGenerating: "শেম্বা লেপ্পিয়ু",
    maxChatsError:
      "নহাক্না চ্যাট ১০ খক্তমক সেভ তৌবা য়াই। অনোউবা সেভ তৌনবা চানবীদুনা অরিবা চ্যাট অমা মুত্থত্পিয়ু।",
    edit: "শেমদোকপিয়ু",
    share: "শেয়ার তৌবিয়ু",
    pinChat: "চ্যাট পিন তৌবিয়ু",
    unpinChat: "চ্যাট আনপিন তৌবিয়ু",
    renameChat: "চ্যাটকী মিং হোংবিয়ু",
    deleteChat: "চ্যাট মুত্থত্পিয়ু",
    loading: "লোড তৌরি...",
    chooseLanguage: "নহাক্না পাম্বা লোন খনখত্পিয়ু",
    chooseVoiceEngine:
      "স্ট্যান্ডার্ড অমসুং প্রিমিয়াম AI খোঞ্জেলগী মরক্তা খনখত্পিয়ু",
    selectPremiumVoice: "মগুন ৱাংবা AI ভোইস মডেল খনখত্পিয়ু",
    selectStandardVoice: "ডিভাইসকী খোঞ্জেল খনখত্পিয়ু",
    autoSelect: "ওটো সিলেক্ট (ডিফল্ট)",
    fenrirDesc: "ফেনরির (মপাঙ্গল কনবা, ওথোরিটেটিভ নুপা)",
    charonDesc: "ক্যারন (শান্ত ওইবা, মেজার্ড নুপা)",
    puckDesc: "পাক (মরুপ ওইবা, এনার্জেটিক নুপা)",
  },
};

const VirtualNetworkBackground = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      {/* Base Tech Image */}
      <div
        className="absolute inset-0 opacity-100"
        style={{
          backgroundImage: "linear-gradient(135deg, #000000 0%, #0a0a0a 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Network Nodes & Lines */}
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="rgba(59, 130, 246, 0.3)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Animated connection lines */}
          <g stroke="rgba(59, 130, 246, 0.5)" strokeWidth="2" fill="none">
            <path
              d="M 10 150 Q 150 200 300 100 T 600 300"
              className="animate-pulse"
            />
            <path
              d="M 800 100 Q 600 250 400 400 T 100 600"
              className="animate-pulse"
              style={{ animationDelay: "1s" }}
            />
            <path
              d="M 200 800 Q 400 600 700 700 T 1000 500"
              className="animate-pulse"
              style={{ animationDelay: "2s" }}
            />
          </g>

          {/* Glowing Nodes */}
          <circle
            cx="600"
            cy="300"
            r="5"
            fill="#60a5fa"
            className="animate-ping"
            style={{ animationDelay: "0.5s" }}
          />
          <circle
            cx="400"
            cy="400"
            r="4"
            fill="#fbbf24"
            className="animate-ping"
            style={{ animationDelay: "1.5s" }}
          />
          <circle
            cx="700"
            cy="700"
            r="6"
            fill="#a78bfa"
            className="animate-ping"
            style={{ animationDelay: "2.5s" }}
          />
        </svg>
      </div>
    </div>
  );
};

const guessGender = (name: string): "M" | "F" => {
  if (!name) return "M";
  const lowerName = name.trim().toLowerCase();

  const femaleSuffixes = [
    "a",
    "i",
    "ee",
    "ya",
    "na",
    "ta",
    "ra",
    "la",
    "ka",
    "sa",
    "ha",
    "ma",
    "wati",
    "vati",
    "devi",
    "bai",
    "kumari",
    "kaur",
    "ben",
    "bibi",
    "bano",
    "begum",
    "khatoon",
    "nisa",
    "ा",
    "ि",
    "ी",
    "्या",
    "ना",
    "ता",
    "रा",
    "ला",
    "का",
    "सा",
    "हा",
    "मा",
    "वती",
    "देवी",
    "बाई",
    "कुमारी",
    "कौर",
    "बेन",
    "बीबी",
    "बानो",
    "बेगम",
    "खातून",
    "निसा",
  ];

  const maleExceptions = [
    "shiva",
    "krishna",
    "aditya",
    "rama",
    "rishi",
    "ravi",
    "hari",
    "murali",
    "gopi",
    "kavi",
    "mani",
    "swami",
    "yogi",
    "bhai",
    "singh",
    "kumar",
    "nath",
    "das",
    "ram",
    "raj",
    "ji",
    "rahul",
    "amit",
    "suresh",
    "ramesh",
    "mahesh",
    "dinesh",
    "prasad",
    "शिवा",
    "कृष्णा",
    "आदित्य",
    "रामा",
    "ऋषि",
    "रवि",
    "हरि",
    "मुरली",
    "गोपी",
    "कवि",
    "मणि",
    "स्वामी",
    "योगी",
    "भाई",
    "सिंह",
    "कुमार",
    "नाथ",
    "दास",
    "राम",
    "राज",
    "जी",
    "राहुल",
    "अमित",
    "सुरेश",
    "रमेश",
    "महेश",
    "दिनेश",
    "प्रसाद",
  ];

  for (const exc of maleExceptions) {
    if (lowerName.endsWith(exc) || lowerName === exc) return "M";
  }

  for (const suf of femaleSuffixes) {
    if (lowerName.endsWith(suf)) return "F";
  }

  return "M";
};

const isFemaleVoice = (v: SpeechSynthesisVoice) => {
  const n = v.name.toLowerCase();
  const u = v.voiceURI.toLowerCase();

  const femaleTerms = [
    "female",
    "woman",
    "girl",
    "lady",
    "महिला",
    "स्त्री",
    "लड़की",
    "नारी", // Hindi, Marathi, Nepali, etc.
    "સ્ત્રી",
    "છોકરી", // Gujarati
    "ਔਰਤ",
    "ਕੁੜੀ", // Punjabi
    "பெண்", // Tamil
    "స్త్రీ",
    "ఆడ", // Telugu
    "ಮಹಿಳೆ",
    "ಹುಡುಗಿ", // Kannada
    "സ്ത്രീ",
    "പെൺകുട്ടി", // Malayalam
    "ନାରୀ",
    "ଝିଅ", // Odia
    "عورت",
    "لڑکی",
    "خاتون", // Urdu, Kashmiri, Sindhi
  ];

  if (femaleTerms.some((term) => n.includes(term) || u.includes(term)))
    return true;

  const femaleIdentifiers = [
    "kalpana",
    "lekha",
    "aditi",
    "neerja",
    "pallavi",
    "vani",
    "swara",
    "zira",
    "samantha",
    "victoria",
    "hazel",
    "susan",
    "-standard-a",
    "-standard-d",
    "-wavenet-a",
    "-wavenet-d",
    "-neural2-a",
    "-neural2-d",
    "-hia",
    "-hic",
    "-ena",
    "-enc",
    "cfn",
    "hif",
  ];
  return femaleIdentifiers.some((id) => n.includes(id) || u.includes(id));
};

const isMaleVoice = (v: SpeechSynthesisVoice) => {
  const n = v.name.toLowerCase();
  const u = v.voiceURI.toLowerCase();

  const femaleTerms = [
    "female",
    "woman",
    "girl",
    "lady",
    "महिला",
    "स्त्री",
    "लड़की",
    "नारी",
    "સ્ત્રી",
    "છોકરી",
    "ਔਰਤ",
    "ਕੁੜੀ",
    "பெண்",
    "స్త్రీ",
    "ఆడ",
    "ಮಹಿಳೆ",
    "ಹುಡುಗಿ",
    "സ്ത്രീ",
    "പെൺകുട്ടി",
    "ନାରୀ",
    "ଝିଅ",
    "عورت",
    "لڑکی",
    "خاتون",
  ];

  if (femaleTerms.some((term) => n.includes(term) || u.includes(term)))
    return false;

  const maleTerms = [
    "male",
    "boy",
    "पुरुष",
    "पुल्लिंग",
    "लड़का",
    "आदमी",
    "नर", // Hindi, Marathi, Nepali, etc.
    "પુરુષ",
    "છોકરો", // Gujarati
    "ਆਦਮੀ",
    "ਮੁੰਡਾ", // Punjabi
    "ஆண்", // Tamil
    "పురుషుడు",
    "మగ", // Telugu
    "ಪುರುಷ",
    "ಹುಡುಗ", // Kannada
    "പുരുഷൻ",
    "ആൺകുട്ടി", // Malayalam
    "ପୁରୁଷ",
    "ପୁଅ", // Odia
    "مرد",
    "لڑکا", // Urdu, Kashmiri, Sindhi
  ];

  if (maleTerms.some((term) => n.includes(term) || u.includes(term)))
    return true;
  if (
    (n.includes("man") && !n.includes("samantha")) ||
    (u.includes("man") && !u.includes("samantha"))
  )
    return true;

  const maleIdentifiers = [
    "david",
    "arthur",
    "daniel",
    "hemant",
    "rishi",
    "mark",
    "paul",
    "ravi",
    "amit",
    "kumar",
    "-hie",
    "-hid",
    "-end",
    "-ene",
    "-standard-b",
    "-standard-c",
    "-wavenet-b",
    "-wavenet-c",
    "-neural2-b",
    "-neural2-c",
    "cme",
    "him",
  ];
  return maleIdentifiers.some((id) => n.includes(id) || u.includes(id));
};

import { MasterAdmin } from "./components/admin/MasterAdmin";
import { SecurityWrapper } from "./components/admin/SecurityWrapper";
import { AppTour } from "./components/client/AppTour";
import { ClientDashboard } from "./components/client/ClientDashboard";

const FreeTrialCountdown = ({
  freeTrialEnd,
  uiLang,
}: {
  freeTrialEnd: number | null;
  uiLang: "en" | "hi" | "bho";
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!freeTrialEnd) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = freeTrialEnd - now;
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [freeTrialEnd]);

  if (!freeTrialEnd || !timeLeft) return null;

  const isExpired =
    timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;
  if (isExpired) return null;

  const isWarning = timeLeft.hours < 24;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <motion.div
      drag
      dragMomentum={false}
      style={{ touchAction: "none" }}
      whileDrag={{ scale: 1.05 }}
      initial={{ x: 0, y: 0 }}
      className={`fixed bottom-4 sm:bottom-auto sm:top-4 left-1/2 -translate-x-1/2 z-[15000] flex items-center gap-3 px-6 py-3 rounded-[44px] shadow-2xl backdrop-blur-xl border cursor-move ${isWarning ? "bg-orange-500/20 border-orange-400/50 shadow-[0_0_25px_rgba(249,115,22,0.4)] text-orange-300" : "bg-yellow-500/20 shadow-[0_0_25px_rgba(234,179,8,0.4)] border-yellow-400/50 text-yellow-300"}`}
    >
      <Zap
        size={20}
        className={`${isWarning ? "text-orange-400" : "text-yellow-400"} animate-pulse pointer-events-none`}
      />
      <div className="flex flex-col pointer-events-none">
        <span className="text-[10px] uppercase font-black tracking-widest leading-none text-white/80">
          3-Day Full Access
        </span>
        <span className="font-mono font-bold tracking-widest text-lg leading-none mt-1">
          {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
        </span>
      </div>
    </motion.div>
  );
};

interface AppProps {
  clientId?: string;
}

export default function App({ clientId }: AppProps = {}) {
  const [selectedRole, setSelectedRole] = useState<{
    id: string;
    name: string;
    hex?: string;
    color: string;
    bg: string;
    accent?: string;
    textColors?: string;
    dropShadow?: string;
  } | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = safeStorage.getItem("app_theme");
      if (saved === "dark" || saved === "light") {
        return saved;
      }
    } catch {}
    const currentHour = new Date().getHours();
    return currentHour >= 6 && currentHour < 18 ? "light" : "dark";
  });

  useEffect(() => {
    // Auto update theme based on time of day (day map 6-18)
    const checkTime = () => {
      const currentHour = new Date().getHours();
      const expectedTheme =
        currentHour >= 6 && currentHour < 18 ? "light" : "dark";
      setTheme(expectedTheme);
    };
    checkTime();

    // Check every minute if the hour changed
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    safeStorage.setItem("app_theme", theme);
  }, [theme]);

  useEffect(() => {
    // Eagerly fetch a fresh API token on mount so that if the PWA is
    // opened after the key expires, it gets a fresh key automatically.
    const eagerlyRefreshKey = async () => {
      try {
        const res = await fetch("/api/gemini-token");
        if (res.ok) {
           const tokenData = await res.json();
           if (tokenData.token) {
               (window as any).DYNAMIC_GEMINI_API_KEY = tokenData.token;
               initAI(tokenData.token);
               console.log("Automatically refreshed Gemini API Token on mount.");
           }
        }
      } catch (e) {
        console.warn("Could not start eager token refresh.");
      }
    };
    eagerlyRefreshKey();
  }, []);

  const [uiLang, setUiLang] = useState<"en" | "hi" | "bho">(() => {
    try {
      return (safeStorage.getItem("uiLang_v2") as "en" | "hi" | "bho") || "en";
    } catch (e) {
      return "en";
    }
  });

  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "inactive" | "pending_payment" | "verifying" | "active"
  >(() => {
    try {
      return (safeStorage.getItem("nard_sub_status") as any) || "inactive";
    } catch {
      return "inactive";
    }
  });

  const [paymentUrl, setPaymentUrl] = useState("");
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  useEffect(() => {
    if (subscriptionStatus === "verifying") {
      const t = setTimeout(() => {
        setSubscriptionStatus("active");
        safeStorage.setItem("nard_sub_status", "active");
        setShowSuccessOverlay(true);
        
        if ("speechSynthesis" in window) {
          const msg = new SpeechSynthesisUtterance(
            uiLang === "hi"
              ? "पेमेंट सफल रहा। आपका प्लान एक्टिव हो गया है।"
              : "Payment successful. Your plan is now active."
          );
          msg.lang = uiLang === "hi" ? "hi-IN" : "en-US";
          window.speechSynthesis.speak(msg);
        }

        setTimeout(() => {
          setShowSuccessOverlay(false);
          setShowFinalOfferPopup(false);
        }, 3000);
      }, 3000);
      return () => clearTimeout(t);
    } else if (subscriptionStatus === "active" || subscriptionStatus === "inactive") {
      safeStorage.setItem("nard_sub_status", subscriptionStatus);
    }
  }, [subscriptionStatus, uiLang]);

  const [freeTrialEnd, setFreeTrialEnd] = useState<number | null>(() => {
    try {
      const saved = safeStorage.getItem("nard_free_trial_end_v1");
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  const [trialPlan, setTrialPlan] = useState<"basic" | "pro" | "ultra">(() => {
    return (
      (safeStorage.getItem("nard_trial_plan_v1") as
        | "basic"
        | "pro"
        | "ultra") || "ultra"
    );
  });

  const isTrialActive = freeTrialEnd !== null && Date.now() < freeTrialEnd;
  const hasTrialExpired = freeTrialEnd !== null && Date.now() >= freeTrialEnd;

  const [showFinalOfferPopup, setShowFinalOfferPopup] = useState(() => {
    if (
      freeTrialEnd !== null &&
      Date.now() >= freeTrialEnd &&
      subscriptionStatus !== "active"
    ) {
      try {
        return safeStorage.getItem("nard_final_offer_seen") !== "true";
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const [isFinalOfferSeen, setIsFinalOfferSeen] = useState(() => {
    try {
      return safeStorage.getItem("nard_final_offer_seen") === "true";
    } catch (e) {
      return false;
    }
  });
  const [forceTick, setForceTick] = useState(0);
  const [mockPaymentCount] = useState(
    () => Math.floor(Math.random() * 50) + 10,
  );

  useEffect(() => {
    if (
      freeTrialEnd !== null &&
      Date.now() >= freeTrialEnd &&
      subscriptionStatus !== "active"
    ) {
      try {
        if (isSessionActiveRef.current) {
          window.dispatchEvent(new Event("force-stop-live-audio"));
        }
        if (safeStorage.getItem("nard_final_offer_seen") !== "true") {
          setShowFinalOfferPopup(true);

          // Play audio alert
          if ("speechSynthesis" in window) {
            const msg = new SpeechSynthesisUtterance(
              uiLang === "hi"
                ? "आपके साथ मेरा ट्रायल खत्म हुआ, क्या हम दोस्ती जारी रख सकते हैं?"
                : "My trial with you has ended, can we continue our friendship?",
            );
            msg.lang = uiLang === "hi" ? "hi-IN" : "en-IN";
            window.speechSynthesis.speak(msg);
          }
        }
      } catch (e) {}
    } else if (
      freeTrialEnd !== null &&
      Date.now() < freeTrialEnd &&
      subscriptionStatus !== "active"
    ) {
      const msLeft = freeTrialEnd - Date.now();
      const timeoutId = setTimeout(() => {
        setForceTick((t) => t + 1);
      }, msLeft);
      return () => clearTimeout(timeoutId);
    }
  }, [freeTrialEnd, subscriptionStatus, uiLang, forceTick]);

  useEffect(() => {
    if (freeTrialEnd !== null) {
      safeStorage.setItem("nard_free_trial_end_v1", freeTrialEnd.toString());
      safeStorage.setItem("nard_trial_plan_v1", trialPlan);
    }
  }, [freeTrialEnd, trialPlan]);

  useEffect(() => {
    try {
      safeStorage.setItem("nard_sub_status", subscriptionStatus);
    } catch {}
  }, [subscriptionStatus]);

  useEffect(() => {
    safeStorage.setItem("uiLang_v2", uiLang);
  }, [uiLang]);

  const t = translations[uiLang] || translations["en"];
  const lT = getLandingT(uiLang);

  // पेज लोड होने के बाद पहले क्लिक/टच पर माइक की अनुमति मांगें ताकि ब्राउज़र इसे ऑटो-ब्लॉक न करे
  useEffect(() => {
    const requestMicPermission = () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(function (stream) {
            console.log("Nard को माइक मिल गया!");
            // Stop the tracks immediately so the recording indicator doesn't stay on
            stream.getTracks().forEach((track) => track.stop());
          })
          .catch(function (err) {
            console.log("माइक एरर: " + err);
          });
      }
      // एक बार अनुमति मांगने के बाद इवेंट लिसनर हटा दें
      document.removeEventListener("click", requestMicPermission);
      document.removeEventListener("touchstart", requestMicPermission);
    };

    document.addEventListener("click", requestMicPermission);
    document.addEventListener("touchstart", requestMicPermission, {
      passive: true,
    });

    return () => {
      document.removeEventListener("click", requestMicPermission);
      document.removeEventListener("touchstart", requestMicPermission);
    };
  }, []);

  const [input, setInput] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");

  const [pageContext, setPageContext] = useState<string | null>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ctx = urlParams.get("context");
      if (ctx) {
        // Remove it from URL so it doesn't clutter
        urlParams.delete("context");
        const newSearch = urlParams.toString();
        const newUrl =
          window.location.pathname +
          (newSearch ? "?" + newSearch : "") +
          window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        return decodeURIComponent(ctx);
      }
    } catch (e) {
      console.warn("Error reading context from URL", e);
    }
    return null;
  });

  const [demoBotName, setDemoBotName] = useState(() => {
    try {
      return safeStorage.getItem("demoBotName_v1") || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    try {
      safeStorage.setItem("demoBotName_v1", demoBotName);
    } catch (e) {}
  }, [demoBotName]);

  const [userName, setUserName] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get("botName");
      if (urlBotName) {
        // Remove it from URL so it doesn't override future changes on reload
        urlParams.delete("botName");
        const newSearch = urlParams.toString();
        const newUrl =
          window.location.pathname +
          (newSearch ? "?" + newSearch : "") +
          window.location.hash;
        window.history.replaceState({}, document.title, newUrl);

        safeStorage.setItem("userName_v1", urlBotName);
        return urlBotName;
      }
      return safeStorage.getItem("userName_v1") || "";
    } catch (e) {
      return "";
    }
  });

  const [setupName, setSetupName] = useState("");
  const [isEditingBotName, setIsEditingBotName] = useState(false);

  const [inventoryState, setInventoryState] = useState<any[]>(() => {
    try {
      const saved = safeStorage.getItem("client_inventory");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const getInventoryPrompt = () => {
    const inv = inventoryState;
    if (!inv || inv.length === 0) return "";
    let prompt = `\n\nCLIENT INVENTORY (Use this for questions about products/prices):\n`;
    inv.forEach((item: any) => {
      prompt += `- ${item.name}: Price ₹${item.price} (${item.inStock ? "Available" : "Out of stock"})\n`;
    });
    prompt += `CRITICAL: If the user asks for a product price, mention the exact price listed above. Do not guess it.`;
    return prompt;
  };

  const [digitalIdentity, setDigitalIdentity] = useState({
    brandName: "",
    botName: "",
    logoUrl: "",
    clientUpiId: "",
    customInstructions: "",
  });

  useEffect(() => {
    let isMounted = true;
    const loadClientData = async () => {
      // If accessed via a client URL
      if (clientId) {
        try {
          const docRef = doc(db, 'users', clientId, 'digitalIdentities', 'main');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && isMounted) {
            setDigitalIdentity(docSnap.data() as any);
            if (docSnap.data().brandName) {
              setUserName(docSnap.data().brandName);
            }
          }
          
          const invRef = doc(db, 'users', clientId, 'inventory', 'main');
          const invSnap = await getDoc(invRef);
          if (invSnap.exists() && isMounted) {
             setInventoryState(invSnap.data().items || []);
          }
        } catch (err) {
          console.error("Failed to load client identity from firebase", err);
        }
      } else {
        // Load from local storage
        try {
          const savedIdentity = safeStorage.getItem("nard_digital_identity");
          if (savedIdentity && isMounted) {
            const parsed = JSON.parse(savedIdentity);
            setDigitalIdentity(parsed);
            if (parsed.brandName) {
              setUserName(parsed.brandName);
            }
          }
          const savedInv = safeStorage.getItem("client_inventory");
          if (savedInv && isMounted) {
             setInventoryState(JSON.parse(savedInv));
          }
        } catch (e) {}
      }
    };
    
    loadClientData();

    const handleIdentityUpdate = () => {
      if (clientId) return; // Don't reload from local storage if running in client mode
      
      try {
        const saved = safeStorage.getItem("nard_digital_identity");
        if (saved) {
          const parsed = JSON.parse(saved);
          setDigitalIdentity(parsed);
          if (parsed.brandName) {
            setUserName(parsed.brandName);
          }
        }
        
        const savedInv = safeStorage.getItem("client_inventory");
        if (savedInv) {
           setInventoryState(JSON.parse(savedInv));
        }
      } catch (e) {}
    };
    window.addEventListener(
      "nard_digital_identity_updated",
      handleIdentityUpdate,
    );
    return () =>
      window.removeEventListener(
        "nard_digital_identity_updated",
        handleIdentityUpdate,
      );
  }, []);

  const displayBotName = selectedRole 
    ? (selectedRole.id === "sales" ? selectedRole.name : (demoBotName.trim() || selectedRole.name))
    : (userName.trim() || "Nard");

  useEffect(() => {
    document.title = userName
      ? `${userName} - Nard AI`
      : "Nard AI";
  }, [userName]);

  const getGenderAdjustedText = (
    text: string | undefined,
    lang: string,
    name: string,
  ) => {
    if (!text) return "";
    let replaced = text.replace(
      /Nard|नॉर्ड|নর্ড|நார்ட்|నార్డ్|નોર્ડ|ನಾರ್ಡ್|നോർഡ്|ନର୍ଡ|ਨਾਰਡ|نارڈ|نارڊ|ᱱᱚᱨᱰ|જેન-જી|ജെൻ-ജി|ਜੇਨ-ਜੀ/gi,
      name,
    );
    const gender = guessGender(name);

    if (gender === "F") {
      if (lang === "hi") {
        replaced = replaced.replace(/रहे हैं/g, "रही हैं");
      } else if (lang === "bho") {
        replaced = replaced.replace(/रहल बाड़े/g, "रहल बाड़ी");
      } else if (lang === "gu") {
        replaced = replaced.replace(/રહ્યા છે/g, "રહી છે");
      } else if (lang === "pa") {
        replaced = replaced.replace(/ਰਹੇ ਹਨ/g, "ਰਹੀ ਹੈ");
      } else if (lang === "ur") {
        replaced = replaced.replace(/رہے ہیں/g, "رہی ہیں");
      } else if (lang === "sd") {
        replaced = replaced.replace(/رهيو آهي/g, "رهي آهي");
      } else if (lang === "doi") {
        replaced = replaced
          .replace(/करदा ऐ/g, "करदी ऐ")
          .replace(/सुनदा ऐ/g, "सुनदी ऐ")
          .replace(/सोचदा ऐ/g, "सोचदी ऐ");
      }
    }
    return replaced;
  };

  const getInitialMessage = (lang: string, name: string, roleInput?: any) => {
    const role = roleInput || selectedRole;
    if (role) {
      const displayName = role.id === "sales" ? role.name : (name || role.name || "Nard");
      const trans: Record<string, Record<string, string>> = {
        en: {
          sales: `Hello! I am ${displayName} Platform Representative. I can explain the utility and benefits of white-labeling, and how you can integrate Nard's services for your business.`,
          agriculture: `Hello! I am ${displayName} (Agri Expert). You can ask me anything related to farming, crops, or agriculture.`,
          medical: `Hello! I am ${displayName} (Health Companion). I will assist you with any questions regarding health, fitness, or illness.`,
          education: `Hello! I am ${displayName} (Education Assistant). I will help you understand your studies, career, or any subject.`,
          business: `Hello! I am ${displayName} (Business Manager). You can get any advice related to business, marketing, or finance from me.`,
        },
        hi: {
          sales: `नमस्ते! मैं ${displayName} प्लेटफ़ॉर्म रिप्रेजेंटेटिव हूँ। मैं आपको व्हाइट-लेबलिंग की उपयोगिता और लाभों के बारे में बता सकता हूँ, और यह भी कि आप अपने व्यवसाय के लिए नॉर्ड की सेवाएँ कैसे प्राप्त कर सकते हैं।`,
          agriculture: `नमस्ते! मैं ${displayName} (किसान मित्र) हूँ। कृषि, फसल या खेती से जुड़ी किसी भी जानकारी के लिए आप मुझसे बात कर सकते हैं।`,
          medical: `नमस्ते! मैं ${displayName} (स्वास्थ्य साथी) हूँ। स्वास्थ्य, फिटनेस या बीमारियों से जुड़े किसी भी सवाल के लिए मैं आपकी सहायता करूँगा।`,
          education: `नमस्ते! मैं ${displayName} (शिक्षा सहायक) हूँ। पढ़ाई, करियर या किसी भी विषय को समझने में मैं आपकी मदद करूँगा।`,
          business: `नमस्ते! मैं ${displayName} (व्यापार प्रबंधक) हूँ। व्यवसाय, मार्केटिंग या फाइनेंस से जुड़ी कोई भी सलाह आप मुझसे ले सकते हैं।`,
        },
        bho: {
          sales: `नमस्ते! हम ${displayName} प्लेटफॉर्म रिप्रेजेंटेटिव हईं। हम रउआ के व्हाइट-लेबलिंग के फायदा बता सकत बानी, आ इहो कि रउआ अपना बिजनेस खातिर नॉर्ड के सर्विस कइसे ले सकेनी।`,
          agriculture: `नमस्ते! हम ${displayName} (किसान मित्र) हईं। खेती-बारी या फसल से जुड़ल कवनो जानकारी खातिर रउआ हमरा से बात कर सकेनी।`,
          medical: `नमस्ते! हम ${displayName} (स्वास्थ्य साथी) हईं। स्वास्थ्य, फिटनेस या बीमारी से जुड़ल कवनो सवाल खातिर हम रउआ मदद करब।`,
          education: `नमस्ते! हम ${displayName} (शिक्षा सहायक) हईं। पढ़ाई, करियर या कवनो विषय के समझे में हम रउआ मदद करब।`,
          business: `नमस्ते! हम ${displayName} (व्यापार प्रबंधक) हईं। बिजनेस, मार्केटिंग या फाइनेंस से जुड़ल कवनो सलाह रउआ हमरा से ले सकेनी।`,
        },
      };

      if (trans[lang] && trans[lang][role.id]) {
        return trans[lang][role.id];
      } else {
        if (lang === "hi") return `नमस्ते! मैं ${displayName} हूँ।`;
        if (lang === "bho") return `नमस्ते! हम ${displayName} हईं।`;
        return `Hello! I am ${displayName}.`;
      }
    }

    const trans = translations[lang] || translations["en"];
    const trimmedName = name.trim();
    if (!trimmedName) {
      const defaultName = "Nard";
      let msg = trans.initialMessageWithName.replace(
        /\{botName\}/g,
        defaultName,
      );
      const gender = guessGender(defaultName);

      if (gender === "F") {
        if (lang === "hi") {
          msg = msg.replace("सकता हूं", "सकती हूं");
        } else if (lang === "mr") {
          msg = msg.replace("शकतो", "शकते");
        } else if (lang === "pa") {
          msg = msg.replace("ਸਕਦਾ ਹਾਂ", "ਸਕਦੀ ਹਾਂ");
        } else if (lang === "ur") {
          msg = msg.replace("سکتا ہوں", "سکتی ہوں");
        } else if (lang === "sd") {
          msg = msg.replace("سگهان ٿو", "سگهان ٿي");
        } else if (lang === "doi") {
          msg = msg.replace("सकनां", "सकनी आं");
        }
      }
      return msg;
    }
    let msg = trans.initialMessageWithName.replace(/\{botName\}/g, trimmedName);
    const gender = guessGender(trimmedName);

    if (gender === "F") {
      if (lang === "hi") {
        msg = msg.replace("सकता हूं", "सकती हूं");
      } else if (lang === "mr") {
        msg = msg.replace("शकतो", "शकते");
      } else if (lang === "pa") {
        msg = msg.replace("ਸਕਦਾ ਹਾਂ", "ਸਕਦੀ ਹਾਂ");
      } else if (lang === "ur") {
        msg = msg.replace("سکتا ہوں", "سکتی ہوں");
      } else if (lang === "sd") {
        msg = msg.replace("سگهان ٿو", "سگهان ٿي");
      } else if (lang === "doi") {
        msg = msg.replace("सकनां", "सकनी आं");
      }
    }
    return msg;
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    // We need to read userName directly here for initial state
    let initialName = "";
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get("botName");
      if (urlBotName) {
        initialName = urlBotName;
      } else {
        initialName = safeStorage.getItem("userName_v1") || "";
      }

      const savedMessages = safeStorage.getItem("current_messages_v1");
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    safeStorage.setItem("current_messages_v1", JSON.stringify(messages));
  }, [messages]);

  // Update initial message when language or bot name changes
  useEffect(() => {
    const currentBotName = selectedRole && selectedRole.id !== "sales" ? demoBotName : userName;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === "1" || msg.id === "1-model") {
          return { ...msg, text: getInitialMessage(uiLang, currentBotName, selectedRole) };
        }
        return msg;
      }),
    );

    setSavedChats((prev) =>
      prev.map((chat) => ({
        ...chat,
        messages: chat.messages.map((msg) => {
          if (msg.id === "1" || msg.id === "1-model") {
            return { ...msg, text: getInitialMessage(uiLang, currentBotName, selectedRole) };
          }
          return msg;
        }),
      })),
    );
  }, [uiLang, userName, demoBotName, selectedRole]);

  useEffect(() => {
    try {
      safeStorage.setItem("userName_v1", userName);
    } catch (e) {
      // Ignore storage errors
    }
  }, [userName]);

  useEffect(() => {
    let i = 0;
    let messageIndex = 0;
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const messages = (t.typeMessages || [t.typeMessage]).map((msg: string) =>
      msg.replace(
        /Nard|नॉर्ड|নর্ড|நார்ட்|నార్డ్|નોર્ડ|ನಾರ್ಡ್|നോർഡ്|ନର୍ଡ|ਨਾਰਡ|نارڈ|نارڊ|ᱱᱚᱨᱰ/gi,
        displayBotName,
      ),
    );

    const typeWriter = () => {
      if (!isMounted) return;

      const currentMessage = messages[messageIndex];

      if (i < currentMessage.length) {
        setPlaceholderText(currentMessage.substring(0, i + 1));
        i++;
        timeoutId = setTimeout(typeWriter, 100);
      } else {
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          i = 0;
          messageIndex = (messageIndex + 1) % messages.length;
          setPlaceholderText("");
          typeWriter();
        }, 3000);
      }
    };

    typeWriter();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [t.typeMessage, t.typeMessages, displayBotName]);

  const [selectedImage, setSelectedImage] = useState<{
    data: string;
    mimeType: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const liveSubtitlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (placeholderRef.current) {
      placeholderRef.current.scrollTop = placeholderRef.current.scrollHeight;
    }
  }, [placeholderText]);

  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Chat History States
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    try {
      const saved = safeStorage.getItem("savedChats_v1");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse saved chats:", e);
      return [];
    }
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [chatNameInput, setChatNameInput] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");
  const [showOptionsId, setShowOptionsId] = useState<string | null>(null);

  // Landing Page State
  const [floatPos, setFloatPos] = useState<
    "tl" | "tr" | "ml" | "mr" | "bl" | "br"
  >("br");
  const [isFloatDragging, setIsFloatDragging] = useState(false);
  const floatControls = useAnimation();

  const [nardNowPos, setNardNowPos] = useState<
    "tl" | "tr" | "ml" | "mr" | "bl" | "br"
  >("bl");
  const [isNardNowDragging, setIsNardNowDragging] = useState(false);
  const [showNardNowButton, setShowNardNowButton] = useState<boolean>(true);
  const [showBotIcon, setShowBotIcon] = useState<boolean>(true);
  const nardNowControls = useAnimation();

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1000,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getSnapCoords = (pos: string) => {
    const isMd = windowSize.width >= 768;
    const size = isMd ? 80 : 64; // w-20 = 80px, w-16 = 64px
    const margin = 16;

    const width = windowSize.width;
    const height = windowSize.height;

    const leftX = margin;
    const rightX = width - size - margin;
    const topY = margin;
    const bottomY = height - size - margin;
    const midY = (height - size) / 2;

    switch (pos) {
      case "tl":
        return { x: leftX, y: topY };
      case "tr":
        return { x: rightX, y: topY };
      case "ml":
        return { x: leftX, y: midY };
      case "mr":
        return { x: rightX, y: midY };
      case "bl":
        return { x: leftX, y: bottomY };
      case "br":
        return { x: rightX, y: bottomY };
      default:
        return { x: rightX, y: bottomY };
    }
  };

  const [showLandingPage, setShowLandingPage] = useState<boolean>(() => {
    return freeTrialEnd === null && subscriptionStatus !== "active";
  });
  const [showPathModal, setShowPathModal] = useState(false);
  const [autoScrollModal, setAutoScrollModal] = useState(false);
  const [autoScrollLandingPage, setAutoScrollLandingPage] = useState(false);

  useEffect(() => {
    if (showPathModal && autoScrollModal) {
      const timer = setTimeout(() => {
        const modalContent = document.getElementById("path-modal-content");
        if (modalContent) {
          const targetScroll =
            modalContent.scrollHeight - modalContent.clientHeight;
          if (targetScroll <= 0) return;

          const duration = 20000;
          const start = modalContent.scrollTop;
          const startTime = performance.now();

          const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            modalContent.scrollTop = start + (targetScroll - start) * progress;
            if (progress < 1 && autoScrollModalRef.current) {
              window.requestAnimationFrame(step);
            }
          };
          window.requestAnimationFrame(step);
        }
      }, 500); // slight delay to allow rendering
      return () => clearTimeout(timer);
    }
  }, [showPathModal, autoScrollModal]);
  
  const autoScrollModalRef = useRef(autoScrollModal);
  useEffect(() => {
    autoScrollModalRef.current = autoScrollModal;
  }, [autoScrollModal]);

  useEffect(() => {
    if (showLandingPage && autoScrollLandingPage) {
      const timer = setTimeout(() => {
        const content = document.getElementById("landing-page-content");
        if (content) {
          const targetScroll = content.scrollHeight - content.clientHeight;
          if (targetScroll <= 0) return;

          const duration = 20000;
          const start = content.scrollTop;
          const startTime = performance.now();

          const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            content.scrollTop = start + (targetScroll - start) * progress;
            if (progress < 1 && autoScrollLandingPageRef.current) {
              window.requestAnimationFrame(step);
            }
          };
          window.requestAnimationFrame(step);
        }
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [showLandingPage, autoScrollLandingPage]);

  const autoScrollLandingPageRef = useRef(autoScrollLandingPage);
  useEffect(() => {
    autoScrollLandingPageRef.current = autoScrollLandingPage;
  }, [autoScrollLandingPage]);

  const [selectedPath, setSelectedPath] = useState<
    "widget" | "platform" | null
  >(null);
  
  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTrialPlan, setPendingTrialPlan] = useState<"basic" | "pro" | "ultra" | null>(null);
  const [isPendingFreeTrial, setIsPendingFreeTrial] = useState(false);
  const [authStep, setAuthStep] = useState<"method" | "phone" | "otp">("method");
  const [authPhone, setAuthPhone] = useState("");
  const [authOtp, setAuthOtp] = useState(["", "", "", "", "", ""]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSelectPlan = (plan: "basic" | "pro" | "ultra", isFreeTrial: boolean) => {
    setPendingTrialPlan(plan);
    setIsPendingFreeTrial(isFreeTrial);
    setAuthStep("method");
    setAuthPhone("");
    setAuthOtp(["", "", "", "", "", ""]);
    setShowAuthModal(true);
  };

  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const finishAuthAndProceed = () => {
    setShowAuthModal(false);
      
    if (pendingTrialPlan) {
      setTrialPlan(pendingTrialPlan);
    }
    
    setShowPathModal(false);
    setShowLandingPage(false);
    setShowClientPanel(true);

    if (isPendingFreeTrial) {
      setFreeTrialEnd(Date.now() + 2 * 60 * 1000);
      try {
        safeStorage.removeItem("nard_final_offer_seen");
      } catch (e) {}

      if ("speechSynthesis" in window) {
        const msg = new SpeechSynthesisUtterance(
          uiLang === "hi"
            ? "लॉगिन सफल रहा। आपका फ्री ट्रायल शुरू हो गया है।"
            : "Login successful. Your free trial has started."
        );
        msg.lang = uiLang === "hi" ? "hi-IN" : "en-IN";
        window.speechSynthesis.speak(msg);
      }
    } else {
      if ("speechSynthesis" in window) {
        const msg = new SpeechSynthesisUtterance(
          uiLang === "hi"
            ? "लॉगिन सफल रहा।"
            : "Login successful."
        );
        msg.lang = uiLang === "hi" ? "hi-IN" : "en-IN";
        window.speechSynthesis.speak(msg);
      }
    }
  };

  const handleAuthComplete = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      if (confirmationResult) {
        const code = authOtp.join("");
        await confirmationResult.confirm(code);
        finishAuthAndProceed();
      }
    } catch (err: any) {
      setError(err.message || "OTP verification failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      finishAuthAndProceed();
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError(uiLang === "hi" ? "फायरबेस कंसोल में 'Google Authentication' इनेबल नहीं है।" : "Google authentication is not enabled in Firebase Console.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(uiLang === "hi" ? "यह डोमेन फायरबेस में ऑथराइज्ड नहीं है।" : "This domain is not authorized in Firebase.");
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || "Google login failed");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const provider = new FacebookAuthProvider();
      await signInWithPopup(auth, provider);
      finishAuthAndProceed();
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError(uiLang === "hi" ? "फायरबेस कंसोल में 'Facebook Authentication' इनेबल नहीं है।" : "Facebook authentication is not enabled in Firebase Console.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(uiLang === "hi" ? "यह डोमेन फायरबेस में ऑथराइज्ड नहीं है।" : "This domain is not authorized in Firebase.");
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || "Facebook login failed");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const sendOtp = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible'
        });
      }
      const formattedPhone = "+91" + authPhone;
      const result = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmationResult(result);
      setAuthStep("otp");
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError(uiLang === "hi" 
          ? "फायरबेस कंसोल में 'Phone Authentication' इनेबल नहीं है (Error: operation-not-allowed)। कृपया डेवलपर से संपर्क करें।" 
          : "Phone authentication is not enabled in Firebase Console (Error: operation-not-allowed).");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(uiLang === "hi" 
          ? "यह डोमेन फायरबेस में ऑथराइज्ड नहीं है। कृपया Firebase Console > Authentication > Settings > Authorized domains में इस URL को जोड़ें।"
          : "This domain is not authorized. Add it in Firebase Console > Auth > Settings > Authorized domains.");
      } else {
        setError(err.message || "Failed to send OTP");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // App Tour State
  const [showTour, setShowTour] = useState(() => {
    try {
      return safeStorage.getItem("nard_tour_completed_v2") !== "true";
    } catch (e) {
      return true;
    }
  });

  const handleTourComplete = () => {
    setShowTour(false);
    try {
      safeStorage.setItem("nard_tour_completed_v2", "true");
    } catch (e) {}
  };

  // Removed Nard SMS Integration States
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showClientPanel, setShowClientPanel] = useState(() => {
    return (
      subscriptionStatus === "active" ||
      (freeTrialEnd !== null && Date.now() < freeTrialEnd)
    );
  });
  const [activeProductPopup, setActiveProductPopup] = useState<any | null>(
    null,
  );

  // Auto-detect products in recent AI message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "model" && lastMsg.text) {
        const inv = inventoryState;
        let foundItem = null;
        for (const item of inv) {
          const nameLower = item.name.toLowerCase();
          if (
            lastMsg.text.toLowerCase().includes(nameLower) &&
            lastMsg.text.includes(item.price.toString())
          ) {
            foundItem = item;
            break;
          }
        }
        if (foundItem && foundItem.inStock) {
          // If already showing SAME item, ignore. Else update.
          setActiveProductPopup((prev: any) => {
            if (prev && prev.id === foundItem.id) return prev;
            return foundItem;
          });
        }
      }
    }
  }, [messages]);

  // Auto dismiss popup
  useEffect(() => {
    let timer: any;
    if (activeProductPopup) {
      timer = setTimeout(() => {
        setActiveProductPopup(null);
      }, 20000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [activeProductPopup]);

  useEffect(() => {
    if (showLandingPage) {
      floatControls.start(getSnapCoords(floatPos));
      nardNowControls.start(getSnapCoords(nardNowPos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatPos, nardNowPos, windowSize, showLandingPage]);

  const industries = [
    {
      id: "agriculture",
      name: lT.industries?.agriculture?.name || "Agriculture",
      hex: "#22c55e",
      color: "from-green-500 to-emerald-700",
      textColors: "text-green-50",
      bg: "bg-green-900/40",
      accent: "border-green-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]",
      tagline: lT.industries?.agriculture?.tagline || "Empowering Farmers",
    },
    {
      id: "medical",
      name: lT.industries?.medical?.name || "Medical",
      hex: "#3b82f6",
      color: "from-blue-500 to-cyan-700",
      textColors: "text-blue-50",
      bg: "bg-blue-900/40",
      accent: "border-blue-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]",
      tagline: lT.industries?.medical?.tagline || "Caring for Patients",
    },
    {
      id: "education",
      name: lT.industries?.education?.name || "Education",
      hex: "#f97316",
      color: "from-orange-500 to-amber-700",
      textColors: "text-orange-50",
      bg: "bg-orange-900/40",
      accent: "border-orange-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]",
      tagline: lT.industries?.education?.tagline || "Guiding Students",
    },
    {
      id: "business",
      name: lT.industries?.business?.name || "Business",
      hex: "#a855f7",
      color: "from-purple-500 to-indigo-700",
      textColors: "text-purple-50",
      bg: "bg-purple-900/40",
      accent: "border-purple-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]",
      tagline: lT.industries?.business?.tagline || "Scaling Enterprises",
    },
    {
      id: "finance",
      name: lT.industries?.finance?.name || "Finance",
      hex: "#06b6d4",
      color: "from-cyan-500 to-teal-700",
      textColors: "text-cyan-50",
      bg: "bg-cyan-900/40",
      accent: "border-cyan-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]",
      tagline: lT.industries?.finance?.tagline || "Securing Wealth",
    },
    {
      id: "retail",
      name: lT.industries?.retail?.name || "Retail",
      hex: "#ec4899",
      color: "from-pink-500 to-rose-700",
      textColors: "text-pink-50",
      bg: "bg-pink-900/40",
      accent: "border-pink-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]",
      tagline: lT.industries?.retail?.tagline || "Connecting Buyers",
    },
  ];
  const [brandTheme, setBrandTheme] = useState(industries[0]);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBrandLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    safeStorage.setItem("savedChats_v1", JSON.stringify(savedChats));
  }, [savedChats]);

  useEffect(() => {
    // Only save currentChatId to storage if needed, but we don't persist current messages across reloads anymore
    if (currentChatId) {
      safeStorage.setItem("currentChatId_v1", currentChatId);
    } else {
      safeStorage.removeItem("currentChatId_v1");
    }
  }, [currentChatId]);

  // Sync messages to the current saved chat
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setSavedChats((prev) => {
        const existingChat = prev.find((chat) => chat.id === currentChatId);
        // Only update if messages actually changed to avoid unnecessary timestamp updates
        if (
          existingChat &&
          JSON.stringify(existingChat.messages) === JSON.stringify(messages)
        ) {
          return prev;
        }
        return prev.map((chat) =>
          chat.id === currentChatId
            ? { ...chat, messages, timestamp: Date.now() }
            : chat,
        );
      });
    }
  }, [messages, currentChatId]);

  const [isLive, setIsLive] = useState(false);
  const [liveSessionStartIndex, setLiveSessionStartIndex] = useState(0);
  const [liveGreetingFinished, setLiveGreetingFinished] = useState(false);
  const [isClientSpeaking, setIsClientSpeaking] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const isModelSpeakingRef = useRef(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const isVideoPlayingRef = useRef(false);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    isVideoPlayingRef.current = isVideoPlaying;
    const video = liveVideoRef.current;
    if (video) {
      // Force muted to true to appease iOS Safari policies
      video.muted = true;
      video.defaultMuted = true;

      if (isVideoPlaying) {
        // Track the play promise to handle interruptions
        const promise = video.play();
        playPromiseRef.current = promise;
        if (promise !== undefined) {
          promise.catch(e => {
            if (e.name !== 'AbortError') {
               console.warn("Video play failed", e);
            }
          });
        }
      } else {
        // Only pause if no play is pending, or wait for it
        if (playPromiseRef.current) {
          playPromiseRef.current.then(() => {
            if (!isVideoPlayingRef.current) video.pause();
          }).catch(() => {
            video.pause();
          });
        } else {
          video.pause();
        }
      }
    }
  }, [isVideoPlaying]);

 

  useEffect(() => {
    const onUserActivity = () => {
      setIsClientSpeaking(true);
      if (showPromoImageRef.current) {
        setShowPromoImage(false);
        showPromoImageRef.current = false;
        if (postResponseLandingTimerRef.current) {
          clearTimeout(postResponseLandingTimerRef.current);
        }
      }
      if (showPathModalTempRef.current) {
        setShowPathModal(false);
        setAutoScrollModal(false);
        showPathModalTempRef.current = false;
        setSelectedPath(null);
        if (postResponseLandingTimerRef.current) {
          clearTimeout(postResponseLandingTimerRef.current);
        }
      }
      if (showLandingPageTempRef.current) {
        setShowLandingPage(false);
        showLandingPageTempRef.current = false;
        setAutoScrollLandingPage(false);
        if (postResponseLandingTimerRef.current) {
          clearTimeout(postResponseLandingTimerRef.current);
        }
      }
    };
    const onUserIdle = () => setIsClientSpeaking(false);
    
    window.addEventListener('live-user-activity', onUserActivity);
    window.addEventListener('live-user-idle', onUserIdle);
    
    // Also trigger idle if session stops
    if (!isLive) {
      setIsClientSpeaking(false);
      setLiveGreetingFinished(false);
    }
    
    return () => {
      window.removeEventListener('live-user-activity', onUserActivity);
      window.removeEventListener('live-user-idle', onUserIdle);
    };
  }, [isLive]);

  const liveModelResponseCount = useMemo(() => {
    return isLive ? messages.slice(liveSessionStartIndex).filter(m => m.isLive && m.role === "model").length : 0;
  }, [messages, isLive, liveSessionStartIndex]);

  const [returnToLandingOnExit, setReturnToLandingOnExit] = useState(false);
  const isLiveRef = useRef(false);
  const [hasLiveStarted, setHasLiveStarted] = useState(false);
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);
  const [isVoiceTyping, setIsVoiceTyping] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceTypingTranscriptRef = useRef("");
  const continuousVoiceModeRef = useRef(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playingTextIndex, setPlayingTextIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<string | null>(
    null,
  );

  const startVoiceRecognition = () => {
    stopMessageAudio();

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(
        t.speechNotSupported ||
          "Speech recognition is not supported in this browser.",
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    const langMap: Record<string, string> = {
      en: "en-IN",
      hi: "hi-IN",
      bho: "bho-IN",
      bn: "bn-IN",
      ta: "ta-IN",
      te: "te-IN",
      mr: "mr-IN",
      gu: "gu-IN",
      kn: "kn-IN",
      ml: "ml-IN",
      or: "or-IN",
      pa: "pa-IN",
      as: "as-IN",
      ur: "ur-IN",
    };
    recognition.lang = langMap[uiLang] || "en-IN";

    recognitionRef.current = recognition;

    // Store the existing input so we can append to it
    const existingInput = input.trim() ? input.trim() + " " : "";
    voiceTypingTranscriptRef.current = existingInput;

    recognition.onstart = () => {
      setIsVoiceTyping(true);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      const fullText = existingInput + currentTranscript;
      setInput(fullText);
      voiceTypingTranscriptRef.current = fullText;
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error", event.error);
      setIsVoiceTyping(false);
      if (event.error !== "no-speech") {
        continuousVoiceModeRef.current = false;
      } else if (continuousVoiceModeRef.current) {
        // If no speech, turn off continuous mode to prevent infinite loops of silence.
        continuousVoiceModeRef.current = false;
      }
    };

    recognition.onend = () => {
      setIsVoiceTyping(false);
      if (voiceTypingTranscriptRef.current.trim()) {
        const textToSend = voiceTypingTranscriptRef.current.trim();
        voiceTypingTranscriptRef.current = "";
        handleSend(textToSend, false, undefined, false, true);
      } else {
        // No text was spoken. Turn off continuous mode.
        continuousVoiceModeRef.current = false;
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("Failed to start speech recognition", e);
      setIsVoiceTyping(false);
      continuousVoiceModeRef.current = false;
    }
  };

  // Auto-restart voice recognition in continuous mode when model finishes speaking
  useEffect(() => {
    if (
      continuousVoiceModeRef.current &&
      !isModelSpeaking &&
      !playingMessageId &&
      !isLoading &&
      !isVoiceTyping
    ) {
      // Small delay to ensure audio has completely stopped and UI has updated
      const timer = setTimeout(() => {
        if (
          continuousVoiceModeRef.current &&
          !isModelSpeaking &&
          !playingMessageId &&
          !isLoading &&
          !isVoiceTyping
        ) {
          startVoiceRecognition();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isModelSpeaking, playingMessageId, isLoading, isVoiceTyping]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [useFastModel, setUseFastModel] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLeftMenu, setShowLeftMenu] = useState(false);
  const leftMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        leftMenuRef.current &&
        !leftMenuRef.current.contains(event.target as Node)
      ) {
        setShowLeftMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  const showSettingsRef = useRef(showSettings);
  const showPathModalRef = useRef(showPathModal);
  const selectedPathRef = useRef(selectedPath);
  const showLandingPageRef = useRef(showLandingPage);
  const showFinalOfferPopupRef = useRef(showFinalOfferPopup);
  const showAdminPanelRef = useRef(showAdminPanel);
  const showClientPanelRef = useRef(showClientPanel);
  const isSaveModalOpenRef = useRef(isSaveModalOpen);
  const isHistoryOpenRef = useRef(isHistoryOpen);

  useEffect(() => {
    showSettingsRef.current = showSettings;
    showPathModalRef.current = showPathModal;
    selectedPathRef.current = selectedPath;
    showLandingPageRef.current = showLandingPage;
    showFinalOfferPopupRef.current = showFinalOfferPopup;
    showAdminPanelRef.current = showAdminPanel;
    showClientPanelRef.current = showClientPanel;
    isSaveModalOpenRef.current = isSaveModalOpen;
    isHistoryOpenRef.current = isHistoryOpen;
  }, [
    showSettings,
    showPathModal,
    selectedPath,
    showLandingPage,
    showFinalOfferPopup,
    showAdminPanel,
    showClientPanel,
    isSaveModalOpen,
    isHistoryOpen,
  ]);

  // Handle back button to close modals and navigate pages
  const prevShowSettingsRef = useRef(false);
  const prevShowPathModalRef = useRef(false);
  const prevSelectedPathRef = useRef<"widget" | "platform" | null>(null);
  const prevIsLiveRef = useRef(false);
  const prevShowLandingPageRef = useRef(true);
  const prevShowFinalOfferPopupRef = useRef(false);
  const prevShowAdminPanelRef = useRef(false);
  const prevShowClientPanelRef = useRef(false);
  const prevIsSaveModalOpenRef = useRef(false);
  const prevIsHistoryOpenRef = useRef(false);

  // We use this ref to detect if history.back() was triggered programmatically
  // so we can ignore the next popstate event.
  const ignoreNextPopState = useRef(false);

  useEffect(() => {
    // Fetch audio devices when settings page is opened
    if (showSettings && !prevShowSettingsRef.current) {
      fetchAudioDevices();
    }

    // Helper to push history state only when a popup opens
    const syncHistoryEntry = (
      current: boolean,
      prevRef: React.MutableRefObject<boolean>,
      name: string,
    ) => {
      if (current && !prevRef.current) {
        window.history.pushState({ modal: name }, "");
      } else if (!current && prevRef.current) {
        // If manually closed, but the history state still indicates this modal is open at the top, pop it.
        if (window.history.state?.modal === name) {
          ignoreNextPopState.current = true;
          window.history.back();
        }
      }
      prevRef.current = current;
    };

    syncHistoryEntry(showSettings, prevShowSettingsRef, "settings");
    syncHistoryEntry(isLive, prevIsLiveRef, "live");
    syncHistoryEntry(showPathModal, prevShowPathModalRef, "pathModal");
    syncHistoryEntry(
      showFinalOfferPopup,
      prevShowFinalOfferPopupRef,
      "finalOffer",
    );
    syncHistoryEntry(showAdminPanel, prevShowAdminPanelRef, "adminPanel");
    syncHistoryEntry(showClientPanel, prevShowClientPanelRef, "clientPanel");
    syncHistoryEntry(isSaveModalOpen, prevIsSaveModalOpenRef, "saveModal");
    syncHistoryEntry(isHistoryOpen, prevIsHistoryOpenRef, "historyModal");

    if (selectedPath && !prevSelectedPathRef.current) {
      window.history.pushState({ modal: "pathDetail" }, "");
    } else if (!selectedPath && prevSelectedPathRef.current) {
      if (window.history.state?.modal === "pathDetail") {
        ignoreNextPopState.current = true;
        window.history.back();
      }
    }
    prevSelectedPathRef.current = selectedPath;

    if (!showLandingPage && prevShowLandingPageRef.current) {
      window.history.pushState({ modal: "chat" }, "");
    } else if (showLandingPage && !prevShowLandingPageRef.current) {
      if (window.history.state?.modal === "chat") {
        ignoreNextPopState.current = true;
        window.history.back();
      }
    }
    prevShowLandingPageRef.current = showLandingPage;
  }, [
    showSettings,
    isLive,
    showPathModal,
    selectedPath,
    showLandingPage,
    showFinalOfferPopup,
    showAdminPanel,
    showClientPanel,
    isSaveModalOpen,
    isHistoryOpen,
  ]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }

      // Close in reverse order of likelihood or nested-ness
      if (showFinalOfferPopupRef.current) {
        setShowFinalOfferPopup(false);
      } else if (isSaveModalOpenRef.current) {
        setIsSaveModalOpen(false);
      } else if (isHistoryOpenRef.current) {
        setIsHistoryOpen(false);
      } else if (showAdminPanelRef.current) {
        setShowAdminPanel(false);
      } else if (showClientPanelRef.current) {
        setShowClientPanel(false);
      } else if (selectedPathRef.current) {
        setSelectedPath(null);
      } else if (showPathModalRef.current) {
        setShowPathModal(false);
      } else if (showSettingsRef.current) {
        setShowSettings(false);
      } else if (isLiveRef.current) {
        stopLiveAudio();
      } else if (!showLandingPageRef.current) {
        setShowLandingPage(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState(() =>
    parseFloat(safeStorage.getItem("speechRate_v4") || "0.8"),
  );
  const [premiumVoice, setPremiumVoice] = useState(() => {
    const saved = safeStorage.getItem("premiumVoice");
    if (saved) return saved;
    let initialName = "";
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get("botName");
      if (urlBotName) {
        initialName = urlBotName;
      } else {
        const savedName = safeStorage.getItem("userName");
        if (savedName) initialName = savedName;
      }
    } catch (e) {
      console.error("Error reading initial name for voice:", e);
    }
    const displayInitialName =
      initialName ||
      (safeStorage.getItem("uiLang") === "hi" ? "नॉर्ड" : "Nard");
    const gender = guessGender(displayInitialName);
    return gender === "F" ? "Zephyr" : "Charon";
  });

  // Auto-sync voice with bot name
  useEffect(() => {
    const currentBotName = selectedRole && selectedRole.id !== "sales" ? demoBotName : userName;
    const currentName = currentBotName || (uiLang === "hi" ? "नॉर्ड" : "Nard");
    const gender = guessGender(currentName);
    const expectedVoice = gender === "F" ? "Zephyr" : "Charon";

    // Only update if the current voice doesn't match the expected gender
    // This allows users to manually select a different voice of the SAME gender if they want,
    // but ensures a female name gets a female voice and a male name gets a male voice.
    const isCurrentVoiceFemale = ["Zephyr", "Kore"].includes(premiumVoice);
    const isExpectedVoiceFemale = gender === "F";

    if (isCurrentVoiceFemale !== isExpectedVoiceFemale) {
      setPremiumVoice(expectedVoice);
      safeStorage.setItem("premiumVoice", expectedVoice);
    }
  }, [userName, demoBotName, selectedRole, uiLang, premiumVoice]);

  // Clear setupName when userName is cleared so the setup box is empty when it reappears
  useEffect(() => {
    if (!userName) {
      setSetupName("");
    }
  }, [userName]);

  // Link global setError to the component state
  useEffect(() => {
    globalSetError = (msg: string | null) => {
      if (
        msg === "Traffic limit exceeded. Please try again later." ||
        msg === t.errorTraffic
      ) {
        // Do not show the red banner for traffic/quota errors
        // setError(t.errorTraffic);
      } else {
        setError(msg);
      }
    };
    return () => {
      globalSetError = null;
    };
  }, [t.errorTraffic]);

  // Auto-clear error notification after 10 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const speechRateRef = useRef(speechRate);
  const lastGenderRef = useRef<"M" | "F" | null>(null);
  const premiumVoiceRef = useRef(premiumVoice);
  const premiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const premiumAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(
    null,
  );
  const premiumAudioQueueRef = useRef<
    {
      text: string;
      startIndex: number;
      audio?: string;
      failed?: boolean;
      isFetching?: boolean;
    }[]
  >([]);
  const isPlayingPremiumRef = useRef(false);
  const isFetchingPremiumRef = useRef(false);
  const audioCacheRef = useRef<Record<string, string>>({});
  const premiumVoiceDisabledUntilRef = useRef<number>(0);

  // Chat History Functions
  const handleSaveChat = () => {
    if (!chatNameInput.trim()) return;

    if (savedChats.length >= 10) {
      setError(t.maxChatsError);
      setIsSaveModalOpen(false);
      return;
    }

    const newChat: SavedChat = {
      id: Date.now().toString(),
      name: chatNameInput.trim(),
      messages: [...messages],
      timestamp: Date.now(),
    };
    setSavedChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setIsSaveModalOpen(false);
    setChatNameInput("");
  };

  const handleLoadChat = (chat: SavedChat) => {
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
    setIsHistoryOpen(false);
  };

  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedChats((prev) => prev.filter((c) => c.id !== id));
    if (currentChatId === id) {
      handleNewChat();
    }
  };

  const stopVoiceRecognition = () => {
    setIsVoiceTyping(false);
    continuousVoiceModeRef.current = false;
    if (recognitionRef.current) {
      voiceTypingTranscriptRef.current = "";
      recognitionRef.current.stop();
    }
  };

  const handleNewChat = () => {
    stopMessageAudio();
    if (isVoiceTyping) {
      stopVoiceRecognition();
    }
    const currentBotName = selectedRole && selectedRole.id !== "sales" ? demoBotName : userName;
    const initialMsg = getInitialMessage(uiLang, currentBotName, selectedRole);
    setMessages([
      { id: Date.now().toString(), role: "model", text: initialMsg },
    ]);
    setCurrentChatId(null);
    setIsHistoryOpen(false);
    setIsLive(false); // Make sure live is also reset
  };

  const handleTogglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedChats((prev) =>
      prev.map((chat) =>
        chat.id === id ? { ...chat, isPinned: !chat.isPinned } : chat,
      ),
    );
  };

  const handleStartRename = (e: React.MouseEvent, chat: SavedChat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingChatName(chat.name);
  };

  const handleSaveRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editingChatName.trim() || !editingChatId) {
      setEditingChatId(null);
      return;
    }
    setSavedChats((prev) =>
      prev.map((chat) =>
        chat.id === editingChatId
          ? { ...chat, name: editingChatName.trim() }
          : chat,
      ),
    );
    setEditingChatId(null);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingChatId(null);
    setEditingChatName("");
  };

  // Initialize premium audio element
  useEffect(() => {
    if (!premiumAudioRef.current) {
      premiumAudioRef.current = new Audio();
      premiumAudioRef.current.crossOrigin = "anonymous";
    }
    return () => {
      if (premiumAudioRef.current) {
        premiumAudioRef.current.pause();
        premiumAudioRef.current.src = "";
      }
    };
  }, []);

  useEffect(() => {
    safeStorage.setItem("premiumVoice", premiumVoice);
    premiumVoiceRef.current = premiumVoice;

    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(
        (m) => m.id === msgId || m.id + "-model" === msgId,
      );
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [premiumVoice]);

  // Save speech settings and restart audio if playing
  useEffect(() => {
    safeStorage.setItem("speechRate_v4", speechRate.toString());
    speechRateRef.current = speechRate;

    // If audio is currently playing, restart it with the new rate
    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(
        (m) => m.id === msgId || m.id + "-model" === msgId,
      );
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        // Small delay to prevent stuttering if sliding quickly
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [speechRate]);

  // Zero-Delay Voice Setup (First Launch)
  useEffect(() => {
    if (!window.speechSynthesis) return;
    let initialized = false;

    const setupVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0 && !initialized) {
        initialized = true;
        // Just fetching the voices ensures they are loaded and ready for zero-delay playback
        // We look for the preferred Charon-like male voice to ensure it's available
        const preferredVoice = voices.find((v) => {
          const name = v.name.toLowerCase();
          return (
            name.includes("google uk english male") ||
            name.includes("daniel") ||
            name.includes("arthur") ||
            name.includes("hi-in-x-hie-local") ||
            name.includes("hi-in-x-hie") ||
            name.includes("-wavenet-b") ||
            name.includes("-neural2-b")
          );
        });
        if (preferredVoice) {
          console.log(
            "Zero-Delay Voice Setup: Best Charon-like Male Voice loaded:",
            preferredVoice.name,
          );
        }

        // Create a silent utterance to initialize the TTS engine in the background
        // This prevents the delay on the first actual speech
        try {
          const silentUtterance = new SpeechSynthesisUtterance("");
          silentUtterance.volume = 0;
          silentUtterance.rate = 0.9;
          silentUtterance.pitch = 0.8;
          if (preferredVoice) {
            silentUtterance.voice = preferredVoice;
          }
          window.speechSynthesis.speak(silentUtterance);
        } catch (e) {
          console.warn("Failed to initialize silent TTS", e);
        }

        // Also unlock the premium audio element
        if (premiumAudioRef.current) {
          try {
            premiumAudioRef.current
              .play()
              .then(() => {
                premiumAudioRef.current?.pause();
              })
              .catch(() => {
                // Ignore NotAllowedError on silent play
              });
          } catch (e) {}
        }
      }
    };

    setupVoices();
    window.speechSynthesis.addEventListener("voiceschanged", setupVoices);
    window.addEventListener("click", setupVoices, { once: true });
    window.addEventListener("touchstart", setupVoices, { once: true });

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", setupVoices);
      window.removeEventListener("click", setupVoices);
      window.removeEventListener("touchstart", setupVoices);
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    // Don't copy the suggested questions part
    const cleanText = text.split("---SUGGESTED_QUESTIONS---")[0].trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleShare = async (text: string) => {
    if (!text) return;
    const cleanText = text.split("---SUGGESTED_QUESTIONS---")[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Your Identity Response`,
          text: cleanText,
        });
      } catch (error) {
        console.warn("Error sharing:", error);
      }
    } else {
      // Fallback to copy if share is not supported
      navigator.clipboard.writeText(cleanText);
      setError(t.copied);
    }
  };

  const parseMessage = (text: string) => {
    if (!text || typeof text !== "string")
      return { mainText: "", questions: [] };
    const adjustedText = getGenderAdjustedText(text, uiLang, displayBotName);
    const parts = adjustedText.split("---SUGGESTED_QUESTIONS---");
    // Strip any hidden recap blocks used for history reminders
    // We use a multi-stage regex to catch both finished and ongoing blocks
    let strippedText = parts[0];
    // 1. Strip full recap blocks (support newlines with [^])
    strippedText = strippedText.replace(
      /\[\[RECAP\]\][^]*?\[\[ENDRECAP\]\](---RECAP_SPLIT---)?/gi,
      "",
    );
    // 2. If the model missed [[RECAP]] but has [[ENDRECAP]], strip everything before it
    if (strippedText.toUpperCase().includes("[[ENDRECAP]]")) {
      const endMarker = "[[ENDRECAP]]";
      const index = strippedText.toUpperCase().lastIndexOf(endMarker);
      strippedText = strippedText.substring(index + endMarker.length);
      // Also strip any partial markers that might be left
      strippedText = strippedText.replace(/^---RECAP_SPLIT---/gi, "");
    }
    // 3. Strip ongoing/broken blocks
    strippedText = strippedText.replace(/\[\[RECAP\]\][^]*?$/gi, "");
    strippedText = strippedText.replace(/\[\[RECAP\]\]/gi, "");
    strippedText = strippedText.replace(/\[\[ENDRECAP\]\]/gi, "");
    strippedText = strippedText.replace(/---RECAP_SPLIT---/gi, "");

    const mainText = strippedText
      .trim()
      .replace(/(?<!\n)\r?\n(?!\r?\n)/g, "\n\n");
    const questions: string[] = [];

    if (parts.length > 1) {
      const questionsText = parts[1].trim();
      const lines = questionsText.split("\n");
      for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.*)/);
        if (match && match[1]) {
          // Remove any markdown bolding that might have been added
          questions.push(match[1].replace(/\*\*/g, "").trim());
        }
      }
    }

    return { mainText, questions };
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Live API Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const isInitialResumeTurnRef = useRef(false);
  const isModelGeneratingRef = useRef(false);
  const isSessionActiveRef = useRef(false);
  const liveRecapBufferRef = useRef("");
  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextAudioTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const silentOscillatorRef = useRef<OscillatorNode | null>(null);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMicMutedRef = useRef(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  const [isLiveConnecting, setIsLiveConnecting] = useState(false);
  const [showLiveWelcomeAnimation, setShowLiveWelcomeAnimation] = useState(false);
  const [showGreetingMessage, setShowGreetingMessage] = useState(false);
  const [showPromoImage, setShowPromoImage] = useState(false);
  const showPromoImageRef = useRef(false);
  const [hasShownPromoImage, setHasShownPromoImage] = useState(false);
  const prevIsModelSpeakingRef = useRef(false);
  const postResponseLandingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveModelTurnCountRef = useRef(0);
  const showPathModalTempRef = useRef(false);
  const showLandingPageTempRef = useRef(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] =
    useState<string>("default");

  // Trigger promo image after the first live greeting finishes
  useEffect(() => {
    if (isLive && liveGreetingFinished && !hasShownPromoImage && !isClientSpeaking) {
      setHasShownPromoImage(true);
      setShowPromoImage(true);
      showPromoImageRef.current = true;
      setTimeout(() => {
        setShowPromoImage(false);
        showPromoImageRef.current = false;
      }, 20000);
    }
  }, [isLive, liveGreetingFinished, hasShownPromoImage, isClientSpeaking]);

  // Show promo image or path modal for 10 seconds after subsequent responses
  useEffect(() => {
    if (isLive) {
      if (prevIsModelSpeakingRef.current && !isModelSpeaking) {
        // Model just finished speaking
        if (liveGreetingFinished && hasShownPromoImage && !showPromoImageRef.current && !showPathModalTempRef.current && !showLandingPageTempRef.current && !isClientSpeaking && !showLandingPage) {
          liveModelTurnCountRef.current += 1;
          const count = liveModelTurnCountRef.current;
          
          if (count === 1) {
            setShowLandingPage(true);
            showLandingPageTempRef.current = true;
            setAutoScrollLandingPage(true);
          } else if (count === 2) {
            setSelectedPath(null);
            setShowPathModal(true);
            showPathModalTempRef.current = true;
            setAutoScrollModal(true);
          } else if (count === 3) {
            setSelectedPath("platform");
            setShowPathModal(true);
            showPathModalTempRef.current = true;
            setAutoScrollModal(true);
          } else if (count === 4) {
            setSelectedPath(null);
            setShowPathModal(true);
            showPathModalTempRef.current = true;
            setAutoScrollModal(true);
          } else if (count === 5) {
            setSelectedPath("platform");
            setShowPathModal(true);
            showPathModalTempRef.current = true;
            setAutoScrollModal(false);
          } else {
            setSelectedPath(null);
            setShowPathModal(true);
            showPathModalTempRef.current = true;
            setAutoScrollModal(false);
          }
          
          if (postResponseLandingTimerRef.current) {
            clearTimeout(postResponseLandingTimerRef.current);
          }
          
          postResponseLandingTimerRef.current = setTimeout(() => {
            setShowPromoImage(false);
            showPromoImageRef.current = false;
            setShowPathModal(false);
            setAutoScrollModal(false);
            showPathModalTempRef.current = false;
            setShowLandingPage(false);
            showLandingPageTempRef.current = false;
            setAutoScrollLandingPage(false);
            setSelectedPath(null);
          }, 20000);
        }
      } else if (!prevIsModelSpeakingRef.current && isModelSpeaking) {
        // Model started speaking again
        setAutoScrollModal(false);
        setAutoScrollLandingPage(false);
        if (showPromoImageRef.current) {
           setShowPromoImage(false);
           showPromoImageRef.current = false;
           if (postResponseLandingTimerRef.current) {
             clearTimeout(postResponseLandingTimerRef.current);
           }
        }
        if (showPathModalTempRef.current) {
           setShowPathModal(false);
           setAutoScrollModal(false);
           showPathModalTempRef.current = false;
           setSelectedPath(null);
           if (postResponseLandingTimerRef.current) {
             clearTimeout(postResponseLandingTimerRef.current);
           }
        }
        if (showLandingPageTempRef.current) {
           setShowLandingPage(false);
           showLandingPageTempRef.current = false;
           setAutoScrollLandingPage(false);
           if (postResponseLandingTimerRef.current) {
             clearTimeout(postResponseLandingTimerRef.current);
           }
        }
      }
      prevIsModelSpeakingRef.current = isModelSpeaking;
    }
  }, [isLive, isModelSpeaking, liveGreetingFinished, hasShownPromoImage, isClientSpeaking, showLandingPage]);

  // Reset flags when live disconnects or starts connecting
  useEffect(() => {
    if (isLiveConnecting || !isLive) {
      setHasShownPromoImage(false);
      setShowPromoImage(false);
      showPromoImageRef.current = false;
      liveModelTurnCountRef.current = 0;
      setAutoScrollModal(false);
      setAutoScrollLandingPage(false);
      showPathModalTempRef.current = false;
      showLandingPageTempRef.current = false;
      
      if (postResponseLandingTimerRef.current) {
        clearTimeout(postResponseLandingTimerRef.current);
      }
    }
  }, [isLiveConnecting, isLive]);

  useEffect(() => {
    // Show video whenever the session is active and no one is currently speaking
    const shouldPlay = isLive && !isModelSpeaking && !isClientSpeaking && !showPromoImage && !showLandingPage && !showGreetingMessage && !showLiveWelcomeAnimation && !showPathModal;
    setIsVideoPlaying(shouldPlay);
  }, [isLive, isModelSpeaking, isClientSpeaking, showPromoImage, showLandingPage, showGreetingMessage, showLiveWelcomeAnimation, showPathModal]);

  // TTS Refs
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextIndexRef = useRef<number>(0);
  const currentTextRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const lastStartIndexRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(messages.length);
  const prevPlayingMessageIdRef = useRef<string | null>(null);
  const prevIsLoadingRef = useRef<boolean>(isLoading);
  const prevIsLiveForScrollRef = useRef<boolean>(isLive);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const hasSnappedRef = useRef(false);

  // Reset snapping flag when loading starts
  useEffect(() => {
    if (isLoading && !isStreaming) {
      hasSnappedRef.current = false;
    }
  }, [isLoading, isStreaming]);

  // Track previous playing message ID and handle scroll stabilization
  useEffect(() => {
    if (prevPlayingMessageIdRef.current !== null && playingMessageId === null) {
      const msgId = prevPlayingMessageIdRef.current;
      const msgEl = document.getElementById(`message-${msgId}`);
      if (msgEl) {
        msgEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    prevPlayingMessageIdRef.current = playingMessageId;
  }, [playingMessageId]);

  // Scroll logic for generation and message changes
  useLayoutEffect(() => {
    if (!playingMessageId) {
      const container = document.getElementById("main-scroll-container");
      if (container) {
        const isNewMessage = messages.length > lastMessageCountRef.current;
        const isNewChat = messages.length < lastMessageCountRef.current;
        const generationStarted =
          prevIsLoadingRef.current === false && isLoading === true;
        const generationFinished =
          prevIsLoadingRef.current === true && isLoading === false;
        const exitedLiveMode =
          prevIsLiveForScrollRef.current === true && isLive === false;

        lastMessageCountRef.current = messages.length;
        prevIsLoadingRef.current = isLoading;
        prevIsLiveForScrollRef.current = isLive;

        if (
          isNewMessage ||
          generationStarted ||
          (isStreaming && !hasSnappedRef.current)
        ) {
          const lastMsg = messages[messages.length - 1];
          const prevMsg =
            messages.length > 1 ? messages[messages.length - 2] : null;

          let targetId: string | undefined;
          let isUserSend = false;
          if (lastMsg?.role === "user") {
            targetId = lastMsg.id;
            isUserSend = true;
          } else if (lastMsg?.role === "model") {
            targetId =
              prevMsg && prevMsg.role === "user" ? prevMsg.id : lastMsg.id;
          }

          if (targetId) {
            const snapToTop = (behavior: ScrollBehavior = "auto") => {
              const el = document.getElementById(`message-${targetId}`);
              const scrollBox = document.getElementById(
                "main-scroll-container",
              );
              if (el && scrollBox) {
                const boxRect = scrollBox.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                const currentY = scrollBox.scrollTop;

                // Calculate exact top position relative to container
                const absoluteTop = elRect.top - boxRect.top + currentY;

                scrollBox.scrollTo({
                  top: Math.max(0, absoluteTop - 2),
                  behavior,
                });

                if (lastMsg?.role === "model") hasSnappedRef.current = true;
                return true;
              }
              return false;
            };

            if (isUserSend) {
              snapToTop("auto");
              requestAnimationFrame(() => snapToTop("auto"));
              setTimeout(() => snapToTop("auto"), 10);
            } else {
              snapToTop("auto");
              const pollTimes = [10, 30, 60, 100, 200, 400];
              pollTimes.forEach((delay) => {
                setTimeout(
                  () => snapToTop(delay < 100 ? "auto" : "smooth"),
                  delay,
                );
              });
              requestAnimationFrame(() => snapToTop("auto"));
            }
          }
        } else if (generationFinished || exitedLiveMode) {
          const lastMsg = messages[messages.length - 1];
          const prevMsg =
            messages.length > 1 ? messages[messages.length - 2] : null;
          // For exitedLiveMode we might want to just snap it, but a smooth scroll to the last model message is nice.
          // In live mode the bot speaks a lot. Let's just scroll to the very last message block.
          const targetId = exitedLiveMode
            ? lastMsg?.id
            : lastMsg?.role === "model" && prevMsg?.role === "user"
              ? prevMsg.id
              : lastMsg?.id;

          if (targetId) {
            setTimeout(() => {
              const el = document.getElementById(`message-${targetId}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);

            if (exitedLiveMode) {
              // Backup scroll to bottom:
              setTimeout(() => {
                const scrollBox = document.getElementById(
                  "main-scroll-container",
                );
                if (scrollBox)
                  scrollBox.scrollTo({
                    top: scrollBox.scrollHeight,
                    behavior: "smooth",
                  });
              }, 100);
            }
          } else if (exitedLiveMode) {
            setTimeout(() => {
              const scrollBox = document.getElementById(
                "main-scroll-container",
              );
              if (scrollBox)
                scrollBox.scrollTo({
                  top: scrollBox.scrollHeight,
                  behavior: "smooth",
                });
            }, 100);
          }
        } else if (isNewChat) {
          container.scrollTo({ top: 0, behavior: "auto" });
        }
      }
    }
  }, [
    messages,
    playingMessageId,
    isLoading,
    isModelSpeaking,
    isLive,
    isStreaming,
    currentChatId,
  ]);

  // Initialize Chat (removed as we use generateContent directly now)
  useEffect(() => {
    // Kept for consistency if any other initialization is needed later
  }, [useFastModel]);

  const stopMessageAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    ttsSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {}
      try {
        source.disconnect();
      } catch (e) {}
    });
    ttsSourcesRef.current = [];
    currentUtteranceRef.current = null;
    currentTextIndexRef.current = 0;
    setPlayingTextIndex(0);
    startTimeRef.current = 0;
    lastStartIndexRef.current = 0;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
      premiumAudioRef.current.currentTime = 0;
    }
    premiumAudioQueueRef.current = [];
    isPlayingPremiumRef.current = false;
    setPlayingMessageId(null);
    playingMessageIdRef.current = null;
    setIsPaused(false);
    setIsModelSpeaking(false);
    setIsGeneratingAudio(null);
  };

  const pauseMessageAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (startTimeRef.current > 0) {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const estimatedChars = Math.floor(elapsedSeconds * 12);
      const estimatedIndex = lastStartIndexRef.current + estimatedChars;

      currentTextIndexRef.current = Math.min(
        Math.max(currentTextIndexRef.current, estimatedIndex),
        currentTextRef.current.length,
      );
    }

    currentUtteranceRef.current = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
    }
    premiumAudioQueueRef.current = [];
    isPlayingPremiumRef.current = false;
    setIsPaused(true);
    setIsModelSpeaking(false);
  };

  const playNextPremiumChunk = (messageId: string) => {
    if (
      isPlayingPremiumRef.current ||
      premiumAudioQueueRef.current.length === 0
    )
      return;
    if (
      playingMessageIdRef.current !== messageId &&
      playingMessageIdRef.current !== null
    ) {
      premiumAudioQueueRef.current = [];
      return;
    }

    const nextChunk = premiumAudioQueueRef.current[0];

    if (nextChunk.failed) {
      // Just drop the failed chunk and continue
      premiumAudioQueueRef.current.shift();
      setIsGeneratingAudio(null);
      playNextPremiumChunk(messageId);
      return;
    }

    if (!nextChunk.audio) {
      // Still fetching, wait.
      return;
    }

    // We have audio, play it
    premiumAudioQueueRef.current.shift();
    isPlayingPremiumRef.current = true;

    // Cancel any standard TTS that might be playing to prevent overlap
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setPlayingMessageId(messageId);
    playingMessageIdRef.current = messageId;
    setIsModelSpeaking(true);
    setIsPaused(false);
    currentTextIndexRef.current = nextChunk.startIndex;
    setPlayingTextIndex(nextChunk.startIndex);

    if (premiumAudioRef.current) {
      premiumAudioRef.current.src = `data:audio/wav;base64,${nextChunk.audio}`;
      premiumAudioRef.current.playbackRate = speechRateRef.current;

      premiumAudioRef.current.onplay = () => {
        startTimeRef.current = Date.now();
        lastStartIndexRef.current = nextChunk.startIndex;
        setIsGeneratingAudio(null);
      };

      premiumAudioRef.current.ontimeupdate = () => {
        if (premiumAudioRef.current && premiumAudioRef.current.duration) {
          const progress =
            premiumAudioRef.current.currentTime /
            premiumAudioRef.current.duration;
          const estimatedIndex =
            nextChunk.startIndex + Math.floor(progress * nextChunk.text.length);
          if (estimatedIndex > currentTextIndexRef.current) {
            currentTextIndexRef.current = estimatedIndex;
            setPlayingTextIndex(estimatedIndex);
          }
        }
      };

      premiumAudioRef.current.onended = () => {
        isPlayingPremiumRef.current = false;
        if (premiumAudioQueueRef.current.length > 0) {
          playNextPremiumChunk(messageId);
        } else {
          setIsModelSpeaking(false);
          // Only clear if we are not currently generating text or audio for this message
          if (
            playingMessageIdRef.current === messageId &&
            !abortControllerRef.current &&
            isGeneratingAudio !== messageId
          ) {
            setPlayingMessageId(null);
            playingMessageIdRef.current = null;
            setIsPaused(false);
          }
        }
      };

      premiumAudioRef.current.play().catch((e) => {
        console.warn("Premium chunk play error", e);
        isPlayingPremiumRef.current = false;

        // Just drop it
        premiumAudioQueueRef.current.shift();
        setIsGeneratingAudio(null);
        playNextPremiumChunk(messageId);
      });

      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      if (audioContextRef.current && !analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.1; // Make it perfectly real time
      }
      if (
        audioContextRef.current &&
        analyserRef.current &&
        premiumAudioRef.current &&
        !premiumAudioSourceRef.current
      ) {
        try {
          premiumAudioSourceRef.current =
            audioContextRef.current.createMediaElementSource(
              premiumAudioRef.current,
            );
          premiumAudioSourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (e) {
          console.warn("Failed to connect audio source", e);
        }
      }
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current
          .resume()
          .catch((e) => console.warn("AudioContext resume failed:", e));
      }
    }
  };

  const processPremiumAudioQueue = async (messageId: string) => {
    if (isFetchingPremiumRef.current) return;

    const nextToFetch = premiumAudioQueueRef.current.find(
      (c) => !c.audio && !c.failed && !c.isFetching,
    );
    if (!nextToFetch) return;

    isFetchingPremiumRef.current = true;
    nextToFetch.isFetching = true;

    let retries = 0;
    const maxRetries = 4; // Try up to 5 times total
    let success = false;

    while (retries <= maxRetries && !success) {
      try {
        if (!ai) {
          initAI(getApiKey());
        }
        if (!ai) throw new Error("AI not initialized");

        // Rate limiting and exponential backoff to prevent 429 and 503 errors
        if (retries > 0) {
          // Exponential backoff: 1s, 2s, 4s, 8s
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retries - 1) * 1000),
          );
        } else {
          // Minimal base delay to prevent burst requests but keep streaming fast
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const fetchPromise = ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: nextToFetch.text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: premiumVoiceRef.current },
              },
            },
          },
        });

        // Prevent unhandled rejection if timeout wins
        fetchPromise.catch(() => {});

        // 15 second timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TTS Request Timeout")), 15000),
        );

        const response = (await Promise.race([
          fetchPromise,
          timeoutPromise,
        ])) as any;

        const rawAudio =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (rawAudio) {
          nextToFetch.audio = createWavFromPcmBase64(rawAudio);
          playNextPremiumChunk(messageId);
          success = true;
        } else {
          throw new Error("No audio data");
        }
      } catch (e: any) {
        console.warn(`Premium TTS chunk error (Attempt ${retries + 1})`, e);

        const errStr =
          typeof e === "string" ? e : e?.message || JSON.stringify(e);
        const isQuotaErr =
          errStr.toLowerCase().includes("quota") ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.toLowerCase().includes("limit") ||
          errStr.toLowerCase().includes("exceeded");

        const isRetryable =
          !isQuotaErr &&
          (errStr.includes("429") ||
            errStr.includes("503") ||
            errStr.toLowerCase().includes("service unavailable") ||
            errStr.toLowerCase().includes("busy") ||
            errStr.toLowerCase().includes("timeout") ||
            errStr.toLowerCase().includes("fetch"));

        if (isRetryable && retries < maxRetries) {
          retries++;
          console.log(
            `Retrying Premium TTS chunk... (${retries}/${maxRetries})`,
          );
        } else {
          nextToFetch.failed = true;

          console.warn("Premium voice failed. Dropping chunk.");
          const isQuotaErr =
            errStr.toLowerCase().includes("429") ||
            errStr.toLowerCase().includes("quota") ||
            errStr.includes("RESOURCE_EXHAUSTED") ||
            errStr.toLowerCase().includes("limit") ||
            errStr.toLowerCase().includes("exceeded");
          if (isQuotaErr) {
            setError(t.premiumVoiceError || "Premium voice quota exceeded.");
          }

          playNextPremiumChunk(messageId);
          break;
        }
      }
    }

    isFetchingPremiumRef.current = false;
    // Process next chunk if available
    processPremiumAudioQueue(messageId);
  };

  const queuePremiumAudioChunk = (
    chunkText: string,
    messageId: string,
    globalStartIndex: number,
  ) => {
    const cleanText = chunkText
      .replace(/\[\[RECAP\]\]|\[\[ENDRECAP\]\]|---RECAP_SPLIT---/gi, "")
      .replace(/<[^>]+>/g, (match) => " ".repeat(match.length))
      .replace(/[*_#`\-<>]/g, " ")
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, (match) =>
        " ".repeat(match.length),
      );

    if (cleanText.trim().length === 0) return;

    const chunkObj = {
      text: cleanText,
      startIndex: globalStartIndex,
      audio: undefined,
      failed: false,
      isFetching: false,
    };
    premiumAudioQueueRef.current.push(chunkObj);

    processPremiumAudioQueue(messageId);
  };

  const playMessageAudio = async (
    text: string,
    messageId: string,
    startIndex: number = 0,
    forceRestart: boolean = false,
  ) => {
    let actualStartIndex = startIndex;

    if (playingMessageId === messageId && startIndex === 0 && !forceRestart) {
      if (isPaused) {
        // Resume by restarting from the saved index
        actualStartIndex = currentTextIndexRef.current;
      } else {
        // Pause by cancelling, which is much more reliable on mobile
        pauseMessageAudio();
        return;
      }
    }

    if (actualStartIndex === 0) {
      stopMessageAudio();
      currentTextIndexRef.current = 0;
      setPlayingTextIndex(0);
    } else {
      currentUtteranceRef.current = null;
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    setPlayingMessageId(messageId);
    playingMessageIdRef.current = messageId;
    setIsPaused(false);

    try {
      // Remove basic markdown characters and replace emojis with spaces for cleaner speech
      // We replace with spaces of the same length to keep indices aligned for highlighting
      const cleanText = text
        .replace(/<[^>]+>/g, (match) => " ".repeat(match.length))
        .replace(/[*_#`\-<>]/g, " ")
        .replace(
          /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu,
          (match) => " ".repeat(match.length),
        );
      currentTextRef.current = cleanText;

      // Find the start of the current word to avoid cutting words in half
      let wordStartIndex = actualStartIndex;
      if (actualStartIndex > 0 && actualStartIndex < cleanText.length) {
        // Backtrack to the start of the word
        while (
          wordStartIndex > 0 &&
          cleanText[wordStartIndex - 1] !== " " &&
          cleanText[wordStartIndex - 1] !== "\n"
        ) {
          wordStartIndex--;
        }
      }

      let textToSpeak =
        wordStartIndex > 0 ? cleanText.substring(wordStartIndex) : cleanText;

      if (textToSpeak.trim().length === 0) {
        stopMessageAudio();
        return;
      }

      // Truncate to 5000 characters to prevent 500 Internal Error from TTS API
      if (textToSpeak.length > 5000) {
        textToSpeak = textToSpeak.substring(0, 5000);
      }

      // Check if premium voice is temporarily disabled due to quota
      if (Date.now() >= premiumVoiceDisabledUntilRef.current) {
        setIsGeneratingAudio(messageId);
        // Chunk the text and queue it for streaming playback
        let currentChunk = "";
        let globalStartIndex = wordStartIndex;

        // Split by words/tokens to process chunking
        const tokens = textToSpeak.split(/(\s+|[.,!?।]+)/);

        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          if (!token) continue;

          currentChunk += token;

          let shouldChunk = false;
          let splitIndex = currentChunk.length;

          // Use larger chunks for premium voice when playing full messages to avoid 15 RPM quota limit
          // First chunk can be smaller to start quickly, but subsequent chunks should be very large
          const isFirstChunk = globalStartIndex === wordStartIndex;
          const minChunkLength = isFirstChunk ? 150 : 2500;

          if (currentChunk.length >= minChunkLength) {
            const matches = [...currentChunk.matchAll(/[.।?!,]+(\s+|$)/g)];
            if (matches.length > 0) {
              const lastMatch = matches[matches.length - 1];
              splitIndex = lastMatch.index! + lastMatch[0].length;
              shouldChunk = true;
            } else if (currentChunk.length > minChunkLength * 2) {
              shouldChunk = true;
              const lastSpace = currentChunk.lastIndexOf(" ");
              splitIndex = lastSpace > 0 ? lastSpace + 1 : currentChunk.length;
            }
          }

          if (shouldChunk) {
            const textToPlay = currentChunk.substring(0, splitIndex);
            if (textToPlay.trim().length > 0) {
              queuePremiumAudioChunk(textToPlay, messageId, globalStartIndex);
              globalStartIndex += textToPlay.length;
            }
            currentChunk = currentChunk.substring(splitIndex);
          }
        }

        // Queue any remaining text
        if (currentChunk.trim().length > 0) {
          queuePremiumAudioChunk(currentChunk, messageId, globalStartIndex);
        }

        return;
      }
    } catch (e: any) {
      console.warn("TTS Error", e);
      const errStr = typeof e === "string" ? e : e.message || String(e);
      setError(`${t.errorTech} (${errStr})`);
      if (playingMessageIdRef.current === messageId) {
        setPlayingMessageId(null);
        playingMessageIdRef.current = null;
        setIsPaused(false);
      }
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    stopMessageAudio();
    continuousVoiceModeRef.current = false;
  };

  const handleProactiveVoice = (textPrompt: string) => {
    console.log("Nard बोलना शुरू कर रहा है (Proactive)...");
    handleSend(textPrompt, true, undefined, true);
  };

  const handleSend = async (
    textToSend?: string | React.MouseEvent,
    autoPlayResponse: boolean = false,
    editMsgId?: string,
    isHidden: boolean = false,
    keepVoiceMode: boolean = false,
  ) => {
    stopMessageAudio();

    if (!autoPlayResponse && !keepVoiceMode) {
      continuousVoiceModeRef.current = false;
    }

    if (isVoiceTyping && recognitionRef.current) {
      voiceTypingTranscriptRef.current = "";
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
      if (!keepVoiceMode) {
        continuousVoiceModeRef.current = false;
      }
    }

    const userText = typeof textToSend === "string" ? textToSend : input.trim();
    if (!userText && !selectedImage) return;
    if (isLoading) return;

    const imageToSend = selectedImage;
    if (!isHidden) {
      setInput("");
      setSelectedImage(null);
      setEditMsgId(null);
    }
    const newMsgId = editMsgId || Date.now().toString();
    const newModelMsgId = newMsgId + "-model-" + Date.now();

    let currentMessages: any[] = [];
    if (editMsgId) {
      const msgIndex = messages.findIndex((m) => m.id === editMsgId);
      if (msgIndex !== -1) {
        currentMessages = messages
          .slice(0, msgIndex + 1)
          .map((m) =>
            m.id === editMsgId
              ? { ...m, text: userText, image: imageToSend || m.image }
              : m,
          );
      } else {
        currentMessages = messages.map((m) =>
          m.id === editMsgId
            ? { ...m, text: userText, image: imageToSend || m.image }
            : m,
        );
      }
    } else {
      currentMessages = [
        ...messages,
        { id: newMsgId, role: "user", text: userText, image: imageToSend },
      ];
    }

    if (!isHidden) {
      setMessages(currentMessages);
    }

    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (!ai) {
        initAI(getApiKey());
      }
      if (!ai) {
        throw new Error(
          "AI service is not initialized. Please ensure your Gemini API key is correctly configured in the environment.",
        );
      }
      const modelName = useFastModel
        ? "gemini-3.1-flash-lite-preview"
        : "gemini-3.1-pro-preview";

      const contents: any[] = [];

      currentMessages
        .filter((m) => m.id !== "1" && !m.id.endsWith("-error"))
        .forEach((m) => {
          const parts: any[] = [];
          if (m.image) {
            parts.push({
              inlineData: { data: m.image.data, mimeType: m.image.mimeType },
            });
          }
          if (m.text && m.text.trim() !== "") {
            parts.push({ text: m.text });
          } else if (m.image) {
            parts.push({ text: "What is this image?" });
          } else {
            parts.push({ text: " " });
          }

          if (
            contents.length > 0 &&
            contents[contents.length - 1].role === m.role
          ) {
            contents[contents.length - 1].parts.push(...parts);
          } else {
            contents.push({ role: m.role, parts });
          }
        });

      const config: any = {
        thinkingConfig: {
          thinkingLevel: useFastModel
            ? ThinkingLevel.MINIMAL
            : ThinkingLevel.HIGH,
        },
      };
      let systemInstructionStr = String(SYSTEM_INSTRUCTION);

      if (selectedRole) {
        const personaBotName = selectedRole.id === "sales" ? selectedRole.name : (demoBotName.trim() ? demoBotName.trim() : selectedRole.name);
        systemInstructionStr += `\n\nCRITICAL PERSONA OVERRIDE: Your name is ${personaBotName}. You are acting as an expert in the domain of ${selectedRole.name}. Only answer questions and provide context related to this domain. If the user asks things outside this domain, politely pivot back to your area of expertise.`;
        if (selectedRole.id === "sales") {
          systemInstructionStr += `\n\nIMPORTANT SALES OBJECTIVE: You are selling Nard's White-Labeling AI service. Explain to the user how they can use Nard as a core conversational AI on their own platforms (agritech, medtech, edtech, e-commerce, banking, etc) with their own branding. Persuade them of the utility, flexibility, and 24/7 availability of Nard for scaling their business.`;
        }
      }

      if (pageContext) {
        systemInstructionStr += `\n\nCRITICAL CONTEXT FROM E-MAITRI PORTAL: The user is currently viewing the following content/page on the E-MAITRI portal. Use this context to answer their questions accurately:\n"""\n${pageContext}\n"""\n`;
      }

      if (uiLang === "hi") {
        systemInstructionStr += `\n\nCRITICAL: You MUST respond in Hindi (Devanagari script) only.`;
      } else if (uiLang === "bho") {
        systemInstructionStr += `\n\nCRITICAL: You MUST respond in Bhojpuri (Devanagari script) only.`;
      } else {
        systemInstructionStr += `\n\nCRITICAL: You MUST respond in English only.`;
      }

      if (selectedRole?.id !== "sales") {
        const currentBotName = selectedRole ? (demoBotName.trim() || selectedRole.name) : (userName.trim() || "Nard");
        if (currentMessages.length <= 2) {
          systemInstructionStr += `\n\nCRITICAL: Your name is ${currentBotName}. You must introduce yourself in your first response and refer to yourself using this name instead of Nard. Adopt the appropriate gender and persona matching the name '${currentBotName}', especially when speaking in languages with gendered grammar like Hindi.`;
        } else {
          systemInstructionStr += `\n\nCRITICAL: Your name is ${currentBotName}. DO NOT mention your name or introduce yourself again unless the user explicitly asks for it. Adopt the appropriate gender and persona matching the name '${currentBotName}'.`;
        }

        if (
          digitalIdentity.customInstructions &&
          digitalIdentity.customInstructions.trim()
        ) {
          systemInstructionStr += `\n\nCLIENT CUSTOM INSTRUCTIONS:\n${digitalIdentity.customInstructions}`;
        }
        if (digitalIdentity.clientUpiId && digitalIdentity.clientUpiId.trim()) {
          systemInstructionStr += `\n\nCLIENT UPI ID: ${digitalIdentity.clientUpiId}. If the user asks to make a payment or asks for payment details, generate a dynamic payment link or QR code using this UPI ID.`;
        }

        systemInstructionStr += getInventoryPrompt();
      }

      if (systemInstructionStr && systemInstructionStr.trim() !== "") {
        config.systemInstruction = systemInstructionStr;
      }

      let responseStream;
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: contents,
            config: config,
          });
          break;
        } catch (e: any) {
          if (abortController.signal.aborted) return;

          const errStr =
            typeof e === "string" ? e : e?.message || JSON.stringify(e);
          const isApiKeyError = errStr.toLowerCase().includes("api key") || errStr.includes("401") || errStr.includes("403");
          const isRetryable =
            errStr.includes("503") ||
            errStr.toLowerCase().includes("service unavailable") ||
            errStr.toLowerCase().includes("busy") ||
            errStr.toLowerCase().includes("traffic") ||
            errStr.toLowerCase().includes("deadline_exceeded") ||
            isApiKeyError;

          if (isRetryable && retries < maxRetries) {
            retries++;
            
            // If it's an API key error, try fetching a fresh token
            if (isApiKeyError) {
              try {
                const tokenRes = await fetch("/api/gemini-token");
                if (tokenRes.ok) {
                   const tokenData = await tokenRes.json();
                   if (tokenData.token) {
                       (window as any).DYNAMIC_GEMINI_API_KEY = tokenData.token;
                       initAI(tokenData.token);
                   }
                }
              } catch(e) {}
            }
            
            const delay = Math.pow(2, retries) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (abortController.signal.aborted) return;
            continue;
          }
          throw e;
        }
      }

      if (!responseStream) return;
      if (abortController.signal.aborted) return;

      setMessages((prev) => [
        ...prev,
        { id: newModelMsgId, role: "model", text: "" },
      ]);
      setIsStreaming(true);

      if (autoPlayResponse) {
        setIsGeneratingAudio(newModelMsgId);
      }

      let fullText = "";
      let currentChunk = "";
      let globalStartIndex = 0;
      let hasStartedPlaying = false;

      for await (const chunk of responseStream) {
        if (abortController.signal.aborted) {
          setIsStreaming(false);
          return;
        }

        const chunkText = chunk.text || "";
        const tokens = chunkText.split(/(\s+|[.,!?।]+)/);

        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          if (!token) continue;
          if (abortController.signal.aborted) return;

          fullText += token;
          currentChunk += token;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === newModelMsgId ? { ...m, text: fullText } : m,
            ),
          );

          if (autoPlayResponse) {
            let shouldChunk = false;
            let splitIndex = currentChunk.length;

            const isFirstChunk = globalStartIndex === 0;
            const premiumChunkLength = isFirstChunk ? 150 : 2500;
            const minChunkLength = premiumChunkLength;

            if (currentChunk.length >= minChunkLength) {
              const matches = [...currentChunk.matchAll(/[.।?!,]+(\s+|$)/g)];
              if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                splitIndex = lastMatch.index! + lastMatch[0].length;
                shouldChunk = true;
              } else if (currentChunk.length > minChunkLength * 2) {
                shouldChunk = true;
                const lastSpace = currentChunk.lastIndexOf(" ");
                splitIndex =
                  lastSpace > 0 ? lastSpace + 1 : currentChunk.length;
              }
            }

            if (shouldChunk) {
              const textToPlay = currentChunk.substring(0, splitIndex);
              if (textToPlay.trim().length > 0) {
                if (!hasStartedPlaying) {
                  stopMessageAudio();
                  hasStartedPlaying = true;
                }
                queuePremiumAudioChunk(
                  textToPlay,
                  newModelMsgId,
                  globalStartIndex,
                );
                globalStartIndex += textToPlay.length;
              }
              currentChunk = currentChunk.substring(splitIndex);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      if (autoPlayResponse && currentChunk.trim().length > 0) {
        if (!hasStartedPlaying) {
          stopMessageAudio();
        }
        queuePremiumAudioChunk(currentChunk, newModelMsgId, globalStartIndex);
      }
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (abortController.signal.aborted) return;
      const errStr =
        typeof error === "string"
          ? error
          : error?.message || JSON.stringify(error);
      const isQuotaErr =
        errStr.toLowerCase().includes("429") ||
        errStr.toLowerCase().includes("quota") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.toLowerCase().includes("limit") ||
        errStr.toLowerCase().includes("exceeded");

      if (isQuotaErr) {
        const errorId = newMsgId + "-error";
        setMessages((prev) => [
          ...prev,
          {
            id: errorId,
            role: "model",
            text: "Quota exceeded. Please try again later or add an API key.",
          },
        ]);
        setTimeout(
          () => setMessages((prev) => prev.filter((m) => m.id !== errorId)),
          3000,
        );
      } else {
        const errorId = newMsgId + "-error";
        setMessages((prev) => [
          ...prev,
          { id: errorId, role: "model", text: `Error: ${errStr}` },
        ]);
        setTimeout(
          () => setMessages((prev) => prev.filter((m) => m.id !== errorId)),
          5000,
        );
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        setIsStreaming(false);
        setIsGeneratingAudio(null);
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(undefined, false, editMsgId || undefined);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data) {
        if (event.data.type === "EMAITRI_CONTEXT") {
          if (event.data.payload) setPageContext(event.data.payload);
        } else if (event.data.type === "CONTEXT_UPDATE") {
          const section = event.data.page;
          const details = event.data.info;
          const promptForNard = `सिस्टम अपडेट: यूजर अभी '${section}' देख रहा है। विवरण: ${details}। नारद के अंदाज़ में केवल एक छोटा वाक्य (अधिकतम 15 शब्द) बोलें जो यूजर का मार्गदर्शन करे। सीधे बोलना शुरू करें, कोई औपचारिक अभिवादन न दोहराएं।`;
          handleProactiveVoice(promptForNard);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleProactiveVoice]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (!base64String) return;
      const base64Data = base64String.split(",")[1];
      setSelectedImage({
        data: base64Data,
        mimeType: file.type || "image/jpeg",
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleVoiceTyping = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (isVoiceTyping) {
      setIsVoiceTyping(false);
      continuousVoiceModeRef.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      return;
    }
    stopMessageAudio();
    continuousVoiceModeRef.current = true;
    startVoiceRecognition();
  };

  const fetchAudioDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === "audioinput");
        setAudioInputs(inputs);
      }
    } catch (err) {
      console.error("Error fetching audio devices:", err);
    }
  };

  const connectBluetooth = async () => {
    try {
      const nav = navigator as any;
      if (!nav.bluetooth) {
        alert(
          uiLang === "hi"
            ? "आपके ब्राउज़र में ब्लूटूथ सपोर्ट नहीं है।"
            : "Bluetooth is not supported in this browser.",
        );
        return;
      }
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["generic_audio"],
      });
      alert(
        uiLang === "hi"
          ? `${device.name} से कनेक्ट किया गया। कृपया इसे ऑडियो इनपुट के रूप में चुनें।`
          : `Connected to ${device.name}. Please select it as your audio input.`,
      );
      await fetchAudioDevices();
    } catch (error) {
      console.error("Bluetooth connection error:", error);
    }
  };

  const toggleMicMute = () => {
    const newMutedState = !isMicMutedRef.current;
    isMicMutedRef.current = newMutedState;
    setIsMicMuted(newMutedState);
  };

  const toggleLiveAudio = async (
    e?: React.MouseEvent | React.TouchEvent,
    overrideRole?: { id: string; name: string; color: string; bg: string },
  ) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    
    // Explicitly unlock video playback on iOS Safari within the user gesture execution context
    if (liveVideoRef.current) {
      liveVideoRef.current.play().catch((err) => console.warn("Early video play unlock failed:", err));
    }

    if (isSessionActiveRef.current) {
      stopLiveAudio();
      return;
    }

    setIsLiveConnecting(true);
    setShowLiveWelcomeAnimation(true);
    setShowGreetingMessage(false);
    setLiveGreetingFinished(false);
    setIsVideoPlaying(false);
    setLiveSessionStartIndex(messages.length);
    stopMessageAudio();

    if (isVoiceTyping && recognitionRef.current) {
      voiceTypingTranscriptRef.current = "";
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
      continuousVoiceModeRef.current = false;
    }

    try {
      let apiKey = getApiKey();
      try {
        const tokenRes = await fetch("/api/gemini-token");
        if (tokenRes.ok) {
           const tokenData = await tokenRes.json();
           if (tokenData.token) {
               (window as any).DYNAMIC_GEMINI_API_KEY = tokenData.token;
               apiKey = tokenData.token;
               initAI(apiKey);
           }
        }
      } catch(e) {
        console.warn("Could not fetch fresh API key", e);
      }
      
      console.log(
        "Starting Live Audio session with API Key status:",
        apiKey ? "Present" : "Missing",
      );

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:
            selectedAudioInput !== "default"
              ? { exact: selectedAudioInput }
              : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2,
        },
      });
      mediaStreamRef.current = stream;

      let audioCtx;
      try {
        audioCtx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )({ sampleRate: 16000 });
      } catch (e) {
        audioCtx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }

      await audioCtx.resume();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      if (!backgroundAudioRef.current) {
        const audioEl = new Audio();
        audioEl.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioEl.loop = true;
        (audioEl as any).playsInline = true;
        backgroundAudioRef.current = audioEl;
      }
      backgroundAudioRef.current
        .play()
        .catch((e) => console.warn("Background audio play failed:", e));

      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Live Chat Active",
          artist: "Lok Mitra AI",
          album: "Voice Assistant",
        });
      }

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // Silent
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      silentOscillatorRef.current = oscillator;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      // Connect the microphone source to the analyser for visualization
      source.connect(analyser);

      // DO NOT connect the analyser to the destination, as it will cause local echo!
      // analyser.connect(audioCtx.destination);

      analyserRef.current = analyser;

      // Use AudioWorklet if available, fallback to ScriptProcessor
      let processor: any;

      try {
        if (audioCtx.audioWorklet) {
          const workletCode = `
            class PCMProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (!input || input.length === 0) return true;

                const left = input[0];
                const right = input.length > 1 ? input[1] : input[0];
                const length = left.length;

                const outputPcm = new Float32Array(length);
                for (let i = 0; i < length; i++) {
                  // Mix down to mono
                  outputPcm[i] = (left[i] + right[i]) / 2;
                }

                this.port.postMessage(outputPcm);
                return true;
              }
            }
            registerProcessor('pcm-processor', PCMProcessor);
          `;
          const workletBlob = new Blob([workletCode], {
            type: "application/javascript",
          });
          const workletUrl = URL.createObjectURL(workletBlob);
          await audioCtx.audioWorklet.addModule(workletUrl);
          processor = new AudioWorkletNode(audioCtx, "pcm-processor");

          let pcmBuffer: number[] = [];

          processor.port.onmessage = (event: MessageEvent) => {
            const pcmData = event.data;
            // Downsample from 44.1kHz/48kHz to 16kHz
            const ratio = audioCtx.sampleRate / 16000;
            const newLength = Math.round(pcmData.length / ratio);

            let offset = 0;
            for (let i = 0; i < newLength; i++) {
              const nextOffset = Math.round((i + 1) * ratio);
              let sum = 0;
              let count = 0;
              for (let j = offset; j < nextOffset && j < pcmData.length; j++) {
                sum += pcmData[j];
                count++;
              }
              pcmBuffer.push(Math.min(1, Math.max(-1, sum / count)) * 0x7fff);
              offset = nextOffset;
            }

            // Send chunk when buffer reaches ~4096 samples (256ms at 16kHz)
            if (pcmBuffer.length >= 4096) {
              const result = new Int16Array(pcmBuffer);
              pcmBuffer = []; // Reset buffer

              const bytes = new Uint8Array(result.buffer);
              let binary = "";
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);

              if (
                sessionPromiseRef.current &&
                !isMicMutedRef.current &&
                !showPromoImageRef.current &&
                !showPathModalTempRef.current &&
                !showLandingPageTempRef.current &&
                isSessionActiveRef.current
              ) {
                sessionPromiseRef.current
                  .then((s) => {
                    try {
                      if (s && isSessionActiveRef.current) {
                        s.sendRealtimeInput({
                          audio: {
                            data: base64,
                            mimeType: "audio/pcm;rate=16000",
                          },
                        });
                      }
                    } catch (err: any) {
                      const errMsg = err?.message || String(err);
                      if (
                        !errMsg.includes("CLOSING") &&
                        !errMsg.includes("CLOSED")
                      ) {
                        console.warn("Failed to send audio input:", err);
                      } else {
                        isSessionActiveRef.current = false;
                        setIsSessionActive(false);
                      }
                    }
                  })
                  .catch(() => {});
              }
            }
          };

          source.connect(processor);
          const dummyDest = audioCtx.createMediaStreamDestination();
          processor.connect(dummyDest);
        } else {
          throw new Error("AudioWorklet not supported");
        }
      } catch (workletErr) {
        console.warn(
          "AudioWorklet failed, falling back to ScriptProcessor:",
          workletErr,
        );
        processor = audioCtx.createScriptProcessor(4096, 2, 1); // Request 2 inputs, 1 output

        let pcmBuffer: number[] = [];

        processor.onaudioprocess = (e: any) => {
          const left = e.inputBuffer.getChannelData(0);
          const right =
            e.inputBuffer.numberOfChannels > 1
              ? e.inputBuffer.getChannelData(1)
              : left;
          const length = left.length;

          const pcmData = new Float32Array(length);
          for (let i = 0; i < length; i++) {
            pcmData[i] = (left[i] + right[i]) / 2;
          }

          // Downsample from 44.1kHz/48kHz to 16kHz
          const ratio = audioCtx.sampleRate / 16000;
          const newLength = Math.round(pcmData.length / ratio);

          let offset = 0;
          for (let i = 0; i < newLength; i++) {
            const nextOffset = Math.round((i + 1) * ratio);
            let sum = 0;
            let count = 0;
            for (let j = offset; j < nextOffset && j < pcmData.length; j++) {
              sum += pcmData[j];
              count++;
            }
            pcmBuffer.push(Math.min(1, Math.max(-1, sum / count)) * 0x7fff);
            offset = nextOffset;
          }

          if (pcmBuffer.length >= 4096) {
            const result = new Int16Array(pcmBuffer);
            pcmBuffer = [];

            const bytes = new Uint8Array(result.buffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            if (
              sessionPromiseRef.current &&
              !isMicMutedRef.current &&
              !showPromoImageRef.current &&
              !showPathModalTempRef.current &&
              !showLandingPageTempRef.current &&
              isSessionActiveRef.current
            ) {
              sessionPromiseRef.current
                .then((s) => {
                  try {
                    if (s && isSessionActiveRef.current) {
                      s.sendRealtimeInput({
                        audio: {
                          data: base64,
                          mimeType: "audio/pcm;rate=16000",
                        },
                      });
                    }
                  } catch (err: any) {
                    const errMsg = err?.message || String(err);
                    if (
                      !errMsg.includes("CLOSING") &&
                      !errMsg.includes("CLOSED")
                    ) {
                      console.warn("Failed to send audio input:", err);
                    } else {
                      isSessionActiveRef.current = false;
                      setIsSessionActive(false);
                    }
                  }
                })
                .catch(() => {});
            }
          }
        };
        source.connect(processor);
        const dummyDest = audioCtx.createMediaStreamDestination();
        processor.connect(dummyDest);
      }
      processorRef.current = processor;

      if (!ai) {
        initAI(getApiKey());
      }
      if (!ai) {
        throw new Error(
          "AI service not initialized. Please ensure your Gemini API key is correctly configured in the environment.",
        );
      }
      let liveInstruction = SYSTEM_INSTRUCTION;

      const currentRole = overrideRole || selectedRole;

      if (currentRole) {
        const personaBotName = currentRole.id === "sales" ? currentRole.name : (demoBotName.trim() ? demoBotName.trim() : currentRole.name);
        liveInstruction += `\n\nCRITICAL PERSONA OVERRIDE: Your name is ${personaBotName}. You are now acting as ${currentRole.name}. Only answer questions and provide context related to the domain of ${currentRole.name}. If the user asks things outside this domain, politely pivot back to your area of expertise.`;
        if (currentRole.id === "sales") {
          liveInstruction += `\n\nIMPORTANT SALES OBJECTIVE: You are selling Nard's White-Labeling AI service. Explain to the user how they can use Nard as a core conversational AI on their own platforms (agritech, medtech, edtech, e-commerce, banking, etc) with their own branding. Persuade them of the utility, flexibility, and 24/7 availability of Nard for scaling their business.`;
        }
      }

      if (pageContext) {
        liveInstruction += `\n\nCRITICAL CONTEXT FROM E-MAITRI PORTAL: The user is currently viewing the following content/page on the E-MAITRI portal. Use this context to answer their questions accurately:\n"""\n${pageContext}\n"""\n`;
      }

      const langMapForInstruction: Record<string, string> = {
        hi: "Hindi",
        en: "English",
        bn: "Bengali",
        ta: "Tamil",
        te: "Telugu",
        mr: "Marathi",
        gu: "Gujarati",
        kn: "Kannada",
        ml: "Malayalam",
        ur: "Urdu",
        pa: "Punjabi",
        as: "Assamese",
        or: "Odia",
        bho: "Bhojpuri",
      };
      const currentLanguageName = langMapForInstruction[uiLang] || "English";

      liveInstruction += `\n\nCRITICAL: The user has selected ${currentLanguageName} as their preferred language. You MUST speak and respond ONLY in ${currentLanguageName} unless the user explicitly asks you to speak in another language.`;

      if (currentRole?.id !== "sales") {
        const currentBotName = currentRole ? (demoBotName.trim() || currentRole.name) : (userName.trim() || "Nard");
        if (messages.length <= 2) {
          liveInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. You must introduce yourself in your first response and refer to yourself using this name instead of Nard. Adopt the appropriate gender and persona matching the name '${currentBotName}', especially when speaking in languages with gendered grammar like Hindi.`;
        } else {
          liveInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. DO NOT mention your name or introduce yourself again unless the user explicitly asks for it. Adopt the appropriate gender and persona matching the name '${currentBotName}'.`;
        }

        if (
          digitalIdentity.customInstructions &&
          digitalIdentity.customInstructions.trim()
        ) {
          liveInstruction += `\n\nCLIENT CUSTOM INSTRUCTIONS:\n${digitalIdentity.customInstructions}`;
        }
        if (digitalIdentity.clientUpiId && digitalIdentity.clientUpiId.trim()) {
          liveInstruction += `\n\nCLIENT UPI ID: ${digitalIdentity.clientUpiId}. If the user asks to make a payment or asks for payment details, provide instructions on how to pay using this UPI ID.`;
        }

        liveInstruction += getInventoryPrompt();
      }

      liveInstruction +=
        "\n\nCRITICAL FOR LIVE VOICE CONVERSATION: DO NOT output the ---SUGGESTED_QUESTIONS--- section or any suggested questions at all. Just answer the user directly.";
      liveInstruction +=
        "\n\nCRITICAL RESUME MODE: If the user provides a 'transcript of our previous conversation', you MUST briefly summarize or acknowledge it first. In your TEXT output, you MUST strictly wrap this history reminder inside [[RECAP]] and [[ENDRECAP]] markers. Example: '[[RECAP]] Last time we discussed the election. [[ENDRECAP]] Hello!'. The UI will hide the bracketed text, but it is necessary for context preservation. Both [[RECAP]] and [[ENDRECAP]] tags MUST be present and capitalized.";

      const getBcp47Lang = (lang: string) => {
        switch (lang) {
          case "hi":
            return "hi-IN";
          case "bn":
            return "bn-IN";
          case "te":
            return "te-IN";
          case "mr":
            return "mr-IN";
          case "ta":
            return "ta-IN";
          case "ur":
            return "ur-IN";
          case "gu":
            return "gu-IN";
          case "kn":
            return "kn-IN";
          case "ml":
            return "ml-IN";
          case "pa":
            return "pa-IN";
          default:
            return "en-US";
        }
      };

      const bcpLang = getBcp47Lang(uiLang);

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: liveInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: premiumVoiceRef.current },
            },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Live API connected successfully. Session active.");
            setIsLiveConnecting(false);
            isSessionActiveRef.current = true;
            setIsSessionActive(true);
            nextAudioTimeRef.current = 0;
            
            setTimeout(() => {
              setShowLiveWelcomeAnimation(false);
              setShowGreetingMessage(true);
              setTimeout(() => {
                setShowGreetingMessage(false);
              }, 4000);
            }, 3000);

            setTimeout(() => {
              if (sessionPromiseRef.current && isSessionActiveRef.current) {
                console.log("Sending initial Live API message...");
                sessionPromiseRef.current
                  .then((s) => {
                    try {
                      if (s && isSessionActiveRef.current) {
                        if (messages.length <= 2) {
                          const introText = getInitialMessage(uiLang, userName, currentRole);
                          s.sendRealtimeInput({
                            text: `Please introduce yourself by saying exactly this phrase: '${introText}'`,
                          });
                        } else {
                          const recentMessages = messages.slice(-10);
                          const historyText = recentMessages
                            .map(
                              (m: any) =>
                                `${m.role === "user" ? "User" : "Assistant"}: ${parseMessage(m.text).mainText}`,
                            )
                            .join("\n");
                          isInitialResumeTurnRef.current = true;
                          s.sendRealtimeInput({
                            text: `Here is the transcript of our previous conversation:\n\n${historyText}\n\nPlease greet the user in ${currentLanguageName}. START your response with the history reminder. You MUST strictly wrap this entire history reminder like this: '[[RECAP]] brief summary here [[ENDRECAP]]'. Only after [[ENDRECAP]] should you say anything else. Important: The text inside [[RECAP]] and [[ENDRECAP]] markers will be completely hidden from the UI, but you MUST still speak it out loud.`,
                          });
                        }
                        console.log("Initial message sent to Live API.");
                      }
                    } catch (e) {
                      console.warn("Failed to send initial message:", e);
                    }
                  })
                  .catch((err) => {
                    console.warn(
                      "Session promise rejected during initial message:",
                      err,
                    );
                  });
              } else {
                console.warn(
                  "Session no longer active when trying to send initial message.",
                );
              }
            }, 7000);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              nextAudioTimeRef.current = 0;
              activeAudioSourcesRef.current.forEach((source) => {
                try {
                  source.stop();
                } catch (e) {}
              });
              activeAudioSourcesRef.current = [];
              if ((window as any).speakingTimeout) {
                clearTimeout((window as any).speakingTimeout);
              }
              isModelSpeakingRef.current = false;
              setIsModelSpeaking(false);
              setLiveGreetingFinished(true);
              isInitialResumeTurnRef.current = false;
              liveRecapBufferRef.current = "";
            }
            if (message.serverContent?.modelTurn) {
              isModelGeneratingRef.current = true;
            }
            const parts = message.serverContent?.modelTurn?.parts;
            let incomingText = "";
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  playLiveAudio(part.inlineData.data);
                }
                if (part.text) {
                  incomingText += part.text;
                }
              }
            }
            if (message.serverContent?.turnComplete) {
              isModelGeneratingRef.current = false;
              // Add a small cleanup step here if we already finished speaking but were waiting for turnComplete
              const timeUntilEnd = (nextAudioTimeRef.current - audioContextRef.current.currentTime) * 1000;
              if (timeUntilEnd <= 0) {
                 if ((window as any).speakingTimeout) {
                   clearTimeout((window as any).speakingTimeout);
                 }
                 isModelSpeakingRef.current = false;
                 setIsModelSpeaking(false);
                 setLiveGreetingFinished(true);
              }
            }

            const outputTranscription =
              message.serverContent?.outputTranscription;
            if (outputTranscription?.text) {
              // Duplication fix: prefer text from parts if available.
              if (!incomingText) {
                incomingText = outputTranscription.text;
              }
            }

            const inputTranscription =
              message.serverContent?.inputTranscription;
            if (incomingText || inputTranscription?.text || parts) {
              setHasLiveStarted(true);
            }

            if (inputTranscription?.text) {
              setMessages((prev) => {
                const newMessages = [...prev];
                let lastMsg = newMessages[newMessages.length - 1];
                if (!lastMsg || lastMsg.role !== "user" || !lastMsg.isLive) {
                  lastMsg = {
                    id: Date.now().toString() + Math.random(),
                    role: "user",
                    text: "",
                    isLive: true,
                  };
                  newMessages.push(lastMsg);
                } else {
                  lastMsg = {
                    ...lastMsg,
                    text: lastMsg.text + inputTranscription.text,
                  };
                  newMessages[newMessages.length - 1] = lastMsg;
                }
                return newMessages;
              });
            }

            if (incomingText) {
              // Isolated Buffer Tracking: Zero UI Leakage Strategy
              if (isInitialResumeTurnRef.current) {
                liveRecapBufferRef.current += incomingText;
                const bStr = liveRecapBufferRef.current;
                const hasEndTag = bStr.toUpperCase().includes("[[ENDRECAP]]");

                if (hasEndTag) {
                  isInitialResumeTurnRef.current = false;
                  const splitMarker = "[[ENDRECAP]]";
                  const splitIndex =
                    bStr.toUpperCase().indexOf(splitMarker) +
                    splitMarker.length;

                  let recapPart = bStr.substring(0, splitIndex);
                  if (!recapPart.toUpperCase().includes("[[RECAP]]")) {
                    recapPart = "[[RECAP]]" + recapPart;
                  }
                  recapPart += "---RECAP_SPLIT---";
                  const responsePart = bStr.substring(splitIndex);

                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString() + "rcp",
                      role: "model",
                      text: recapPart,
                      isLive: true,
                    },
                    {
                      id: Date.now().toString() + "ans",
                      role: "model",
                      text: responsePart,
                      isLive: true,
                    },
                  ]);
                  liveRecapBufferRef.current = "";
                } else if (bStr.length > 1000) {
                  isInitialResumeTurnRef.current = false;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString() + "flb",
                      role: "model",
                      text: bStr,
                      isLive: true,
                    },
                  ]);
                  liveRecapBufferRef.current = "";
                }
                return;
              }

              setMessages((prev) => {
                const newMessages = [...prev];
                let lastMsg = newMessages[newMessages.length - 1];
                const isOngoingModelMsg =
                  lastMsg && lastMsg.role === "model" && lastMsg.isLive;

                if (!isOngoingModelMsg) {
                  return [
                    ...prev,
                    {
                      id: Date.now().toString() + "-" + Math.random(),
                      role: "model",
                      text: incomingText,
                      isLive: true,
                    },
                  ];
                } else {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...lastMsg,
                    text: lastMsg.text + incomingText,
                  };
                  return newMessages;
                }
              });
            }
          },
          onclose: (event?: any) => {
            console.log("Live API connection closed.", event);
            if (event && event.code && event.code !== 1000) {
              let reason = event.reason || "Connection lost";
              if (event.code === 1007 && reason.toLowerCase().includes("api key")) {
                reason = "API Key Expired. Please set your own GEMINI_API_KEY in the AI Studio Settings (Secrets) menu to prevent expiration.";
              }
              setError(`Voice Session Closed: ${reason} (Code: ${event.code})`);
            }
            isSessionActiveRef.current = false;
            setIsSessionActive(false);
            stopLiveAudio();
          },
          onerror: (err: any) => {
            console.warn("Live API critical error:", err);
            const msg = err?.message || String(err) || "Unknown Live API Error";
            if (
              msg.toLowerCase().includes("quota") ||
              msg.toLowerCase().includes("exceeded") ||
              msg.includes("429") ||
              msg.includes("RESOURCE_EXHAUSTED") ||
              msg.includes("Network error")
            ) {
              setError(
                "Live Voice Error: Gemini API quota exceeded or connection blocked. Providing a custom API key is required to continue.",
              );
              if (
                typeof window !== "undefined" &&
                (window as any).aistudio &&
                (window as any).aistudio.openSelectKey
              ) {
                (window as any).aistudio
                  .openSelectKey()
                  .then(() => {
                    setError(
                      "API Key updated successfully! Please try connecting again.",
                    );
                    try {
                      initAI(getApiKey());
                    } catch (e) {}
                  })
                  .catch((e2: any) =>
                    console.warn("API Key selection error:", e2),
                  );
              }
            } else {
              setError("Live Voice Critical Error: " + msg);
            }
            setIsLiveConnecting(false);
            isSessionActiveRef.current = false;
            setIsSessionActive(false);
            stopLiveAudio();
          },
        },
      });
      sessionPromise.catch((err) => {
         console.warn("Live API promise rejected:", err);
         const msg = err?.message || String(err) || "";
         if (msg.includes("Network error") || msg.toLowerCase().includes("quota")) {
             setError("Live Voice Error: Gemini API quota exceeded or connection blocked. Providing a custom API key is required to continue.");
         } else {
             setError("Live Voice Connection Failed: " + msg);
         }
         setIsLiveConnecting(false);
         setIsSessionActive(false);
         isSessionActiveRef.current = false;
      });
      sessionPromiseRef.current = sessionPromise;
      setIsLive(true);
    } catch (e: any) {
      console.warn("Live Audio Error:", e);
      setIsLiveConnecting(false);
      let errorMsg = t.errorTech;

      let isQuotaErrorOccurred = false;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        errorMsg =
          (t.errorMicPermission ||
            "Microphone permission denied. Please enable it in your browser settings.") +
          " (Tip: If you are in a preview window, try opening the app in a new tab.)";
      } else if (
        e.name === "NotFoundError" ||
        e.name === "DevicesNotFoundError"
      ) {
        errorMsg =
          t.errorMicNotFound ||
          "No microphone found. Please connect a microphone and try again.";
      } else {
        const errStr =
          typeof e === "string" ? e : e.message || JSON.stringify(e);
        const isQuotaErr =
          errStr.toLowerCase().includes("429") ||
          errStr.toLowerCase().includes("503") ||
          errStr.toLowerCase().includes("service unavailable") ||
          errStr.toLowerCase().includes("quota") ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.toLowerCase().includes("limit") ||
          errStr.toLowerCase().includes("exceeded");
        if (isQuotaErr) {
          isQuotaErrorOccurred = true;
          errorMsg = t.errorTraffic;
          setError(
            "Live Voice Error: Gemini API quota exceeded. Providing a custom API key is required to continue.",
          );
          if (
            typeof window !== "undefined" &&
            (window as any).aistudio &&
            (window as any).aistudio.openSelectKey
          ) {
            (window as any).aistudio
              .openSelectKey()
              .then(() => {
                setError(
                  "API Key updated successfully! Please try connecting again.",
                );
                try {
                  initAI(getApiKey());
                } catch (e) {}
              })
              .catch((e2: any) =>
                console.error("API Key selection error:", e2),
              );
          }
        } else {
          errorMsg = `${t.errorTech} (${errStr})`;
        }
      }

      if (!isQuotaErrorOccurred && errorMsg !== t.errorTraffic) {
        setError(errorMsg);
      }
      setIsLive(false);
    }
  };

  const playLiveAudio = async (base64: string) => {
    if (!audioContextRef.current) return;
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        pcm16.length,
        24000,
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;

      // Always connect to destination so we can hear it
      source.connect(audioContextRef.current.destination);

      // Also connect to analyser for visualization
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      }

      // Schedule playback to avoid stuttering
      const currentTime = audioContextRef.current.currentTime;
      if (nextAudioTimeRef.current < currentTime) {
        nextAudioTimeRef.current = currentTime + 0.05; // Add a small buffer if we starved
      }

      source.start(nextAudioTimeRef.current);
      activeAudioSourcesRef.current.push(source);
      source.onended = () => {
        activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter(
          (s) => s !== source,
        );
      };
      nextAudioTimeRef.current += audioBuffer.duration;

      // Update speaking state
      isModelSpeakingRef.current = true;
      setIsModelSpeaking(true);

      if ((window as any).speakingTimeout) {
        clearTimeout((window as any).speakingTimeout);
      }

      const timeUntilEnd =
        (nextAudioTimeRef.current - audioContextRef.current.currentTime) * 1000;
      (window as any).speakingTimeout = setTimeout(
        () => {
          if (!isModelGeneratingRef.current) {
            isModelSpeakingRef.current = false;
            setIsModelSpeaking(false);
            setLiveGreetingFinished(true);
          }
        },
        Math.max(0, timeUntilEnd) + 2000,
      );
    } catch (e) {
      console.warn("Error playing live audio:", e);
    }
  };

  const stopLiveAudio = () => {
    isSessionActiveRef.current = false;
    setIsSessionActive(false);
    setIsLiveConnecting(false);
    setShowLiveWelcomeAnimation(false);
    setShowGreetingMessage(false);
    setShowPromoImage(false);
    setIsVideoPlaying(false);
    activeAudioSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeAudioSourcesRef.current = [];

    if ((window as any).speakingTimeout) {
      clearTimeout((window as any).speakingTimeout);
    }
    isModelSpeakingRef.current = false;
    setIsModelSpeaking(false);

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((s) => s.close());
      sessionPromiseRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (silentOscillatorRef.current) {
      try {
        silentOscillatorRef.current.stop();
      } catch (e) {}
      silentOscillatorRef.current.disconnect();
      silentOscillatorRef.current = null;
    }
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.pause();
      backgroundAudioRef.current.currentTime = 0;
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsLive(false);

    // Auto-return to landing page if entered from there
    if (returnToLandingOnExit) {
      setShowLandingPage(true);
      setReturnToLandingOnExit(false);
    }

    setHasLiveStarted(false);
    setIsMicMuted(false);
    isMicMutedRef.current = false;
  };

  useEffect(() => {
    const handleForceStop = () => stopLiveAudio();
    window.addEventListener("force-stop-live-audio", handleForceStop);
    return () =>
      window.removeEventListener("force-stop-live-audio", handleForceStop);
  }, []);

  const handleInterruption = () => {
    if (!isLive) return;

    if (!isSessionActiveRef.current) {
      toggleLiveAudio();
      return;
    }

    if (isModelSpeakingRef.current) {
      setIsVideoPlaying(false);
      nextAudioTimeRef.current = 0;
      activeAudioSourcesRef.current.forEach((source) => {
        try {
          source.stop();
        } catch (e) {}
      });
      activeAudioSourcesRef.current = [];
      if ((window as any).speakingTimeout) {
        clearTimeout((window as any).speakingTimeout);
      }
      isModelSpeakingRef.current = false;
      setIsModelSpeaking(false);
      setLiveGreetingFinished(true);
    } else {
      setIsVideoPlaying(false);
    }
  };

  // Visualizer Animation Effect
  useEffect(() => {
    if (!isLive) return;

    let animationId: number;

    // State for expanding ripples
    let ripples: {
      r: number;
      color: string;
      opacity: number;
      speed: number;
      direction: number;
    }[] = [];
    let colorIndex = 0;
    // 7 vibrant rainbow colors
    const colors = [
      "255, 0, 0", // Red
      "255, 128, 0", // Orange
      "255, 255, 0", // Yellow
      "0, 255, 0", // Green
      "0, 255, 255", // Cyan
      "0, 128, 255", // Blue
      "255, 0, 255", // Magenta/Purple
    ];
    let lastSpawnTime = 0;
    let smoothedOceanHeight = -1;
    let lastInteractionTime = Date.now();

    const updateVisualizer = () => {
      if (visualizerCanvasRef.current && analyserRef.current) {
        const canvas = visualizerCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Handle high-DPI displays
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();

          const displayWidth = Math.floor(rect.width * dpr);
          const displayHeight = Math.floor(rect.height * dpr);

          if (
            canvas.width !== displayWidth ||
            canvas.height !== displayHeight
          ) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            ctx.scale(dpr, dpr);
          }

          const width = rect.width;
          const height = rect.height;
          const centerX = width / 2;
          // Shift the animation upwards (by 20% of the height from center) to account for bottom controls
          const centerY = height * 0.3;

          ctx.clearRect(0, 0, width, height);

          const dataArray = new Uint8Array(
            analyserRef.current.frequencyBinCount,
          );
          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate frequency bands
          let low = 0,
            mid = 0,
            high = 0;
          for (let i = 0; i < 8; i++) low += dataArray[i];
          for (let i = 8; i < 24; i++) mid += dataArray[i];
          for (let i = 24; i < 64; i++) high += dataArray[i];
          low /= 8;
          mid /= 16;
          high /= 40;

          const nLow = low / 255;
          const nMid = mid / 255;
          const nHigh = high / 255;

          const react = (nLow + nMid + nHigh) / 3;
          const isSpeaking = isModelSpeakingRef.current;

          // Update the listening Apple-style indicator effect based on mic input
          if (!isSpeaking) {
            const glowEl = document.getElementById("listening-indicator-glow");
            const borderEl = document.getElementById(
              "listening-indicator-border",
            );
            if (glowEl && borderEl) {
              let opacity = 0;
              if (react > 0.05) {
                opacity = Math.min(0.5, (react - 0.05) * 5);
              }
              const scale = 1 + opacity * 0.02;
              glowEl.style.opacity = opacity.toString();
              borderEl.style.opacity = opacity.toString();
              glowEl.style.transform = `scale(${scale})`;
              borderEl.style.transform = `scale(${scale})`;
            }
          } else {
            const glowEl = document.getElementById("listening-indicator-glow");
            const borderEl = document.getElementById(
              "listening-indicator-border",
            );
            if (glowEl) glowEl.style.opacity = "0";
            if (borderEl) borderEl.style.opacity = "0";
          }

          // Adjust reactivity based on state
          // Consistent behavior whether speaking or listening
          const bounceMultiplier = 0.8;
          const currentReact = react * bounceMultiplier;

          // Base radius - restrict to a circle with diameter equal to screen width (or height if landscape)
          const maxRadius = Math.min(width, height) / 2;

          // Completely remove emaitri text rays, ripples, and center circle.
          // Drawing light waves shooting upwards near the 'listening' button

          const numBins = 32;
          let totalValue = 0;
          for (let i = 0; i < numBins; i++) {
            const dataIndex = Math.floor((i / numBins) * 64);
            totalValue += dataArray[dataIndex] || 0;
          }
          const averageIntensity = totalValue / numBins / 255;
          const activeScale = Math.min(
            1.5,
            averageIntensity * 1.5 + currentReact * 0.6,
          );

          // Position near the bottom control buttons, shooting upwards
          const baseY = height - 160;
          const waveWidth = Math.min(width * 0.85, 500);
          const startX = centerX - waveWidth / 2;
          const time = Date.now() / 150;

          // Base color - White when speaking, Blue-ish when listening
          const glowRgb = isSpeaking ? "255, 255, 255" : "96, 165, 250";

          ctx.globalCompositeOperation = "screen";

          const timeSec = Date.now() / 1000;

          if (isSpeaking) {
            lastInteractionTime = Date.now();
          } else if (react > 0.35) {
            lastInteractionTime = Date.now();
            if (!(window as any)._liveUserSpeakingActive) {
                (window as any)._liveUserSpeakingActive = true;
                window.dispatchEvent(new Event('live-user-activity'));
            }
            if ((window as any)._liveUserSpeakingTimeout) clearTimeout((window as any)._liveUserSpeakingTimeout);
            (window as any)._liveUserSpeakingTimeout = setTimeout(() => {
                (window as any)._liveUserSpeakingActive = false;
                window.dispatchEvent(new Event('live-user-idle'));
            }, 3000);
          }
          const isIdle = Date.now() - lastInteractionTime > 5000 && !isSpeaking;

          // Dynamically adjust ocean base height based on speaking state
          let targetOceanHeight = 0;
          if (isVideoPlayingRef.current) {
            if (isSpeaking) {
              targetOceanHeight = height * 0.15;
            } else {
              targetOceanHeight = -100;
            }
          } else if (isSpeaking) {
            targetOceanHeight = height * 0.25;
          } else if (!isIdle) {
            targetOceanHeight = height * 0.28;
          } else {
            targetOceanHeight = -100;
          }

          if (smoothedOceanHeight === -1)
            smoothedOceanHeight = targetOceanHeight;
          smoothedOceanHeight +=
            (targetOceanHeight - smoothedOceanHeight) * 0.04;

          const activeAmp = 5 + averageIntensity * height * 0.05;

          const waveColors = [
            "rgba(30, 58, 138, 0.4)", // Deep blue
            "rgba(37, 99, 235, 0.5)", // Royal blue
            "rgba(14, 165, 233, 0.5)", // Ocean cyan
            "rgba(56, 189, 248, 0.4)", // Light ocean cyan
          ];

          const waveCount = 4;
          for (let w = 0; w < waveCount; w++) {
            ctx.beginPath();
            // Start at absolute bottom-left corner
            ctx.moveTo(0, height);

            const waveSpeedOffset = timeSec * (0.8 + w * 0.3);

            for (let x = 0; x <= width; x += 10) {
              // Normalize x from 0 to 1 for smooth transitions
              const nx = x / width;

              const sine1 = Math.sin(nx * Math.PI * (2 + w) + waveSpeedOffset);
              const sine2 = Math.sin(
                nx * Math.PI * (3 + w * 1.5) - waveSpeedOffset * 0.8,
              );
              const organicSine = sine1 * 0.6 + sine2 * 0.4;

              // Smoothly scale the wave amplitude based on overall volume
              const yOffset = organicSine * (10 + activeAmp * (0.3 + w * 0.15));

              // Draw from bottom upwards
              const y =
                height - smoothedOceanHeight * (0.5 + w * 0.15) - yOffset;

              ctx.lineTo(x, y);
            }

            ctx.lineTo(width, height);
            ctx.closePath();

            ctx.fillStyle = waveColors[w];

            if (w === waveCount - 1) {
              ctx.shadowBlur = 10;
              ctx.shadowColor = "rgba(14, 165, 233, 0.4)"; // darker, less white shadow
            } else {
              ctx.shadowBlur = 0;
            }

            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }

      animationId = requestAnimationFrame(updateVisualizer);
    };

    animationId = requestAnimationFrame(updateVisualizer);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isLive, isModelSpeaking]);

  // Keep AudioContext alive when returning to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        isLive &&
        audioContextRef.current
      ) {
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current
            .resume()
            .catch((e) =>
              console.warn(
                "AudioContext resume failed on visibility change:",
                e,
              ),
            );
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isLive]);

  // Keep screen awake during live chat
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && isLive) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err: any) {
        // Silently ignore NotAllowedError as iframes might block this feature
        if (err.name !== "NotAllowedError") {
          console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (
        wakeLock !== null &&
        document.visibilityState === "visible" &&
        isLive
      ) {
        requestWakeLock();
      }
    };

    if (isLive) {
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLive]);

  const handleAppShare = async () => {
    try {
      let shareUrl = window.location.href;
      if (userName.trim()) {
        const url = new URL(shareUrl);
        url.searchParams.set("botName", userName.trim());
        shareUrl = url.toString();
      }

      if (navigator.share) {
        await navigator.share({
          title: "Your Identity",
          text: t.subtitle,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setError(t.copied);
      }
    } catch (err) {
      console.warn("Error sharing:", err);
    }
  };

  const lastModelMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === "model");
  const liveSubtitles =
    isLive && lastModelMessage && lastModelMessage.isLive
      ? parseMessage(lastModelMessage.text).mainText
      : "";

  // Dynamic subtitle configuration based on message length
  const subtitleConfig = useMemo(() => {
    const len = liveSubtitles.length;
    if (len < 50) {
      return {
        fontSize: "text-4xl sm:text-5xl md:text-6xl lg:text-7xl",
        justify: "justify-start items-center text-center",
        tracking: "tracking-tight block w-full",
      };
    } else if (len < 150) {
      return {
        fontSize: "text-3xl sm:text-4xl md:text-5xl lg:text-6xl",
        justify: "justify-start items-center text-center",
        tracking: "tracking-tight block w-full",
      };
    } else if (len < 350) {
      return {
        fontSize: "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
        justify: "justify-start items-center text-center",
        tracking: "tracking-normal block w-full",
      };
    } else if (len < 800) {
      return {
        fontSize: "text-xl sm:text-2xl md:text-3xl",
        justify: "justify-start items-center text-center",
        tracking: "tracking-normal block w-full",
      };
    } else {
      // Very long messages - shrink further but keep readable
      return {
        fontSize: "text-lg sm:text-xl md:text-2xl",
        justify: "justify-start items-start text-left", // Switch to bottom-anchored for stable growth once it exceeds screen
        tracking: "tracking-normal block w-full",
      };
    }
  }, [liveSubtitles]);

  useEffect(() => {
    // For long scrolling messages, ensure we stay at the bottom
    if (liveSubtitlesRef.current) {
      const el = liveSubtitlesRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [liveSubtitles]);

  const roles = [
    {
      id: "farmer",
      name: "किसान मित्र",
      color: "from-green-500 to-emerald-700",
      textColors: "text-green-50",
      bg: "bg-green-900/40",
      accent: "border-green-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]",
    },
    {
      id: "health",
      name: "स्वास्थ्य साथी",
      color: "from-blue-500 to-cyan-700",
      textColors: "text-blue-50",
      bg: "bg-blue-900/40",
      accent: "border-blue-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]",
    },
    {
      id: "education",
      name: "शिक्षा सहायक",
      color: "from-orange-500 to-amber-700",
      textColors: "text-orange-50",
      bg: "bg-orange-900/40",
      accent: "border-orange-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]",
    },
    {
      id: "business",
      name: "व्यापार प्रबंधक",
      color: "from-purple-500 to-indigo-700",
      textColors: "text-purple-50",
      bg: "bg-purple-900/40",
      accent: "border-purple-500/50",
      dropShadow: "drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]",
    },
  ];

  const displayNameWithRole = selectedRole
    ? `${displayBotName} (${selectedRole.name})`
    : displayBotName;
  // Restoring the colorful function for the listening indicator widget as requested by the user
  const activeGradient =
    "linear-gradient(90deg, #00aaff, #8400ff, #ff00aa, #ff5e00, #ff00aa, #8400ff, #00aaff)";

  return (
    <div
      className={`fixed inset-0 flex flex-col overflow-hidden ${theme === "light" ? "light-theme-override" : ""}`}
    >
      {/* HTML5 Video Background - Rendered unconditionally at the root so liveVideoRef is always available for play() unlock! */}
      <div className={`fixed inset-0 w-full h-full pointer-events-none transition-all duration-1000 ${isLive && isVideoPlaying ? 'opacity-100 scale-100 z-[999998]' : 'opacity-0 scale-105 -z-50'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.15),_transparent)] bg-slate-900" />
        <video
          ref={liveVideoRef}
          className="w-full h-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 object-cover opacity-60"
          src="https://vjs.zencdn.net/v/oceans.mp4"
          loop
          muted
          playsInline
          autoPlay
        ></video>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-slate-900" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <FirebaseSync
        theme={theme}
        uiLang={uiLang}
        userName={userName}
        premiumVoice={premiumVoice}
        speechRate={speechRate}
        freeTrialEnd={freeTrialEnd}
        subscriptionStatus={subscriptionStatus}
        savedChats={savedChats}
        setTheme={setTheme}
        setUiLang={setUiLang}
        setUserName={setUserName}
        setPremiumVoice={setPremiumVoice}
        setSpeechRate={setSpeechRate}
        setFreeTrialEnd={setFreeTrialEnd}
        setSubscriptionStatus={setSubscriptionStatus}
        setSavedChats={setSavedChats}
      />
      {(showLandingPage || showClientPanel) && !isLive && (
        <FreeTrialCountdown freeTrialEnd={freeTrialEnd} uiLang={uiLang} />
      )}

      <AnimatePresence>
        {hasTrialExpired &&
          subscriptionStatus === "inactive" &&
          !showFinalOfferPopup &&
          !showClientPanel &&
          !showAdminPanel &&
          isFinalOfferSeen && (
            <motion.div
              key="trial-expired-blocker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md rounded-[44px] overflow-hidden backdrop-blur-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-8 flex flex-col items-center text-center relative"
              >
                <div className="w-20 h-20 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-6">
                  <Bot size={40} />
                </div>

                <h2 className="text-2xl font-bold text-white mb-3">
                  {uiLang === "hi"
                    ? "आपका ट्रायल समाप्त हो गया है"
                    : "Your trial has expired"}
                </h2>

                <p className="text-zinc-400 text-base mb-8">
                  {uiLang === "hi"
                    ? "क्या आप चाहते हैं कि मैं आपकी मदद करना जारी रखूँ? मुझे वापस बुलाने के लिए कृपया अपना प्लान चुनें।"
                    : "Would you like me to continue helping you? Please select a plan to bring me back."}
                </p>

                <button
                  onClick={() => {
                    try {
                      const saved = safeStorage.getItem("nard_global_config");
                      let planPrice = 4999;
                      let upiId = "nard@masterupi";
                      let bi = "Nard Inc";
                      if (saved) {
                        const parsed = JSON.parse(saved);
                        if (trialPlan === "basic") planPrice = parsed.pricingBasic || 999;
                        if (trialPlan === "pro") planPrice = parsed.pricingPro || 2499;
                        if (trialPlan === "ultra") planPrice = parsed.pricingUltra || 4999;
                        upiId = parsed.paymentUpi || "nard@masterupi";
                        bi = parsed.businessName || "Nard Inc";
                      } else {
                        if (trialPlan === "basic") planPrice = 999;
                        if (trialPlan === "pro") planPrice = 2499;
                        if (trialPlan === "ultra") planPrice = 4999;
                      }
                      const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(bi)}&am=${planPrice}`;
                      setPaymentUrl(upiUrl);
                      setSubscriptionStatus("pending_payment");
                      // Try to launch UPI intent directly for mobile
                      const a = document.createElement("a");
                      a.href = upiUrl;
                      a.click();
                    } catch (e) {}
                  }}
                  className="w-full py-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all"
                >
                  {uiLang === "hi" ? "Pay Now" : "Pay Now"}
                </button>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {(subscriptionStatus === "verifying" || subscriptionStatus === "pending_payment" || showSuccessOverlay) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100000] bg-gray-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="bg-gray-900 border border-gray-800 p-8 rounded-[40px] max-w-sm w-full flex flex-col items-center justify-center text-center shadow-[0_0_50px_rgba(79,70,229,0.2)]">
              {subscriptionStatus === "pending_payment" ? (
                <>
                  <h3 className="text-2xl font-black text-white mb-4">
                    {uiLang === "hi" ? "भुगतान करें" : "Complete Payment"}
                  </h3>
                  <div className="bg-white p-4 rounded-2xl mb-6 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                    <QRCodeSVG
                      value={paymentUrl}
                      size={200}
                      bgColor={"#ffffff"}
                      fgColor={"#000000"}
                      level={"L"}
                      className="rounded-lg"
                    />
                  </div>
                  <p className="text-gray-400 font-medium mb-6">
                    {uiLang === "hi"
                      ? "भुगतान करने के लिए किसी भी UPI ऐप (जैसे PhonePe, GPay) से स्कैन करें"
                      : "Scan with any UPI app (like PhonePe, GPay) to pay"}
                  </p>
                  <button
                    onClick={() => {
                      setSubscriptionStatus("verifying");
                      if ("speechSynthesis" in window) {
                        window.speechSynthesis.cancel();
                        const msg = new SpeechSynthesisUtterance(
                          uiLang === "hi" ? "पुष्टि हो रही है..." : "Verifying..."
                        );
                        msg.lang = uiLang === "hi" ? "hi-IN" : "en-US";
                        window.speechSynthesis.speak(msg);
                      }
                    }}
                    className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all"
                  >
                    {uiLang === "hi" ? "मैंने भुगतान कर दिया है" : "I have paid"}
                  </button>
                  <button
                    onClick={() => {
                      setSubscriptionStatus("inactive");
                    }}
                    className="mt-4 w-full py-2 text-gray-500 font-bold hover:text-white"
                  >
                    {uiLang === "hi" ? "रद्द करें" : "Cancel"}
                  </button>
                </>
              ) : subscriptionStatus === "verifying" ? (
                <>
                  <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                    <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20"></div>
                    <div className="absolute inset-2 bg-indigo-500 rounded-full animate-pulse opacity-40"></div>
                    <Loader2
                      className="animate-spin text-indigo-400 relative z-10"
                      size={40}
                    />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">
                    {uiLang === "hi" ? "पूष्टि हो रही है..." : "Verifying..."}
                  </h3>
                  <p className="text-gray-400 font-medium">
                    {uiLang === "hi"
                      ? "मैं आपके पेमेंट की पुष्टि का इंतज़ार कर रहा हूँ..."
                      : "Waiting for confirmation of your payment..."}
                  </p>
                </>
              ) : (
                <>
                  <div className="w-24 h-24 bg-emerald-900/40 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-500/50">
                    <CheckCircle2 className="text-emerald-400" size={48} />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">
                    {uiLang === "hi" ? "सफलतापूर्ण!" : "Success!"}
                  </h3>
                  <p className="text-gray-400 font-medium">
                    {uiLang === "hi"
                      ? "आपका प्लान सफलतापूर्वक सक्रिय हो गया है।"
                      : "Your plan has been activated successfully."}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10010]"
          >
            <SecurityWrapper
              onUnauthorizedAccess={() => setShowAdminPanel(false)}
            >
              <MasterAdmin
                onOpenDashboard={() => {
                  setShowAdminPanel(false);
                  setShowClientPanel(true);
                }}
              />
            </SecurityWrapper>

            {/* Close Admin Button */}
            <button
              onClick={() => setShowAdminPanel(false)}
              className="absolute top-4 right-4 z-[10020] p-3 rounded-full bg-rose-900/50 text-rose-400 hover:bg-rose-900 transition-colors shadow-lg"
            >
              <X size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClientPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10010] bg-gray-950 overflow-y-auto hide-scrollbar"
          >
            <ClientDashboard
              uiLang={uiLang}
              subscriptionStatus={subscriptionStatus}
              setSubscriptionStatus={setSubscriptionStatus}
              isTrialActive={isTrialActive}
              trialPlan={trialPlan}
              onCancelAccess={() => {
                setSubscriptionStatus("inactive");
                setFreeTrialEnd(null);
                try {
                  safeStorage.removeItem("nard_free_trial_end_v1");
                } catch (e) {}
              }}
              onStartFreeTrial={(selectedPlan) => {
                handleSelectPlan(selectedPlan, true);
              }}
            />

            {/* Close Client Panel Button */}
            <button
              onClick={() => setShowClientPanel(false)}
              className="absolute top-4 right-4 z-[10020] p-3 rounded-full bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
            >
              <X size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLandingPage && (
          <motion.div
            id="landing-page-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[200] flex flex-col bg-gray-950 font-mukta overflow-y-auto hide-scrollbar"
            onScroll={(e) => {
              const targetSection = document.getElementById("features-section");
              if (targetSection) {
                const rect = targetSection.getBoundingClientRect();
                const windowHeight = window.innerHeight;
                // let bot icon be visible always as per user instruction.
                setShowBotIcon(true);
              }
            }}
          >
            <div className="fixed inset-0 pointer-events-none z-0">
              <motion.div
                animate={{
                  background: `radial-gradient(circle at 50% 0%, ${brandTheme.hex}15 0%, transparent 60%)`,
                }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="absolute inset-0"
              />
              <VirtualNetworkBackground />
            </div>

            {/* Sticky Interactive Branding Top Bar */}
            <div
              className={`sticky top-0 z-[250] shrink-0 flex flex-col xl:flex-row items-center justify-between px-4 pt-10 pb-6 sm:px-6 sm:pt-6 sm:pb-8 bg-gray-950/90 backdrop-blur-2xl border-b-[10px] sm:border-b-[14px] border-l-0 border-r-0 border-t-0 ${brandTheme.accent} gap-4 w-full rounded-b-[40px] sm:rounded-b-[56px] shadow-[0_10px_40px_-5px_rgba(0,0,0,0.8)] shadow-${brandTheme.color.split("-")[1]}-900/30 transition-all duration-500 relative overflow-hidden`}
            >
              {/* Dynamic Background Glow */}
              <div
                className={`absolute inset-0 opacity-[0.15] bg-gradient-to-r ${brandTheme.color} pointer-events-none transition-all duration-500`}
              />

              <div className="relative z-10 w-full flex flex-wrap sm:flex-nowrap gap-4 items-center justify-between pb-2 xl:pb-0">
                {/* Left: Hamburger Menu and Title */}
                <div className="flex items-center gap-3 order-1 flex-none">
                  <div ref={leftMenuRef} className="relative">
                    <button
                      onClick={() => setShowLeftMenu(!showLeftMenu)}
                      className="p-2 sm:p-2.5 rounded-full bg-gray-900/80 border border-gray-800 hover:bg-gray-800 transition-colors shadow-md text-gray-300 hover:text-white shrink-0"
                    >
                      <Menu size={20} />
                    </button>
                    <AnimatePresence>
                      {showLeftMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          className="absolute top-full left-0 mt-3 min-w-[200px] sm:min-w-[220px] bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden z-[9999]"
                        >
                          <button
                            onClick={() => {
                              setShowClientPanel(true);
                              setShowLeftMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-800/80 text-gray-200 transition-colors"
                          >
                            <ShieldAlert size={18} className="text-rose-400" />
                            <span className="font-medium text-sm">
                              {uiLang === "hi" ? "डैशबोर्ड" : "Dashboard"}
                            </span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-lg sm:text-xl font-bold text-white leading-none tracking-tight">
                      Nard
                    </h1>
                    <span className="text-[10px] sm:text-xs text-gray-400 font-medium tracking-wide mt-0.5 uppercase">
                      Your Identity
                    </span>
                  </div>
                </div>

                {/* Center: Industry Buttons */}
                <div className="flex flex-row items-center justify-center gap-1 sm:gap-2 bg-gray-900/80 p-1 sm:p-1.5 rounded-[32px] sm:rounded-[40px] border border-gray-800 w-full sm:w-auto shrink-0 px-2 sm:px-4 shadow-inner relative z-10 order-3 sm:order-2">
                  {industries.map((t) => (
                    <button
                      key={t.id}
                      className={`flex flex-col items-center justify-center gap-0.5 group px-1 sm:px-1.5 py-1 rounded-full transition-all duration-300 shrink-0 min-w-[40px] sm:min-w-[46px] ${brandTheme.id === t.id ? "bg-gray-800 border-gray-700 scale-105" : "hover:bg-gray-800/50"}`}
                      onClick={() => setBrandTheme(t)}
                      title={t.name}
                    >
                      <div
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 transition-all duration-200 ${brandTheme.id === t.id ? "border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "border-transparent group-hover:scale-110"}`}
                        style={{ backgroundColor: t.hex }}
                      />
                      <span
                        className={`text-[9px] sm:text-[10px] font-semibold transition-colors ${brandTheme.id === t.id ? "text-white" : "text-gray-500"}`}
                      >
                        {t.name}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Right: Smart Settings */}
                <div className="flex items-center justify-end shrink-0 gap-2 flex-none order-2 sm:order-3">
                  <button
                    id="tour-settings"
                    onClick={() => setShowSettings(true)}
                    className="flex items-center justify-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 text-white font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all shrink-0 border border-indigo-400/30 group"
                  >
                    <Settings2
                      size={16}
                      className="group-hover:rotate-90 transition-transform duration-300"
                    />
                    <span className="text-xs sm:text-sm font-semibold">
                      {uiLang === "hi" ? "स्मार्ट सेटिंग्स" : "Smart Settings"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-col items-center pt-8 md:pt-16 pb-24 px-6 w-full max-w-6xl mx-auto">
              {/* Moved Identity Section (Hidden as per user instructions) */}

              {/* Free Trial Full Activation Widget */}
              {freeTrialEnd === null && subscriptionStatus !== "active" && (
                <div className="w-full max-w-2xl mx-auto rounded-[44px] overflow-hidden backdrop-blur-2xl bg-black/60 border border-amber-500/30 shadow-[0_30px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8 flex flex-col items-center text-center relative mt-6 mb-12">
                  <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/20 to-amber-500/10 mix-blend-overlay pointer-events-none" />

                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-4 sm:mb-6 shadow-[0_0_30px_rgba(251,191,36,0.6)]">
                    <Sparkles
                      size={32}
                      className="text-white fill-white sm:w-10 sm:h-10"
                    />
                  </div>

                  <h2 className="relative text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3 leading-tight drop-shadow-lg">
                    {uiLang === "hi"
                      ? "नार्ड की शक्ति को 2 मिनट तक बिल्कुल मुफ्त अनुभव करें!"
                      : "Experience the power of Nard free for 2 minutes!"}
                  </h2>

                  <p className="relative text-amber-100/90 text-sm sm:text-base font-medium mb-6 sm:mb-8 tracking-wide">
                    {uiLang === "hi"
                      ? "पहिले आजमाईं, फिर विश्वास करीं!"
                      : "Try it first, believe it later!"}
                  </p>

                  <button
                    onClick={() => {
                      setShowPathModal(true);
                    }}
                    className="relative w-full max-w-md py-4 sm:py-5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-white shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.7)] transition-all overflow-hidden group hover:-translate-y-1"
                  >
                    <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                    <span className="relative flex items-center justify-center gap-2 text-lg sm:text-xl">
                      <Zap size={24} className="fill-white" />
                      {uiLang === "hi"
                        ? "फ्री ट्रायल शुरू करें"
                        : "Start Free Trial"}
                    </span>
                  </button>
                </div>
              )}

              {/* Hero Section */}
              <div className="flex flex-col items-center mb-24 text-center max-w-4xl">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className={`relative w-[100px] h-[100px] md:w-[120px] md:h-[120px] flex items-center justify-center rounded-[32px] bg-gray-900 mb-8 shadow-2xl border ${brandTheme.accent} backdrop-blur-md overflow-hidden`}
                >
                  <div
                    className={`absolute inset-0 rounded-[32px] shadow-[inset_0_0_30px_rgba(255,255,255,0.1)] pointer-events-none`}
                  />
                  {digitalIdentity.logoUrl || brandLogo ? (
                    <img
                      src={digitalIdentity.logoUrl || brandLogo!}
                      alt="Brand Logo"
                      className="w-full h-full object-cover relative z-10"
                    />
                  ) : (
                    <>
                      <Flame
                        size={56}
                        className="relative z-10"
                        style={{
                          color: brandTheme.hex,
                          filter: `drop-shadow(0 0 15px ${brandTheme.hex})`,
                        }}
                      />
                      <div className="absolute top-3 right-3 z-20">
                        <Sparkles
                          size={24}
                          className="text-white animate-pulse drop-shadow-sm"
                        />
                      </div>
                    </>
                  )}
                </motion.div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white mb-6 leading-tight drop-shadow-lg font-mukta">
                  {lT.heroTitle1} <br />
                  <span
                    className={`text-transparent bg-clip-text bg-gradient-to-r ${brandTheme.color}`}
                  >
                    {lT.heroTitle2}
                  </span>
                </h1>
                <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mb-12 leading-relaxed font-mukta">
                  {lT.heroSubtitle}
                </p>

                <button
                  onClick={() => {
                    setShowPathModal(true);
                  }}
                  className={`group relative px-10 py-5 rounded-[88px] bg-gradient-to-r ${brandTheme.color} text-white font-bold text-xl md:text-2xl shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden font-mukta`}
                >
                  <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                  <span className="relative z-10 flex items-center gap-3">
                    <Rocket size={28} />
                    {lT.heroBtn}
                  </span>
                </button>
              </div>

              {/* Client Dashboard Injection - Moved to Overlay */}

              {/* The 'Maitri-Trust' Section */}
              <div
                id="features-section"
                className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-28"
              >
                <div
                  className={`flex flex-col p-8 rounded-[88px] border border-gray-800 bg-gray-900/40 backdrop-blur-3xl hover:bg-gray-800/60 transition-all duration-300 shadow-2xl items-center text-center group`}
                >
                  <div
                    className={`w-20 h-20 rounded-[32px] flex items-center justify-center mb-6 bg-gradient-to-br ${brandTheme.color} shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500`}
                  >
                    <MessageCircle className="text-white" size={36} />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 tracking-wide font-mukta">
                    {lT.feat1Title}
                  </h3>
                  <p className="text-gray-400 text-lg font-medium leading-relaxed font-mukta">
                    {lT.feat1Desc}
                  </p>
                </div>
                <div
                  className={`flex flex-col p-8 rounded-[88px] border border-gray-800 bg-gray-900/40 backdrop-blur-3xl hover:bg-gray-800/60 transition-all duration-300 shadow-2xl items-center text-center group`}
                >
                  <div
                    className={`w-20 h-20 rounded-[32px] flex items-center justify-center mb-6 bg-gradient-to-br ${brandTheme.color} shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500`}
                  >
                    <Briefcase className="text-white" size={36} />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 tracking-wide font-mukta">
                    {lT.feat2Title}
                  </h3>
                  <p className="text-gray-400 text-lg font-medium leading-relaxed font-mukta">
                    {lT.feat2Desc}
                  </p>
                </div>
                <div
                  className={`flex flex-col p-8 rounded-[88px] border border-gray-800 bg-gray-900/40 backdrop-blur-3xl hover:bg-gray-800/60 transition-all duration-300 shadow-2xl items-center text-center group`}
                >
                  <div
                    className={`w-20 h-20 rounded-[32px] flex items-center justify-center mb-6 bg-gradient-to-br ${brandTheme.color} shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500`}
                  >
                    <CreditCard className="text-white" size={36} />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 tracking-wide font-mukta">
                    {lT.feat3Title}
                  </h3>
                  <p className="text-gray-400 text-lg font-medium leading-relaxed font-mukta">
                    {lT.feat3Desc}
                  </p>
                </div>
              </div>

              {/* The 'Plan & Feature Discovery' Section inline */}
              <div
                id="pricing-section"
                className="w-full text-center mt-12 mb-32"
              >
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-12 font-mukta text-center">
                  {uiLang === "hi"
                    ? "अपना कस्टम नार्ड पाएं"
                    : "Get Your Custom Nard"}
                </h2>

                <div className="w-full max-w-5xl mx-auto flex flex-col pt-4">
                  {!selectedPath ? (
                    <>
                      <div className="text-center mb-12">
                        <p className="text-xl text-gray-300 font-medium max-w-2xl mx-auto">
                          {uiLang === "hi"
                            ? "क्लिक करें कि आप नार्ड को कैसे डिप्लॉय करना चाहते हैं। अपनी साइट पर एक फ्लोटिंग चैटबॉट या हमारे प्लेटफार्म पर।"
                            : "Select how you want to deploy Nard. Embed it natively in your existing platform, or use it as a standalone powerful link."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
                        {/* Path 1: Widget */}
                        <div
                          onClick={() => setSelectedPath("widget")}
                          className={`relative flex flex-col bg-gray-900/60 border border-gray-700/50 rounded-[88px] rounded-b-[40px] p-8 md:p-10 cursor-pointer overflow-hidden group hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)] transition-all duration-300 transform md:hover:-translate-y-2 text-center h-[26rem] justify-center items-center`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          <div className="w-24 h-24 rounded-full bg-blue-900/40 border border-blue-500/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600/30 transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                            <Globe
                              size={48}
                              className="text-blue-400 group-hover:text-white transition-colors"
                            />
                          </div>

                          <h3 className="text-3xl font-black text-white mb-3 tracking-wide">
                            {uiLang === "hi"
                              ? "फ्लोटिंग आइकॉन इंटीग्रेशन"
                              : "Floating Icon Integration"}
                          </h3>
                          <p className="text-gray-400 font-medium text-lg px-2">
                            {uiLang === "hi"
                              ? "अपनी मौजूदा वेबसाइट या ऐप के लिए एक एम्बेडेड फ्लोटिंग चैटबॉट।"
                              : "Integrate Nard seamlessly into your existing site with our simple JavaScript widget."}
                          </p>

                          <div className="mt-8 flex items-center gap-2 text-blue-400 font-bold group-hover:gap-4 transition-all">
                            {uiLang === "hi" ? "विकल्प चुनें" : "Select Option"}{" "}
                            <ArrowLeft size={20} className="rotate-180" />
                          </div>
                        </div>

                        {/* Path 2: Platform */}
                        <div
                          onClick={() => setSelectedPath("platform")}
                          className={`relative flex flex-col bg-gray-900/60 border border-gray-700/50 rounded-[88px] rounded-b-[40px] p-8 md:p-10 cursor-pointer overflow-hidden group hover:border-pink-500/50 hover:shadow-[0_0_40px_rgba(236,72,153,0.3)] transition-all duration-300 transform md:hover:-translate-y-2 text-center h-[26rem] justify-center items-center`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-pink-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          <div className="w-24 h-24 rounded-full bg-pink-900/40 border border-pink-500/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-pink-600/30 transition-all shadow-[0_0_20px_rgba(236,72,153,0.2)]">
                            <Sparkles
                              size={48}
                              className="text-pink-400 group-hover:text-white transition-colors"
                            />
                          </div>

                          <h3 className="text-3xl font-black text-white mb-3 tracking-wide">
                            {uiLang === "hi"
                              ? "नार्ड होस्टेड प्लेटफॉर्म"
                              : "Powered by Nard"}
                          </h3>
                          <p className="text-gray-400 font-medium text-lg px-2">
                            {uiLang === "hi"
                              ? "यदि आपकी अपनी साइट नहीं है, तो हमारे रेडी-टू-यूज़ कस्टम यूआरएल प्लेटफॉर्म का उपयोग करें।"
                              : "No website? No problem. Get a dedicated Nard platform link built specifically for your brand."}
                          </p>

                          <div className="mt-8 flex items-center gap-2 text-pink-400 font-bold group-hover:gap-4 transition-all">
                            {uiLang === "hi" ? "विकल्प चुनें" : "Select Option"}{" "}
                            <ArrowLeft size={20} className="rotate-180" />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col w-full text-center">
                      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 w-full">
                        <button
                          onClick={() => setSelectedPath(null)}
                          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-lg font-bold"
                        >
                          <ArrowLeft size={22} />{" "}
                          {uiLang === "hi" ? "वापस जाएं" : "Back to Options"}
                        </button>

                        <h2 className="text-3xl font-black text-white mt-4 sm:mt-0 drop-shadow-sm">
                          {selectedPath === "widget"
                            ? uiLang === "hi"
                              ? "विजेट इंटीग्रेशन"
                              : "Widget Integration Details"
                            : uiLang === "hi"
                              ? "होस्टेड प्लेटफॉर्म"
                              : "Hosted Platform Details"}
                        </h2>

                        <div className="hidden sm:block w-32"></div>
                      </div>

                      {selectedPath === "widget" && (
                        <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 mb-12 shadow-inner text-left overflow-x-auto relative group">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sky-400 font-mono text-sm font-bold uppercase tracking-wider">
                              Embed Code
                            </span>
                            <div className="bg-sky-500/20 text-sky-300 text-xs px-3 py-1 rounded-full border border-sky-500/30">
                              Paste into &lt;body&gt;
                            </div>
                          </div>
                          <pre className="text-gray-300 font-mono text-sm p-4 bg-black/50 rounded-xl overflow-x-auto border border-gray-800">
                            <code>{`<script src="https://nard.ai/widget.js" data-id="YOUR_ID"></script>`}</code>
                          </pre>

                          <div className="mt-4 text-gray-400 text-sm flex gap-3">
                            <Info
                              size={16}
                              className="text-sky-400 shrink-0 mt-0.5"
                            />
                            <p>
                              Simply paste this snippet right before the closing
                              &lt;/body&gt; tag of your website. It'll
                              automatically load a beautiful floating Nard icon
                              customized to your brand color.
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedPath === "platform" && (
                        <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 mb-12 shadow-inner group flex flex-col md:flex-row items-center justify-between text-left gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-pink-400 font-mono text-sm font-bold uppercase tracking-wider">
                                Custom Profile Link
                              </span>
                              <div className="bg-pink-500/20 text-pink-300 text-xs px-3 py-1 rounded-full border border-pink-500/30">
                                Instantly Live
                              </div>
                            </div>
                            <h4 className="text-white text-xl font-bold mb-2">
                              Build your brand identity directly on Nard.
                            </h4>
                            <p className="text-gray-400 text-sm leading-relaxed">
                              Skip the server setup. We host your agent securely
                              and provide deep analytics, customizable hero
                              domains (like nard.ai/YourBrand), and one-click
                              sharing across platforms.
                            </p>
                          </div>

                          <div className="bg-black/60 p-4 rounded-xl border border-gray-800 w-full md:w-auto shadow-sm">
                            <p className="text-gray-300 font-mono font-medium text-lg whitespace-nowrap overflow-hidden text-ellipsis flex items-center">
                              https://
                              <span className="text-pink-400 mx-1">
                                nard.ai
                              </span>
                              /
                              <span className="text-yellow-400">
                                your-brand
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPath && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 mt-12 pt-12 border-t border-gray-800/30 w-full max-w-7xl mx-auto">
                        {/* Basic Plan */}
                        <div className="flex flex-col bg-gray-900/40 border border-gray-700/50 rounded-[40px] p-6 hover:bg-gray-800/60 transition-all text-left">
                          <h4 className="text-2xl font-black text-white mb-2">
                            {uiLang === "hi" ? "लोक मित्र (Basic)" : "Basic"}
                          </h4>
                          <div className="text-4xl font-black text-gray-300 mb-6 drop-shadow-sm">
                            $29
                            <span className="text-lg text-gray-500 font-bold">
                              /mo
                            </span>
                          </div>

                          <ul className="space-y-3 mb-8 flex-1">
                            {[
                              uiLang === "hi"
                                ? "मानक AI वॉयस"
                                : "Standard Voice Models",
                              uiLang === "hi"
                                ? "5,000 रिस्पॉन्स / माह"
                                : "5,000 requests / mo",
                              uiLang === "hi"
                                ? "बेसिक एनालिटिक्स"
                                : "Basic Analytics Dashboard",
                              uiLang === "hi"
                                ? "चैट और वॉयस सपोर्ट"
                                : "Chat & Voice Support",
                            ].map((feature, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-3 text-gray-300 font-medium"
                              >
                                <Check
                                  size={18}
                                  className="text-green-400 shrink-0"
                                />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          <button className="w-full py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg transition-colors border border-gray-600 shadow-sm">
                            {uiLang === "hi" ? "बेसिक चुनें" : "Start Basic"}
                          </button>
                        </div>

                        {/* Pro Plan */}
                        <div className="relative flex flex-col bg-gradient-to-b from-[#1e293b] to-[#0f172a] border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] rounded-[40px] p-6 transform md:-translate-y-4 text-left">
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-yellow-600 to-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg whitespace-nowrap">
                            Most Popular
                          </div>

                          <h4 className="text-2xl font-black text-white mb-2 mt-2">
                            {uiLang === "hi" ? "बिजनेस मैनेजर (Pro)" : "Pro"}
                          </h4>
                          <div className="text-4xl font-black text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                            $79
                            <span className="text-lg text-gray-400 font-bold">
                              /mo
                            </span>
                          </div>

                          <div className="mb-6 flex gap-2 flex-wrap">
                            <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]">
                              Automatic Lead Generation
                            </span>
                            <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 text-green-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">
                              WhatsApp Alerts
                            </span>
                          </div>

                          <ul className="space-y-3 mb-8 flex-1">
                            {[
                              uiLang === "hi"
                                ? "प्रीमियम AI वॉयस"
                                : "Premium Voice Models",
                              uiLang === "hi"
                                ? "अनलिमिटेड रिस्पॉन्स"
                                : "Unlimited requests",
                              uiLang === "hi"
                                ? "एडवांस्ड एनालिटिक्स"
                                : "Advanced Analytics & Insights",
                              uiLang === "hi" ? "लीड कैप्चर" : "Lead Capture",
                            ].map((feature, i) => (
                              <li
                                key={i}
                                className="flex flex-start gap-3 text-gray-200 font-medium"
                              >
                                <Check
                                  size={18}
                                  className="text-yellow-400 shrink-0 mt-0.5"
                                />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-600 to-amber-500 shadow-lg shadow-yellow-500/20 hover:scale-[1.02] active:scale-95 text-white font-bold text-lg transition-all drop-shadow-md">
                            {uiLang === "hi"
                              ? "प्रो सब्सक्राइब करें"
                              : "Subscribe Pro"}
                          </button>
                        </div>

                        {/* Ultra Plan */}
                        <div className="flex flex-col bg-gray-900/40 border border-gray-700/50 rounded-[40px] p-6 hover:bg-gray-800/60 transition-all text-left">
                          <h4 className="text-2xl font-black text-white mb-2">
                            {uiLang === "hi"
                              ? "कॉमर्स एक्सपर्ट (Ultra)"
                              : "Ultra"}
                          </h4>
                          <div className="text-4xl font-black text-sky-300 mb-6 drop-shadow-sm">
                            $199
                            <span className="text-lg text-gray-500 font-bold">
                              /mo
                            </span>
                          </div>

                          <div className="mb-6 flex gap-2 flex-wrap">
                            <span className="px-3 py-1 bg-sky-500/20 border border-sky-500/50 text-sky-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(56,189,248,0.8)]">
                              Direct Bank Payment
                            </span>
                            <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/50 text-purple-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">
                              Custom Avatars
                            </span>
                          </div>

                          <ul className="space-y-3 mb-8 flex-1">
                            {[
                              uiLang === "hi"
                                ? "प्रो के सभी फीचर्स"
                                : "Everything in Pro",
                              uiLang === "hi"
                                ? "ऑर्डर प्रोसेसिंग"
                                : "Order Processing",
                              uiLang === "hi"
                                ? "पेमेंट वेरिफिकेशन (UPI)"
                                : "Payment Verification (UPI)",
                              uiLang === "hi"
                                ? "डेडिकेटेड सपोर्ट"
                                : "Dedicated Support",
                            ].map((feature, i) => (
                              <li
                                key={i}
                                className="flex flex-start gap-3 text-gray-300 font-medium"
                              >
                                <Check
                                  size={18}
                                  className="text-sky-400 shrink-0 mt-0.5"
                                />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          <button className="w-full py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-sky-400 font-bold text-lg transition-colors border border-gray-600 shadow-sm hover:text-white">
                            {uiLang === "hi" ? "अल्ट्रा पर जाएं" : "Go Ultra"}
                          </button>
                        </div>
                      </div>

                      {/* Comparison Table */}
                      <div className="w-full bg-gray-900 border border-gray-700/50 rounded-[40px] p-6 md:p-10 shadow-inner overflow-hidden">
                        <h3 className="text-2xl font-black text-white mb-8 text-left">
                          {uiLang === "hi"
                            ? "प्लान तुलना"
                            : "Feature Comparison"}
                        </h3>
                        <div className="overflow-x-auto w-full">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-gray-700">
                                <th className="p-4 text-gray-400 font-medium">
                                  {uiLang === "hi" ? "फीचर" : "Feature"}
                                </th>
                                <th className="p-4 text-white font-bold text-center">
                                  {uiLang === "hi" ? "बेसिक" : "Basic"}
                                </th>
                                <th className="p-4 text-yellow-400 font-bold text-center">
                                  {uiLang === "hi" ? "प्रो" : "Pro"}
                                </th>
                                <th className="p-4 text-sky-400 font-bold text-center">
                                  {uiLang === "hi" ? "अल्ट्रा" : "Ultra"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-300">
                              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "लाइव वॉयस चैट"
                                    : "Live Voice Chat"}
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-green-400 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-yellow-400 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "कस्टम इंस्ट्रक्शन्स"
                                    : "Custom Instructions"}
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-yellow-400 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "ऑटोमैटिक लीड जनरेशन"
                                    : "Automatic Lead Gen"}
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-yellow-400 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "व्हाट्सएप अलर्ट्स"
                                    : "WhatsApp Alerts"}
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-yellow-400 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "डायरेक्ट बैंक पेमेंट"
                                    : "Direct Bank Payment"}
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                              <tr className="hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 font-medium">
                                  {uiLang === "hi"
                                    ? "ऑर्डर मैनेजमेंट व रसीद"
                                    : "Order Mgt & Receipts"}
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <X
                                    size={20}
                                    className="text-gray-600 mx-auto"
                                  />
                                </td>
                                <td className="p-4 text-center">
                                  <Check
                                    size={20}
                                    className="text-sky-400 mx-auto"
                                  />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Dynamic Industry Cards */}
              <div className="w-full text-center mb-32">
                <p className="text-xl md:text-2xl text-gray-300 font-semibold mb-3 tracking-wide drop-shadow-md font-mukta">
                  {lT.previewSubtitle}
                </p>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-16 font-mukta">
                  {lT.previewTitle1}{" "}
                  <span
                    className={`text-transparent bg-clip-text bg-gradient-to-r ${brandTheme.color}`}
                  >
                    {lT.previewTitle2}
                  </span>
                </h2>

                {/* Your Identity Demo Test Widget */}
                <div className="w-full max-w-2xl mx-auto mb-16">
                  <div className={`bg-gray-900/40 backdrop-blur-md border ${brandTheme.accent} rounded-3xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300 hover:shadow-[0_0_40px_rgba(59,130,246,0.15)]`}>
                    <div className={`absolute top-0 right-0 bg-gradient-to-r ${brandTheme.color} text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl shadow-md uppercase tracking-wider`}>
                      Demo Test
                    </div>
                    <div className="flex flex-col items-center space-y-6">
                      <div className="flex flex-col items-center">
                        <div className={`p-4 bg-gradient-to-br ${brandTheme.color} rounded-full mb-3 shadow-lg`}>
                          <User size={32} className="text-white" />
                        </div>
                        <h3 className="text-3xl font-black text-white tracking-wide font-mukta shadow-sm">Your Identity</h3>
                        <p className="text-gray-300 font-medium text-base mt-2 max-w-sm mx-auto opacity-80 leading-snug">
                          {uiLang === "hi" ? "अपना कस्टम बॉट डेमो देखने के लिए एक नाम दर्ज करें" : "Enter a name to view your custom bot demo"}
                        </p>
                      </div>
                      
                      <div className="w-full max-w-md relative">
                        <input
                          type="text"
                          value={demoBotName}
                          onChange={(e) => setDemoBotName(e.target.value)}
                          placeholder={uiLang === "hi" ? "अपना बाट नाम लिखें" : "Enter your bot name"}
                          className={`w-full bg-black/60 text-white border-2 border-gray-600 focus:border-transparent rounded-2xl px-6 py-4 outline-none transition-all placeholder-gray-500 text-center text-xl font-bold shadow-inner focus:ring-2 focus:ring-sky-400`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-4xl mx-auto">
                  {industries.map((role, i) => (
                    <motion.div
                      key={role.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                      className={`relative flex flex-col p-8 rounded-[60px] border ${brandTheme.accent} ${brandTheme.bg} backdrop-blur-2xl shadow-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 text-left`}
                    >
                      <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                        <div>
                          {demoBotName && (
                            <div className={`text-xl font-bold ${brandTheme.textColors} opacity-90 mb-1`}>
                              {demoBotName}
                            </div>
                          )}
                          <h3
                            className={`text-3xl md:text-4xl font-black tracking-wide ${brandTheme.textColors} ${brandTheme.dropShadow} mb-2`}
                          >
                            {role.name}
                          </h3>
                          <p className="text-gray-300 text-lg md:text-xl font-medium">
                            {role.tagline}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const initialMsg = getInitialMessage(
                              uiLang,
                              demoBotName || role.name,
                              role,
                            );
                            setMessages([
                              {
                                id: Date.now().toString(),
                                role: "model",
                                text: initialMsg,
                              },
                            ]);
                            setCurrentChatId(null);
                            setSelectedRole({
                              ...role,
                              color: brandTheme.color,
                              bg: brandTheme.bg,
                              accent: brandTheme.accent,
                              textColors: brandTheme.textColors,
                              dropShadow: brandTheme.dropShadow,
                            });
                            setReturnToLandingOnExit(true);
                            setShowLandingPage(false);
                            setShowPathModal(false);
                            setIsLive(true);
                            if (!isSessionActiveRef.current) {
                              toggleLiveAudio(undefined, {
                                ...role,
                                color: brandTheme.color,
                                bg: brandTheme.bg,
                              });
                            }
                          }}
                          className={`self-start flex items-center gap-2 px-6 py-3 rounded-[40px] bg-gradient-to-r ${role.color} text-white font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-lg font-mukta`}
                        >
                          <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                          {lT.industries?.livePreview || "Live Preview"}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                  {/* Free Trial Full Activation Widget */}
                  {freeTrialEnd === null && subscriptionStatus !== "active" && (
                    <div className="w-full max-w-2xl mx-auto rounded-[44px] overflow-hidden backdrop-blur-2xl bg-black/60 border border-amber-500/30 shadow-[0_30px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8 flex flex-col items-center text-center relative mt-16 mb-6">
                      <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/20 to-amber-500/10 mix-blend-overlay pointer-events-none" />

                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-4 sm:mb-6 shadow-[0_0_30px_rgba(251,191,36,0.6)]">
                        <Sparkles
                          size={32}
                          className="text-white fill-white sm:w-10 sm:h-10"
                        />
                      </div>

                      <h2 className="relative text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3 leading-tight drop-shadow-lg">
                        {uiLang === "hi"
                          ? "नार्ड की शक्ति को 2 मिनट तक बिल्कुल मुफ्त अनुभव करें!"
                          : "Experience the power of Nard free for 2 minutes!"}
                      </h2>

                      <p className="relative text-amber-100/90 text-sm sm:text-base font-medium mb-6 sm:mb-8 tracking-wide">
                        {uiLang === "hi"
                          ? "पहिले आजमाईं, फिर विश्वास करीं!"
                          : "Try it first, believe it later!"}
                      </p>

                      <button
                        onClick={() => {
                          setShowPathModal(true);
                        }}
                        className="relative w-full max-w-md py-4 sm:py-5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-white shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.7)] transition-all overflow-hidden group hover:-translate-y-1"
                      >
                        <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                        <span className="relative flex items-center justify-center gap-2 text-lg sm:text-xl">
                          <Zap size={24} className="fill-white" />
                          {uiLang === "hi"
                            ? "फ्री ट्रायल शुरू करें"
                            : "Start Free Trial"}
                        </span>
                      </button>
                    </div>
                  )}

                  <div className="text-center text-gray-500 text-sm font-medium mt-4 mb-20">
                    Powered by Nard.
                  </div>
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Popup */}
      <AnimatePresence>
        {activeProductPopup && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="fixed bottom-24 sm:bottom-32 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-sm bg-gray-900 border border-gray-800 rounded-br-2xl rounded-tr-2xl rounded-bl-2xl rounded-tl-[88px] overflow-hidden shadow-[0_20px_60px_-10px_rgba(14,165,233,0.3)]"
          >
            <button
              onClick={() => setActiveProductPopup(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="h-48 w-full bg-gray-800 relative">
              {activeProductPopup.imageUrl ? (
                <img
                  src={activeProductPopup.imageUrl}
                  alt={activeProductPopup.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <ImageIcon size={40} className="mb-2 opacity-50" />
                  <span className="text-sm font-mukta">No Image</span>
                </div>
              )}
              {/* Price Tag */}
              <div className="absolute bottom-0 left-0 bg-gray-900/90 backdrop-blur-md px-6 py-2 rounded-tr-3xl text-sky-400 font-black text-2xl border-t border-r border-gray-700/50">
                ₹{activeProductPopup.price}
              </div>
            </div>
            <div className="p-5 flex flex-col items-center">
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                {activeProductPopup.name}
              </h3>
              <button className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-6 rounded-xl flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(14,165,233,0.4)] transition-all active:scale-95">
                <Check size={20} />
                {uiLang === "hi" ? "अभी खरीदें" : "Buy Now"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBotIcon &&
          !isLive &&
          (showLandingPage ||
            showSettings ||
            showAdminPanel ||
            showClientPanel ||
            showPathModal ||
            showFinalOfferPopup ||
            isSaveModalOpen ||
            isHistoryOpen) && (
            <motion.button
              initial={getSnapCoords(floatPos)}
              drag
              dragMomentum={false}
              animate={floatControls}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onDragStart={() => setIsFloatDragging(true)}
              onDragEnd={(e, info) => {
                setTimeout(() => setIsFloatDragging(false), 50);
                const px = info.point.x;
                const py = info.point.y;

                const vw = windowSize.width;
                const vh = windowSize.height;

                const isLeft = px < vw / 2;
                const isTop = py < vh / 3;
                const isBottom = py > (vh * 2) / 3;

                let newPos: "tl" | "tr" | "ml" | "mr" | "bl" | "br" = "br";
                if (isTop) newPos = isLeft ? "tl" : "tr";
                else if (isBottom) newPos = isLeft ? "bl" : "br";
                else newPos = isLeft ? "ml" : "mr";

                if (newPos === floatPos) {
                  floatControls.start(getSnapCoords(newPos));
                } else {
                  setFloatPos(newPos);
                }
              }}
              onClick={() => {
                if (isFloatDragging) return;
                const nardName =
                  uiLang === "hi"
                    ? "नॉर्ड"
                    : uiLang === "bho"
                      ? "नॉर्ड"
                      : "Nard";
                const salesRole = {
                  id: "sales",
                  name: nardName,
                  color: "from-blue-500 to-sky-500",
                  bg: "bg-blue-900/40",
                  accent: "border-blue-500/50",
                  textColors: "text-blue-50",
                  dropShadow: "drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]",
                  hex: "#3b82f6",
                };
                const initialMsg = getInitialMessage(
                  uiLang,
                  userName,
                  salesRole,
                );
                setMessages([
                  {
                    id: Date.now().toString(),
                    role: "model",
                    text: initialMsg,
                  },
                ]);
                setCurrentChatId(null);
                setSelectedRole(salesRole);
                setReturnToLandingOnExit(false);
                setShowLandingPage(false);
                setShowPathModal(false);
                setShowSettings(false);
                setShowAdminPanel(false);
                setShowClientPanel(false);
                setIsSaveModalOpen(false);
                setIsHistoryOpen(false);
                setShowFinalOfferPopup(false);
                setShowLeftMenu(false);
                setShowMoreMenu(false);
                setIsLive(true);
                if (!isSessionActiveRef.current) {
                  toggleLiveAudio(undefined, salesRole);
                }
              }}
              className={`fixed top-0 left-0 z-[99999] flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl group border border-white/20`}
              style={{
                boxShadow: `0 10px 25px -5px rgba(56,189,248,0.5)`,
                touchAction: "none",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Pulsing blue outer indicator */}
              <div className="absolute -inset-[5px] rounded-full border-[3px] border-blue-400 animate-pulse pointer-events-none shadow-[0_0_15px_rgba(56,189,248,0.8)] -z-10"></div>

              <div
                className="absolute inset-0 pointer-events-none rounded-full"
                style={{ backgroundColor: "#000000", opacity: 1 }}
              ></div>

              {/* CSS Waves Animation */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
                <div
                  className="absolute w-[250%] h-[250%] rounded-[45%] animate-spin z-0"
                  style={{
                    top: "65%",
                    left: "-75%",
                    animationDuration: "8s",
                    backgroundColor: "#38bdf8",
                    opacity: 0.45,
                  }}
                ></div>
                <div
                  className="absolute w-[250%] h-[250%] rounded-[40%] animate-spin z-0 inline-block"
                  style={{
                    top: "70%",
                    left: "-75%",
                    animationDuration: "6s",
                    animationDirection: "reverse",
                    backgroundColor: "#0ea5e9",
                    opacity: 0.6,
                  }}
                ></div>
                <div
                  className="absolute w-[250%] h-[250%] rounded-[43%] animate-spin z-0"
                  style={{
                    top: "75%",
                    left: "-75%",
                    animationDuration: "7s",
                    backgroundColor: "#0284c7",
                    opacity: 0.75,
                  }}
                ></div>

                {/* Inner shadow for spherical feel */}
                <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)] z-10"></div>
              </div>

              <span className="font-black text-xs sm:text-sm z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wide group-hover:-translate-y-0.5 transition-transform text-center px-1 leading-tight select-none text-sky-300">
                {uiLang === "hi" || uiLang === "bho" ? "नॉर्ड" : "Nard"}
              </span>

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
        {showLandingPage && showNardNowButton && !showPathModal && (
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

              let newPos: "tl" | "tr" | "ml" | "mr" | "bl" | "br" = "bl";
              if (isTop) newPos = isLeft ? "tl" : "tr";
              else if (isBottom) newPos = isLeft ? "bl" : "br";
              else newPos = isLeft ? "ml" : "mr";

              if (newPos === nardNowPos) {
                nardNowControls.start(getSnapCoords(newPos));
              } else {
                setNardNowPos(newPos);
              }
            }}
            onClick={() => {
              if (isNardNowDragging) return;
              setShowPathModal(true);
            }}
            className="fixed top-0 left-0 z-[1000] flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl group border border-white/20"
            style={{
              boxShadow: `0 10px 25px -5px ${brandTheme.hex}80`,
              touchAction: "none",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* Pulsing outer indicator */}
            <div
              className="absolute -inset-[5px] rounded-full border-[3px] animate-pulse pointer-events-none -z-10"
              style={{
                borderColor: brandTheme.hex,
                boxShadow: `0 0 15px ${brandTheme.hex}80`,
              }}
            ></div>

            <div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{ backgroundColor: "#000000", opacity: 1 }}
            ></div>

            {/* CSS Waves Animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
              <div
                className="absolute w-[250%] h-[250%] rounded-[45%] animate-spin z-0"
                style={{
                  top: "65%",
                  left: "-75%",
                  animationDuration: "8s",
                  backgroundColor: brandTheme.hex,
                  opacity: 0.45,
                }}
              ></div>
              <div
                className="absolute w-[250%] h-[250%] rounded-[40%] animate-spin z-0 inline-block"
                style={{
                  top: "70%",
                  left: "-75%",
                  animationDuration: "6s",
                  animationDirection: "reverse",
                  backgroundColor: brandTheme.hex,
                  opacity: 0.6,
                }}
              ></div>
              <div
                className="absolute w-[250%] h-[250%] rounded-[43%] animate-spin z-0"
                style={{
                  top: "75%",
                  left: "-75%",
                  animationDuration: "7s",
                  backgroundColor: brandTheme.hex,
                  opacity: 0.75,
                }}
              ></div>

              {/* Inner shadow for spherical feel */}
              <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)] z-10"></div>
            </div>

            <div className="z-10 flex flex-col items-center justify-center mt-1">
              <Rocket
                size={24}
                className="text-white drop-shadow-md group-hover:-translate-y-1 transition-transform"
              />
            </div>

            {/* Live ping animation effect */}
            <span className="absolute -top-1 -right-1 flex h-6 w-6 z-20">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: brandTheme.hex }}
              ></span>
              <span
                className="relative inline-flex rounded-full h-6 w-6 items-center justify-center shadow-md border border-gray-900"
                style={{ backgroundColor: brandTheme.hex }}
              >
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
                  <ArrowLeft
                    size={22}
                    style={{ color: selectedRole?.hex || brandTheme.hex }}
                  />
                </button>
              </div>
              <div className="flex flex-col">
                <h1
                  className="text-2xl sm:text-3xl font-mukta font-bold tracking-wider drop-shadow-sm leading-none"
                  style={{ color: selectedRole?.hex || brandTheme.hex }}
                >
                  Your Identity
                </h1>
              </div>

              {currentChatId && (
                <div className="flex flex-col justify-center overflow-hidden border-l border-gray-200 pl-2">
                  <span className="text-[8px] text-sky-600 uppercase tracking-widest font-bold opacity-70 leading-none">
                    {t.chattingIn}
                  </span>
                  <span className="text-xs font-medium text-gray-900 truncate max-w-[80px] sm:max-w-[150px] leading-tight">
                    {savedChats.find((c) => c.id === currentChatId)?.name}
                  </span>
                </div>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 relative"
              ref={moreMenuRef}
            >
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
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${showMoreMenu ? "bg-sky-900/50 text-sky-400 border-sky-600" : "bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 shadow-md"} border`}
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
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">
                          {t.chatHistory}
                        </span>
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
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">
                          {t.share}
                        </span>
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
                        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100">
                          {t.settings}
                        </span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>
        )}

        {/* Free Trial Widget in Chat UI - Temporarily Disabled */}
        {false && !isLive && !showLandingPage && (
          <div className="px-4 py-2 mt-2 z-10 w-full max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-gradient-to-r from-emerald-950/40 to-teal-900/20 border border-emerald-500/30 p-4 rounded-3xl shadow-lg backdrop-blur-md w-full">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                <Zap size={20} />
              </div>
              <div className="flex flex-col flex-1 text-center sm:text-left gap-1">
                <h3 className="text-white font-bold text-base flex items-center justify-center sm:justify-start gap-2">
                  {uiLang === "hi"
                    ? "2 मिनट का फ्री ट्रायल"
                    : "2 Minutes Free Trial"}
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] uppercase font-black tracking-wider rounded-md border border-emerald-500/30">
                    Free
                  </span>
                </h3>
                <p className="text-emerald-400/80 text-xs">
                  {uiLang === "hi"
                    ? "सभी फीचर्स अनलॉक करें"
                    : "Unlock all premium features"}
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                  {(["basic", "pro", "ultra"] as const).map((plan) => (
                    <button
                      key={plan}
                      onClick={() => handleSelectPlan(plan, false)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all border ${trialPlan === plan ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-gray-950/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-500"}`}
                    >
                      {plan.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {!isTrialActive ? (
                <button
                  onClick={() => handleSelectPlan(trialPlan, true)}
                  className="w-full sm:w-auto px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors whitespace-nowrap"
                >
                  {uiLang === "hi" ? "ट्रायल शुरू करें" : "Start Trial"}
                </button>
              ) : (
                <div className="w-full sm:w-auto px-4 py-2 text-sm border border-emerald-500/50 bg-emerald-900/40 text-emerald-300 font-bold rounded-xl whitespace-nowrap text-center shadow-inner">
                  {uiLang === "hi"
                    ? `एक्टिव: ${Math.ceil((freeTrialEnd! - Date.now()) / (1000 * 60 * 60 * 24))} दिन`
                    : `Active: ${Math.ceil((freeTrialEnd! - Date.now()) / (1000 * 60 * 60 * 24))} Days`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Toast */}
        <AnimatePresence></AnimatePresence>

        {/* Settings Panel Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm shadow-2xl pointer-events-auto overflow-hidden"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-gray-900 border border-gray-700/50 rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] flex flex-col"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings2 size={20} className="text-amber-400" />
                    {t.settings || "Settings"}
                  </h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-2 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-4 grid grid-cols-1 gap-4 overflow-y-auto hide-scrollbar flex-1">
                  {/* Theme Setting */}
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-900/40 rounded-lg text-yellow-400">
                        {theme === "light" ? (
                          <Sun size={20} />
                        ) : (
                          <Moon size={20} />
                        )}
                      </div>
                      <div>
                        <h3 className="text-gray-200 font-medium">
                          {uiLang === "hi" ? "ऐप की थीम" : "App Theme"}
                        </h3>
                        <p className="text-gray-400 text-xs">
                          {uiLang === "hi"
                            ? "दिन में व्हाइट और रात में डार्क थीम"
                            : "White in day, dark in night"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-600 outline-none text-white cursor-default">
                        {uiLang === "hi" ? "ऑटो (दिन/रात)" : "Auto (Day/Night)"}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col w-full">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-rose-900/40 rounded-lg text-rose-400">
                          <ShieldAlert size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-200 font-medium">
                            Master Admin
                          </h3>
                          <p className="text-gray-400 text-xs">
                            E-cosystem Security
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowSettings(false);
                          setShowAdminPanel(true);
                        }}
                        className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-[88px] font-bold text-white transition-colors border border-gray-700 shadow-sm flex items-center justify-center gap-2 text-sm"
                      >
                        <ShieldAlert size={16} className="text-rose-400" />{" "}
                        Enter Master Dashboard
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="text-gray-200 font-medium">
                          {t.language}
                        </h3>
                        <p className="text-gray-400 text-xs">
                          {t.chooseLanguage}
                        </p>
                      </div>
                    </div>
                    <select
                      value={uiLang}
                      onChange={(e) =>
                        setUiLang(e.target.value as "en" | "hi" | "bho")
                      }
                      className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors"
                    >
                      <option className="bg-gray-900" value="en">
                        English
                      </option>
                      <option className="bg-gray-900" value="hi">
                        हिन्दी (Hindi)
                      </option>
                      <option className="bg-gray-900" value="bho">
                        भोजपुरी (Bhojpuri)
                      </option>
                      <option className="bg-gray-900" value="bn">
                        বাংলা (Bengali)
                      </option>
                      <option className="bg-gray-900" value="ta">
                        தமிழ் (Tamil)
                      </option>
                      <option className="bg-gray-900" value="te">
                        తెలుగు (Telugu)
                      </option>
                      <option className="bg-gray-900" value="mr">
                        मराठी (Marathi)
                      </option>
                      <option className="bg-gray-900" value="gu">
                        ગુજરાતી (Gujarati)
                      </option>
                      <option className="bg-gray-900" value="kn">
                        ಕನ್ನಡ (Kannada)
                      </option>
                      <option className="bg-gray-900" value="ml">
                        മലയാളം (Malayalam)
                      </option>
                      <option className="bg-gray-900" value="or">
                        ଓଡ଼ିଆ (Odia)
                      </option>
                      <option className="bg-gray-900" value="pa">
                        ਪੰਜਾਬੀ (Punjabi)
                      </option>
                      <option className="bg-gray-900" value="as">
                        অসমীয়া (Assamese)
                      </option>
                      <option className="bg-gray-900" value="ur">
                        اردو (Urdu)
                      </option>
                      <option className="bg-gray-900" value="ne">
                        नेपाली (Nepali)
                      </option>
                      <option className="bg-gray-900" value="mai">
                        मैथिली (Maithili)
                      </option>
                      <option className="bg-gray-900" value="sd">
                        سنڌي (Sindhi)
                      </option>
                      <option className="bg-gray-900" value="kok">
                        कोंकणी (Konkani)
                      </option>
                      <option className="bg-gray-900" value="doi">
                        डोगरी (Dogri)
                      </option>
                      <option className="bg-gray-900" value="ks">
                        کأشُر (Kashmiri)
                      </option>
                      <option className="bg-gray-900" value="sa">
                        संस्कृतम् (Sanskrit)
                      </option>
                      <option className="bg-gray-900" value="sat">
                        ᱥᱟᱱᱛᱟᱲᱤ (Santali)
                      </option>
                      <option className="bg-gray-900" value="brx">
                        बर' (Bodo)
                      </option>
                      <option className="bg-gray-900" value="mni">
                        মৈতৈ (Manipuri)
                      </option>
                    </select>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                          <Users size={16} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">
                            {t.premium} Voice
                          </h3>
                          <p className="text-gray-400 text-xs">
                            {t.selectPremiumVoice}
                          </p>
                        </div>
                      </div>
                      <select
                        className="w-full bg-gray-900 shadow-md border border-gray-700 rounded-lg p-2 text-gray-200 outline-none focus:ring-2 focus:ring-sky-500"
                        value={premiumVoice}
                        onChange={(e) => {
                          setPremiumVoice(e.target.value);
                          safeStorage.setItem("premiumVoice", e.target.value);
                        }}
                      >
                        <option value="Fenrir" className="bg-zinc-800">
                          {t.fenrirDesc}
                        </option>
                        <option value="Charon" className="bg-zinc-800">
                          {t.charonDesc}
                        </option>
                        <option value="Puck" className="bg-zinc-800">
                          {t.puckDesc}
                        </option>
                        <option value="Kore" className="bg-zinc-800">
                          {(t as any).koreDesc || "Kore (Calm Female)"}
                        </option>
                        <option value="Zephyr" className="bg-zinc-800">
                          {(t as any).zephyrDesc || "Zephyr (Strong Female)"}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                          <Zap size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-200 font-medium">
                            {t.speechRate || "Speech Rate"}
                          </h3>
                          <p className="text-gray-400 text-xs">
                            {t.adjustRate || "Adjust voice speed"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={speechRate}
                          onChange={(e) =>
                            setSpeechRate(parseFloat(e.target.value))
                          }
                          className="w-24 md:w-32 accent-sky-500"
                        />
                        <span className="text-gray-400 w-8 text-right">
                          {speechRate.toFixed(1)}x
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Audio Input Settings */}
                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-900/40 rounded-lg text-sky-400">
                          <Mic size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-200 font-medium">
                            {uiLang === "hi" ? "ऑडियो इनपुट" : "Audio Input"}
                          </h3>
                          <p className="text-gray-400 text-xs">
                            {uiLang === "hi"
                              ? "अपना माइक्रोफ़ोन चुनें"
                              : "Select your microphone"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={connectBluetooth}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/40 text-blue-400 hover:bg-blue-800/50 rounded-lg transition-colors text-sm font-medium"
                      >
                        <Bluetooth size={16} />
                        {uiLang === "hi"
                          ? "ब्लूटूथ कनेक्ट करें"
                          : "Connect Bluetooth"}
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedAudioInput}
                        onChange={(e) => setSelectedAudioInput(e.target.value)}
                        onClick={fetchAudioDevices}
                        className="w-full bg-gray-900 shadow-sm border border-gray-700 rounded-lg p-2 text-gray-200 outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="default">
                          {uiLang === "hi"
                            ? "डिफ़ॉल्ट माइक्रोफ़ोन"
                            : "Default Microphone"}
                        </option>
                        {audioInputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label ||
                              (uiLang === "hi"
                                ? `माइक्रोफ़ोन ${device.deviceId.substring(0, 5)}...`
                                : `Microphone ${device.deviceId.substring(0, 5)}...`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <main
          id="main-scroll-container"
          className={`flex-1 overflow-y-auto hide-scrollbar ${isLive ? "p-0" : "px-4 py-2 md:px-6 md:py-4"} flex flex-col relative`}
          style={{ overflowAnchor: "none" }}
        >
          <div
            id="chat-messages-container"
            className={`max-w-3xl mx-auto w-full space-y-6 relative transition-opacity duration-300 opacity-100 ${!isLive ? "pb-10" : ""}`}
          >
            {!isLive &&
              messages.map((msg, index) => {
                const { mainText, questions } = parseMessage(msg.text);

                // Hide messages that are just a recap which should only be spoken
                if (
                  !mainText &&
                  msg.role === "model" &&
                  (msg.text.includes("[[RECAP]]") ||
                    msg.text.includes("[[ENDRECAP]]"))
                )
                  return null;

                return (
                  <motion.div
                    id={`message-${msg.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[95%] md:max-w-[85%] p-4 bg-gray-900/95 text-white backdrop-blur-md border ${msg.role === "user" ? "border-[#00ffcc]/50 shadow-[0_0_20px_rgba(0,255,204,0.15)] rounded-b-[2rem] rounded-tl-[2rem] rounded-tr-[88px]" : "border-[#00ffcc]/50 shadow-[0_0_20px_rgba(0,255,204,0.15)] rounded-b-[2rem] rounded-tr-[2rem] rounded-tl-[88px]"}`}
                    >
                      {msg.role === "model" && (
                        <div
                          id={`message-header-${msg.id}`}
                          className="flex items-center justify-between mb-2"
                        >
                          <div
                            className="flex items-center gap-2 text-xs font-semibold drop-shadow-sm"
                            style={{
                              color: selectedRole?.hex || brandTheme.hex,
                            }}
                          >
                            <div className="flex items-center justify-center w-7 h-7 relative mt-1">
                              {digitalIdentity.logoUrl || brandLogo ? (
                                <img
                                  src={digitalIdentity.logoUrl || brandLogo!}
                                  alt="Logo"
                                  className="w-6 h-6 rounded-full object-cover border border-gray-600"
                                  style={{
                                    borderColor:
                                      selectedRole?.hex || brandTheme.hex,
                                  }}
                                />
                              ) : (
                                <>
                                  <Flame size={24} className="relative z-10" />
                                  <div className="absolute -top-2 right-0.5 z-20">
                                    <Sparkles
                                      size={10}
                                      className="text-blue-400 animate-pulse drop-shadow-sm"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                            <span className="font-mukta text-sm">
                              {/* Bot name removed as per user instruction */}
                            </span>
                          </div>
                        </div>
                      )}
                      {msg.role === "user" && (
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 relative">
                            <button
                              onClick={() => handleCopy(msg.text, msg.id)}
                              className="p-1 text-blue-600 hover:text-gray-900 hover:bg-white shadow-md rounded transition-colors"
                              title={t.copy}
                            >
                              {copiedMessageId === msg.id ? (
                                <Check size={12} />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInput(msg.text);
                                setEditMsgId(msg.id);
                              }}
                              className="p-1 text-blue-600 hover:text-gray-900 hover:bg-white shadow-md rounded transition-colors"
                              title={t.edit}
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                          <div className="text-xs font-semibold text-blue-700">
                            <span>{t.you}</span>
                          </div>
                        </div>
                      )}
                      <div
                        className={`max-w-none text-gray-400 font-bold font-mukta leading-tight ${msg.role === "user" ? "text-right" : "text-left ai-message-content"}`}
                      >
                        {msg.image && (
                          <div className="mb-3 flex justify-end">
                            <img
                              src={`data:${msg.image.mimeType};base64,${msg.image.data}`}
                              alt="Uploaded content"
                              className="max-w-[200px] md:max-w-[300px] rounded-xl border border-gray-200 shadow-sm"
                            />
                          </div>
                        )}
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            p: ({ children }) => (
                              <p className="text-[24px] mb-0.5 leading-tight text-gray-400/90">
                                {children}
                              </p>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-[27px] mb-1 leading-tight text-gray-300">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-[27px] mb-1 leading-tight text-gray-300">
                                {children}
                              </h2>
                            ),
                            li: ({ children }) => (
                              <li className="text-[24px] mb-0.5 leading-tight text-gray-400/90">
                                {children}
                              </li>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-bold text-gray-200">
                                {children}
                              </strong>
                            ),
                          }}
                        >
                          {playingMessageId === msg.id
                            ? highlightMarkdown(mainText, playingTextIndex)
                            : mainText}
                        </ReactMarkdown>
                      </div>
                      {msg.role === "model" && (
                        <>
                          {!(
                            index === messages.length - 1 &&
                            (isLoading || isStreaming)
                          ) && (
                            <div
                              id={`message-actions-${msg.id}`}
                              className="mt-3 flex justify-end items-center gap-2"
                            >
                              {msg.id === "1" && !currentChatId && (
                                <button
                                  onClick={() => setIsSaveModalOpen(true)}
                                  className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-900/40 hover:bg-sky-800/50 text-sky-300 hover:text-sky-200 rounded-lg transition-colors mr-auto text-sm font-bold border border-sky-800/50 group active:scale-95 shadow-lg"
                                  title={t.saveChat}
                                >
                                  <Bookmark
                                    size={14}
                                    className="group-hover:scale-110 transition-transform"
                                  />
                                  <span className="font-mukta">
                                    {t.saveChat}
                                  </span>
                                </button>
                              )}
                              <button
                                onClick={() => handleCopy(msg.text, msg.id)}
                                className="flex items-center justify-center p-2 bg-gray-800/50 border border-gray-700 hover:bg-gray-700/50 shadow-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors"
                                title={t.copy}
                              >
                                {copiedMessageId === msg.id ? (
                                  <Check size={16} className="text-green-400" />
                                ) : (
                                  <Copy size={16} />
                                )}
                              </button>
                              <button
                                onClick={() => handleShare(msg.text)}
                                className="flex items-center justify-center p-2 bg-gray-800/50 border border-gray-700 hover:bg-gray-700/50 shadow-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors"
                                title={t.share}
                              >
                                <Share2 size={16} />
                              </button>
                            </div>
                          )}
                          {questions.length > 0 &&
                            !(
                              index === messages.length - 1 &&
                              (isLoading || isStreaming)
                            ) && (
                              <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
                                {questions.map((q, idx) => (
                                  <button
                                    key={`${msg.id}-q-${idx}`}
                                    onClick={() => handleSend(q)}
                                    disabled={isLoading}
                                    className="text-xs md:text-sm bg-gray-800/50 hover:bg-gray-700/50 border border-sky-900/50 text-sky-400 px-3 py-2 rounded-full transition-colors shadow-sm disabled:opacity-50"
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            )}
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}

            {messages.length === 1 && !isLive && !userName && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex justify-start mt-4"
              >
                <div className="max-w-[95%] md:max-w-[85%] p-4 sm:p-5 rounded-2xl bg-gray-900/60 backdrop-blur-md border border-gray-800 shadow-xl text-gray-200">
                  <div className="flex items-center gap-2 mb-3 text-sky-400 font-bold">
                    <Bot size={20} />
                    <h3 className="font-mukta">
                      {uiLang === "hi"
                        ? "अपने सहायक का नाम रखें"
                        : "Name Your Assistant"}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4 font-mukta">
                    {uiLang === "hi"
                      ? "आप मुझे क्या बुलाना चाहेंगे? आप अपने AI सहायक के लिए एक कस्टम नाम सेट कर सकते हैं।"
                      : "What would you like to call me? You can set a custom name for your AI assistant."}
                  </p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={setupName}
                      onChange={(e) => setSetupName(e.target.value)}
                      placeholder={t.userNamePlaceholder}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 h-10 text-gray-200 outline-none focus:border-sky-500 transition-colors placeholder-gray-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && setupName.trim()) {
                          const newName = setupName.trim();
                          setUserName(newName);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const newName = setupName.trim();
                        setUserName(newName);
                      }}
                      className="w-1/2 mx-auto bg-sky-900/50 hover:bg-sky-800/60 text-sky-300 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-sky-800 active:scale-95"
                    >
                      {setupName.trim()
                        ? uiLang === "hi"
                          ? "सुरक्षित करें"
                          : "Save"
                        : uiLang === "hi"
                          ? "कस्टम नाम सेव करें"
                          : "Save Custom Name"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {messages.length === 1 && !isLive && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start"
              >
                {(() => {
                  let questions = [t.q1, t.q2, t.q3, t.q4]; // fallback
                  const targetLang = industryQuestions[uiLang] ? uiLang : "en";
                  if (selectedRole?.id) {
                    const langQuestions = industryQuestions[targetLang];
                    if (langQuestions && langQuestions[selectedRole.id]) {
                      questions = langQuestions[selectedRole.id];
                    }
                  } else if (
                    industryQuestions[targetLang] &&
                    industryQuestions[targetLang]["sales"]
                  ) {
                    questions = industryQuestions[targetLang]["sales"];
                  }
                  return questions;
                })().map((question, idx) => (
                  <button
                    key={`initial-q-${idx}`}
                    onClick={() => handleSend(question)}
                    className="text-xs md:text-sm bg-gray-800/50 hover:bg-gray-700/50 border border-sky-900/50 text-sky-400 px-3 py-2 rounded-full transition-colors shadow-sm"
                  >
                    {question}
                  </button>
                ))}
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {isLive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={handleInterruption}
              className={`fixed inset-0 flex flex-col items-center justify-center z-[999999] overflow-hidden cursor-pointer transition-opacity duration-500 ${showLandingPage ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              {/* Nard Welcome Animation */}
              <AnimatePresence>
                {showLiveWelcomeAnimation && (
                  <motion.div
                    key="welcome-animation"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="absolute inset-0 flex flex-col items-center justify-center z-[90] pointer-events-none bg-black/80 backdrop-blur-md"
                  >
                    <div className="relative flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                        className="absolute w-48 h-48 md:w-64 md:h-64 rounded-full border-t-2 border-r-2 border-emerald-400/80 shadow-[0_0_50px_rgba(52,211,153,0.4)] mix-blend-screen"
                      />
                      <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
                        className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full border-b-2 border-l-2 border-teal-500/80 shadow-[0_0_50px_rgba(20,184,166,0.3)] mix-blend-screen"
                      />
                      <motion.div
                         className="relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-[0_0_60px_rgba(52,211,153,0.8)]"
                         animate={{ scale: [1, 1.1, 1] }}
                         transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      >
                         <Bot className="text-white drop-shadow-[0_0_10px_white] w-16 h-16 md:w-20 md:h-20" />
                      </motion.div>
                    </div>
                    <motion.div
                      animate={{ y: [0, -10, 0], opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="mt-16 text-center"
                    >
                      <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)] leading-tight tracking-tight">
                        {uiLang === "hi" ? "नार्ड आपका स्वागत कर रहा है..." : "Nard is Welcoming You..."}
                      </h2>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Greeting Message Overlay */}
              <AnimatePresence>
                {showGreetingMessage && (
                  <motion.div
                    key="greeting-message"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="absolute inset-x-0 top-1/3 flex flex-col items-center justify-center z-[85] pointer-events-none"
                  >
                    <div className="bg-black/60 backdrop-blur-xl px-8 py-6 rounded-[32px] border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)] max-w-2xl text-center mx-4">
                       <h3 className="text-2xl md:text-4xl font-bold text-white tracking-wide">
                          {uiLang === "hi" ? "नमस्ते, मैं आपका वर्कस्पेस सेट कर रहा हूँ..." : "Hi there, just setting up your workspace..."}
                       </h3>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Promo Image Overlay */}
              <AnimatePresence>
                {showPromoImage && (
                  <motion.div
                    key="promo-image"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, filter: "blur(20px)" }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="absolute inset-0 flex flex-col items-center justify-center z-[84] pointer-events-none bg-black"
                  >
                    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
                       {/* High-tech modern background image */}
                       <img 
                          src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop" 
                          alt="Nard Features" 
                          className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105 transform animate-pulse"
                          style={{ animationDuration: '4s' }}
                       />
                       
                       {/* Scanning Line overlay */}
                       <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent w-full h-[5%] opacity-50 animate-[scan_4s_ease-in-out_infinite]" />
                       
                       {/* Advanced glow effects */}
                       <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,204,0.1)_0%,rgba(0,0,0,0.8)_80%)]" />

                       <div className="absolute inset-0 bg-gradient-to-t from-black/100 via-black/40 to-black/20 flex flex-col justify-center items-center p-8 md:p-12 text-center z-10">
                          
                          <motion.div
                             initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                             animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                             transition={{ delay: 0.5, duration: 0.8 }}
                             className="mb-8"
                          >
                            <h2 className="text-5xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-emerald-200 to-cyan-400 font-mukta drop-shadow-[0_0_30px_rgba(34,211,238,0.4)] tracking-wide uppercase">
                               {uiLang === "hi" ? "नार्ड का आधुनिक बिज़नेस मॉडल" : "Nard's Modern Business Model"}
                            </h2>
                            <p className="mt-4 text-xl md:text-3xl text-emerald-100/80 tracking-widest uppercase font-mono">
                               {uiLang === "hi" ? "आपके बिज़नेस को दे नई उड़ान" : "Empower Your Business"}
                            </p>
                          </motion.div>

                          <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2, duration: 0.8 }}
                            className="flex flex-wrap justify-center gap-6 mt-8 max-w-4xl"
                          >
                             <div className="bg-black/50 backdrop-blur-xl px-6 py-4 border border-cyan-500/40 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] flex flex-col items-center">
                               <Sparkles className="w-8 h-8 text-cyan-400 mb-2" />
                               <span className="text-cyan-100 font-bold text-lg md:text-2xl uppercase tracking-wider">{uiLang === "hi" ? "रीयल-टाइम इंटेलिजेंस" : "Real-time Intelligence"}</span>
                             </div>

                             <div className="bg-black/50 backdrop-blur-xl px-6 py-4 border border-emerald-500/40 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex flex-col items-center">
                               <BarChart3 className="w-8 h-8 text-emerald-400 mb-2" />
                               <span className="text-emerald-100 font-bold text-lg md:text-2xl uppercase tracking-wider">{uiLang === "hi" ? "ऑटो-पेमेंट सिंक" : "Auto-Payment Sync"}</span>
                             </div>

                             <div className="bg-black/50 backdrop-blur-xl px-6 py-4 border border-fuchsia-500/40 rounded-2xl shadow-[0_0_20px_rgba(217,70,239,0.3)] flex flex-col items-center">
                               <MessageSquare className="w-8 h-8 text-fuchsia-400 mb-2" />
                               <span className="text-fuchsia-100 font-bold text-lg md:text-2xl uppercase tracking-wider">{uiLang === "hi" ? "आवाज़ आधारित AI" : "Voice-driven AI"}</span>
                             </div>
                         </motion.div>
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Connecting State UI */}
              {isLiveConnecting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center z-[100] bg-black/40 backdrop-blur-sm pointer-events-none"
                >
                  <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
                  <p className="text-emerald-400 font-mono text-sm tracking-widest animate-pulse">
                    ESTABLISHING SECURE CONNECTION...
                  </p>
                </motion.div>
              )}

              {/* Frequency Visualizer (Full Screen Background) */}
              <div className="absolute inset-0 w-full h-full z-0 pointer-events-none flex items-center justify-center">
                {/* Glowing Aura */}
                {isModelSpeaking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: [0.1, 0.3, 0.1],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 4,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-0 bg-yellow-400/10 blur-[100px] z-0"
                  />
                )}

                <canvas
                  ref={visualizerCanvasRef}
                  className="w-full h-full absolute inset-0 z-10"
                />
              </div>

              {/* Click to Start Animation Overlay */}
              {!isSessionActive && !isLiveConnecting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center z-[80] pointer-events-none"
                >
                  {/* Modern Digital Core */}
                  <div className="relative flex items-center justify-center">
                    {/* Pulse Rings */}
                    {[...Array(3)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{
                          scale: [1, 2],
                          opacity: [0.5, 0],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 3,
                          delay: i * 1,
                          ease: "easeOut",
                        }}
                        className="absolute w-32 h-32 md:w-48 md:h-48 rounded-full border border-sky-400/30"
                      />
                    ))}

                    {/* Inner Glowing Hexagon/Circle */}
                    <motion.div
                      animate={{
                        scale: [0.95, 1.05, 0.95],
                      }}
                      transition={{
                        scale: {
                          repeat: Infinity,
                          duration: 2,
                          ease: "easeInOut",
                        },
                      }}
                      className="relative w-32 h-32 md:w-48 md:h-48 rounded-2xl md:rounded-[2.5rem] border-2 border-sky-400/50 flex items-center justify-center bg-sky-900/10 backdrop-blur-md shadow-[0_0_30px_rgba(56,189,248,0.2)]"
                    >
                      <motion.div
                        animate={{
                          opacity: [0.4, 1, 0.4],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.5,
                          ease: "easeInOut",
                        }}
                        className="text-sky-400 flex flex-col items-center relative overflow-hidden"
                      >
                        <Mic
                          size={48}
                          className="md:size-24 drop-shadow-[0_0_15px_rgba(56,189,248,0.8)]"
                        />

                        {/* Scan Line Effect */}
                        <motion.div
                          animate={{ top: ["0%", "100%", "0%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 4,
                            ease: "linear",
                          }}
                          className="absolute left-0 right-0 h-[2px] bg-sky-400/50 shadow-[0_0_10px_#38bdf8] pointer-events-none"
                        />

                        <div className="mt-2 flex gap-1">
                          {[...Array(3)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ height: [4, 12, 4] }}
                              transition={{
                                repeat: Infinity,
                                duration: 0.5,
                                delay: i * 0.1,
                              }}
                              className="w-1 bg-sky-400 rounded-full"
                            />
                          ))}
                        </div>
                      </motion.div>
                    </motion.div>
                  </div>

                  {/* Text Element */}
                  <motion.div
                    animate={{ y: [0, 5, 0], opacity: [0.8, 1, 0.8] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="mt-12 text-center px-6"
                  >
                    <div className="inline-block px-4 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 mb-3">
                      <span className="text-sky-400 text-xs font-black tracking-widest uppercase">
                        Action Required
                      </span>
                    </div>
                    <h2 className="text-white font-mukta font-black text-3xl md:text-5xl tracking-tight leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                      {uiLang === "hi"
                        ? "बातचीत शुरू करने के लिए"
                        : "To Start Conversation"}
                    </h2>
                    <div className="flex items-center justify-center gap-3 mt-4 group">
                      <div className="h-[1px] w-8 md:w-16 bg-gradient-to-r from-transparent to-yellow-400 opacity-50" />
                      <p className="text-yellow-400 font-mukta font-black text-4xl md:text-6xl tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(253,224,71,0.6)] animate-pulse">
                        {uiLang === "hi" ? "क्लिक करें" : "CLICK HERE"}
                      </p>
                      <div className="h-[1px] w-8 md:w-16 bg-gradient-to-l from-transparent to-yellow-400 opacity-50" />
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {isModelSpeaking && liveSubtitles && (
                <div className="absolute top-[10%] bottom-[150px] flex-col left-4 right-4 z-[90] pointer-events-none flex justify-start items-center pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-4xl mx-auto flex flex-col pointer-events-auto max-h-full overflow-hidden shrink min-h-0 relative"
                  >
                    <div
                      ref={liveSubtitlesRef}
                      className={`h-full w-full overflow-y-auto hide-scrollbar flex flex-col justify-start`}
                      style={{
                        maskImage: "none",
                        WebkitMaskImage: "none",
                        overflowAnchor: "auto",
                      }}
                    >
                      <div
                        className={`max-w-none text-white font-bold font-mukta leading-tight text-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] break-words ${subtitleConfig.tracking}`}
                        style={{ wordBreak: 'normal', overflowWrap: 'break-word', textShadow: '0px 2px 4px rgba(0,0,0,0.8)' }}
                      >
                        {/* Use direct word renderer instead of ReactMarkdown for the live stream to ensure component identity stability and prevent flickering */}
                        <div
                          className={`${subtitleConfig.fontSize} transition-all duration-700 ease-in-out whitespace-pre-wrap py-8`}
                        >
                          <AnimatedSubtitleWords text={liveSubtitles} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              <div className="relative flex flex-col items-center justify-center w-[100vw] h-[100vh] pb-0 z-10 pointer-events-none">
                {/* Status Indicator (Pinned to Bottom Edge - FULL WIDTH) */}
                <div className="absolute bottom-0 flex flex-col items-center z-30 w-full pointer-events-auto">
                  <style>{`
                      @keyframes siri-gradient {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                      }
                    `}</style>
                  <button
                    onClick={(e) => toggleLiveAudio(e)}
                    className="relative w-full flex justify-center group active:scale-[0.99] transition-all"
                  >
                    <motion.div
                      animate={{ opacity: [0.9, 1, 0.9] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="relative w-full flex items-center justify-center gap-4 bg-black px-8 py-8 md:py-10 rounded-t-[6rem] md:rounded-t-[8rem] border-t-[4px] border-blue-500 shadow-[0_-5px_50px_rgba(59,130,246,0.6)]"
                    >
                      {/* Siri Glow Indicator Wrapper */}
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <div
                          id="listening-indicator-glow"
                          className="absolute -inset-x-40 -inset-y-16 rounded-full blur-2xl opacity-0 transition-opacity duration-300"
                          style={{
                            backgroundImage: activeGradient,
                            backgroundSize: "200% 100%",
                            animation: "siri-gradient 2s linear infinite",
                          }}
                        />
                        <div
                          id="listening-indicator-border"
                          className="absolute -inset-x-24 -inset-y-8 rounded-full blur-md opacity-0 transition-opacity duration-300"
                          style={{
                            backgroundImage: activeGradient,
                            backgroundSize: "200% 100%",
                            animation: "siri-gradient 2s linear infinite",
                          }}
                        />
                      </div>

                      <div
                        className={`w-4 h-4 flex-shrink-0 rounded-full ${isSessionActiveRef.current ? (isModelSpeaking ? "bg-yellow-600/80 shadow-[0_0_15px_rgba(202,138,4,0.5)]" : "bg-blue-600/80 shadow-[0_0_15px_rgba(37,99,235,0.5)] animate-pulse") : "bg-gray-700 shadow-none"}`}
                      ></div>
                      <span className="text-gray-400 font-mukta font-bold text-2xl md:text-3xl tracking-wide drop-shadow-sm truncate relative z-10">
                        {isModelSpeaking
                          ? getGenderAdjustedText(
                              t.speaking,
                              uiLang,
                              displayBotName
                            )
                          : !hasLiveStarted
                            ? getGenderAdjustedText(
                                t.ready,
                                uiLang,
                                displayBotName
                              )
                            : getGenderAdjustedText(
                                t.listening,
                                uiLang,
                                displayBotName
                              )}
                      </span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          stopLiveAudio();
                        }}
                        className="flex flex-col items-center ml-4 border-l border-gray-800 pl-4 py-1 relative z-10 cursor-pointer"
                      >
                        <X
                          size={24}
                          className="text-gray-500 group-hover:text-red-500 transition-colors"
                        />
                        <span className="text-[10px] text-gray-500 mt-1 uppercase font-black tracking-widest hidden sm:block">
                          STOP
                        </span>
                      </div>
                    </motion.div>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Input Area */}
        <footer
          className={`${isLive ? "p-0 h-0 hidden" : "p-0"} relative z-20 w-full`}
        >
          {isLoading && !isLive && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full flex justify-start mb-0 px-4 py-2 bg-gray-900/40 backdrop-blur-md"
            >
              <div className="px-4 py-2 flex items-center gap-3 bg-gray-900/60 backdrop-blur-md rounded-2xl shadow-sm border border-gray-800">
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: selectedRole?.hex || brandTheme.hex }}
                />
                <span className="text-sm text-gray-400">
                  <span
                    className="font-semibold drop-shadow-sm"
                    style={{ color: selectedRole?.hex || brandTheme.hex }}
                  >
                    {/* Bot name removed as per user instruction */}
                  </span>{" "}
                  {getGenderAdjustedText(t.thinking, uiLang, displayBotName)}
                </span>
              </div>
            </motion.div>
          )}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full bg-red-500/95 text-white px-6 py-3 shadow-xl text-sm font-medium flex items-start gap-2 backdrop-blur-md border-t border-red-400/50"
            >
              <Info size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="p-1 hover:bg-white shadow-md rounded-full transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
          {!isLive && (
            <div className="w-full relative flex items-end">
              <style>{`
          @keyframes fluid-wave-1 {
            0% { transform: scaleY(0.3); }
            50% { transform: scaleY(1.0); }
            100% { transform: scaleY(0.3); }
          }
          @keyframes fluid-gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
              <div
                className={`w-full relative flex flex-col shadow-[0_-2px_15px_rgba(59,130,246,0.15)] backdrop-blur-xl border-t transition-all duration-500 focus-within:shadow-[0_-4px_20px_rgba(59,130,246,0.25)] rounded-t-[4rem] md:rounded-t-[5.5rem] ${
                  isVoiceTyping
                    ? "bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border-blue-400 outline-none scale-[1.0]"
                    : "bg-gray-900 border-blue-500/80 text-white focus-within:bg-gray-950 focus-within:border-blue-400"
                }`}
                style={
                  isVoiceTyping
                    ? {
                        animation: "fluid-gradient 3s ease infinite",
                        backgroundSize: "200% 200%",
                      }
                    : {}
                }
              >
                {editMsgId && (
                  <div className="flex items-center justify-between bg-blue-50 text-blue-700 px-3 py-1.5 mb-2 rounded-xl border border-blue-100 text-xs font-medium mx-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <Edit2 size={12} />
                      <span>{t.edit}</span>
                    </div>
                    <button
                      onClick={() => {
                        setEditMsgId(null);
                        setInput("");
                        setSelectedImage(null);
                      }}
                      className="text-blue-500 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-100 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                {selectedImage && (
                  <div className="relative w-20 h-20 mb-2 ml-12">
                    <img
                      src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`}
                      alt="Selected"
                      className="w-full h-full object-cover rounded-lg border border-gray-300 shadow-sm"
                    />
                    <button
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 bg-white text-gray-800 rounded-full p-1 shadow-md border border-gray-200 hover:bg-gray-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="flex items-end w-full relative z-10">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center w-11 h-11 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors shrink-0 mb-1 ml-1"
                    title={t.uploadImage}
                  >
                    <Plus size={24} />
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />

                  {isVoiceTyping && !input ? (
                    <div className="absolute top-0 left-[48px] right-[110px] h-full pointer-events-none py-3 px-4 flex items-center gap-1">
                      <span className="text-blue-600/80 font-medium text-sm mr-2">
                        {uiLang === "hi" ? "सुन रहा हूँ..." : "Listening..."}
                      </span>
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1.5 h-4 bg-blue-500/60 rounded-full"
                          style={{
                            animation: `fluid-wave-1 1s ease-in-out infinite`,
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    !input &&
                    !selectedImage &&
                    !isInputFocused && (
                      <div
                        className={`absolute top-0 left-[48px] right-0 h-full pointer-events-none py-3 px-2 flex items-center ${
                          isLoading
                            ? "pr-[60px] sm:pr-[70px]"
                            : "pr-[110px] sm:pr-[120px]"
                        }`}
                      >
                        <div
                          ref={placeholderRef}
                          className="w-full text-gray-400 font-medium overflow-visible"
                          style={{
                            scrollBehavior: "smooth",
                            wordBreak: "break-word",
                          }}
                        >
                          {placeholderText}
                        </div>
                      </div>
                    )
                  )}

                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder=""
                    className={`w-full bg-transparent text-white placeholder-gray-500 py-4 px-4 sm:px-6 focus:outline-none resize-none min-h-[72px] max-h-32 font-medium relative z-20 ${
                      isLoading ||
                      input.trim() ||
                      selectedImage ||
                      isVoiceTyping
                        ? "pr-[70px] sm:pr-[80px]"
                        : "pr-[120px] sm:pr-[130px]"
                    } ${isVoiceTyping && !input ? "opacity-0" : "opacity-100"}`}
                    rows={1}
                    disabled={isLoading}
                  />
                  <div className="absolute right-4 bottom-3 flex gap-2 z-30">
                    {!input.trim() && !selectedImage && !isLoading && (
                      <button
                        onClick={toggleVoiceTyping}
                        className={`flex items-center justify-center w-11 h-11 rounded-full transition-all transform active:scale-95 border group ${
                          isVoiceTyping
                            ? "bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 text-white border-transparent shadow-[0_0_15px_rgba(168,85,247,0.6)] animate-pulse"
                            : "bg-gray-800/50 shadow-md text-gray-400 hover:bg-gray-700/50 shadow-md hover:text-gray-200 border-gray-700"
                        }`}
                        title={
                          isVoiceTyping ? t.stopVoiceTyping : t.voiceTyping
                        }
                      >
                        {isVoiceTyping ? (
                          <div className="relative flex items-center justify-center">
                            <MicOff
                              size={20}
                              className="group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(59,130,246,0.8)]"></div>
                          </div>
                        ) : (
                          <div className="relative flex items-center justify-center">
                            <Mic
                              size={20}
                              className="group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(59,130,246,0.8)]"></div>
                          </div>
                        )}
                      </button>
                    )}
                    {!input.trim() &&
                      !selectedImage &&
                      !isVoiceTyping &&
                      !isLoading && (
                        <div className="relative w-11 h-11 group">
                          {/* Rotating Digital Ring */}
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 8,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="absolute -inset-1.5 border border-dashed border-[#e83e8c]/40 rounded-full z-20 pointer-events-none"
                          />

                          {/* Edge Indicators / Glowing Sensor Dots */}
                          {[0, 90, 180, 270].map((angle) => (
                            <motion.div
                              key={angle}
                              animate={{
                                opacity: [0.4, 1, 0.4],
                                scale: [1, 1.5, 1],
                                boxShadow: [
                                  "0 0 5px rgba(232, 62, 140, 0.5)",
                                  "0 0 15px rgba(232, 62, 140, 0.9)",
                                  "0 0 5px rgba(232, 62, 140, 0.5)",
                                ],
                              }}
                              transition={{
                                repeat: Infinity,
                                duration: 1.5,
                                delay: angle / 360,
                              }}
                              className="absolute w-1.5 h-1.5 bg-[#e83e8c] rounded-full z-[35]"
                              style={{
                                top: "50%",
                                left: "50%",
                                marginTop: "-3px",
                                marginLeft: "-3px",
                                transform: `rotate(${angle}deg) translate(28px, 0)`,
                              }}
                            />
                          ))}

                          <button
                            onClick={toggleLiveAudio}
                            className="relative overflow-hidden flex items-center justify-center w-full h-full bg-black text-white rounded-full hover:bg-black/90 transition-all transform active:scale-95 shadow-[0_0_25px_rgba(232,62,140,0.4)] border border-[#e83e8c]/60 z-30"
                            title={t.startVoiceChat}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#e83e8c]/30 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />

                            {/* Pulse Animations */}
                            <span
                              className="absolute inset-0 w-full h-full bg-[#e83e8c]/30 rounded-full animate-ping"
                              style={{ animationDuration: "3s" }}
                            ></span>
                            <span
                              className="absolute inset-0 w-full h-full bg-[#e83e8c]/15 rounded-full animate-ping"
                              style={{
                                animationDuration: "3s",
                                animationDelay: "1.5s",
                              }}
                            ></span>

                            {/* Digital Frame Effect */}
                            <div className="absolute inset-1 border border-[#e83e8c]/30 rounded-full group-hover:scale-110 transition-transform duration-500" />

                            <div className="relative z-10 flex flex-col items-center">
                              <Radio
                                size={22}
                                className="text-[#e83e8c] group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_10px_rgba(232,62,140,0.9)]"
                              />
                            </div>
                          </button>
                        </div>
                      )}
                    {isLoading ? (
                      <button
                        onClick={handleStopGeneration}
                        className="flex items-center justify-center w-11 h-11 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all transform active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-red-400/30"
                        title={t.stopGenerating}
                      >
                        <Square size={18} className="fill-current" />
                      </button>
                    ) : input.trim() || selectedImage ? (
                      <button
                        onClick={() =>
                          handleSend(undefined, false, editMsgId || undefined)
                        }
                        className="relative flex items-center justify-center w-11 h-11 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white rounded-full hover:from-blue-500 hover:to-indigo-400 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] group"
                      >
                        <ArrowUp
                          size={22}
                          strokeWidth={2.5}
                          className="relative z-10 group-hover:-translate-y-1 transition-transform duration-300"
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </footer>

        {/* Save Chat Modal */}
        <AnimatePresence>
          {isSaveModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              >
                <h2 className="text-xl font-bold text-gray-200 mb-4">
                  {t.saveChat}
                </h2>
                <input
                  type="text"
                  value={chatNameInput}
                  onChange={(e) => setChatNameInput(e.target.value)}
                  placeholder={t.enterChatName}
                  className="w-full bg-gray-800 shadow-md border border-gray-700 rounded-xl p-3 text-gray-200 outline-none focus:ring-2 focus:ring-sky-500 mb-6 placeholder-gray-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveChat();
                  }}
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsSaveModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-gray-800 shadow-md hover:bg-gray-700 shadow-md text-gray-400 hover:text-gray-200 transition-colors border border-gray-700"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleSaveChat}
                    disabled={!chatNameInput.trim()}
                    className="px-4 py-2 rounded-xl bg-sky-900/50 hover:bg-sky-800/60 text-sky-300 transition-colors disabled:opacity-50 border border-sky-800"
                  >
                    {t.save}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat History Sidebar */}
        <AnimatePresence>
          {isHistoryOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsHistoryOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-gray-900 border-r border-gray-800 shadow-2xl flex flex-col"
              >
                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900">
                  <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <MessageSquare size={20} className="text-sky-400" />
                    {t.chatHistory}
                  </h2>
                  <button
                    onClick={() => setIsHistoryOpen(false)}
                    className="p-2 hover:bg-gray-800 shadow-md rounded-full transition-colors text-gray-400 hover:text-gray-200"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-4">
                  <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-sky-900/50 hover:bg-sky-800/60 text-sky-300 border border-sky-800 rounded-xl transition-colors font-bold shadow-lg active:scale-95 transition-all"
                  >
                    <MessageSquare size={18} />
                    {t.newChat}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar p-4 pt-0 space-y-2">
                  {savedChats.length === 0 ? (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      {t.noSavedChats}
                    </div>
                  ) : (
                    [...savedChats]
                      .sort((a, b) => {
                        if (a.isPinned && !b.isPinned) return -1;
                        if (!a.isPinned && b.isPinned) return 1;
                        return b.timestamp - a.timestamp;
                      })
                      .map((chat) => (
                        <div
                          key={chat.id}
                          onTouchStart={() => {
                            longPressFiredRef.current = false;
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = setTimeout(() => {
                              longPressFiredRef.current = true;
                              setShowOptionsId(chat.id);
                            }, 500);
                          }}
                          onTouchEnd={() => {
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                          }}
                          onTouchMove={() => {
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                          }}
                          onMouseDown={() => {
                            longPressFiredRef.current = false;
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = setTimeout(() => {
                              longPressFiredRef.current = true;
                              setShowOptionsId(chat.id);
                            }, 500);
                          }}
                          onMouseUp={() => {
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                          }}
                          onMouseLeave={() => {
                            if (longPressTimerRef.current)
                              clearTimeout(longPressTimerRef.current);
                          }}
                          onClick={() => {
                            if (!longPressFiredRef.current) {
                              handleLoadChat(chat);
                              setShowOptionsId(null);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setShowOptionsId(chat.id);
                          }}
                          className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border relative ${
                            currentChatId === chat.id
                              ? "bg-sky-900/30 border-sky-600 text-sky-300"
                              : "bg-gray-800/50 border-gray-700 hover:bg-gray-700/50 text-gray-300 hover:text-white"
                          }`}
                        >
                          {editingChatId === chat.id ? (
                            <div
                              className="flex-1 flex items-center gap-2 min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editingChatName}
                                onChange={(e) =>
                                  setEditingChatName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename();
                                  if (e.key === "Escape") handleCancelRename();
                                }}
                                className="flex-1 min-w-0 bg-gray-800 border-gray-700 border rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-sky-500"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveRename}
                                className="p-1 text-green-400 hover:bg-green-400/20 rounded"
                                title={t.save}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="p-1 text-red-600 hover:bg-red-400/20 rounded"
                                title={t.cancel}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="font-medium truncate block w-full">
                                    {chat.name}
                                  </span>
                                </div>
                                <span className="text-xs opacity-60">
                                  {new Date(
                                    chat.timestamp,
                                  ).toLocaleDateString()}
                                </span>
                              </div>

                              {chat.isPinned && showOptionsId !== chat.id && (
                                <div className="flex items-center justify-center p-1.5 text-sky-600 sm:group-hover:hidden">
                                  <Pin size={14} className="fill-current" />
                                </div>
                              )}

                              <div
                                className={`items-center gap-1 transition-opacity ${showOptionsId === chat.id ? "flex opacity-100" : "hidden sm:flex opacity-0 sm:group-hover:opacity-100"}`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePin(e, chat.id);
                                    setShowOptionsId(null);
                                  }}
                                  className={`p-1.5 rounded-lg transition-colors ${chat.isPinned ? "text-sky-400 hover:bg-sky-900/40" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                                  title={
                                    chat.isPinned ? t.unpinChat : t.pinChat
                                  }
                                >
                                  <Pin
                                    size={14}
                                    className={
                                      chat.isPinned ? "fill-current" : ""
                                    }
                                  />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartRename(e, chat);
                                    setShowOptionsId(null);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-400/10 rounded-lg transition-colors"
                                  title={t.renameChat}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteChat(e, chat.id);
                                    setShowOptionsId(null);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-400/10 rounded-lg transition-colors"
                                  title={t.deleteChat}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Final Offer Popup */}
      <AnimatePresence>
        {showFinalOfferPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-600/20 via-black/80 to-black pointer-events-none" />

            <motion.div
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-gray-900/90 border border-gray-700/50 rounded-[40px] rounded-tl-[88px] overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.25)] backdrop-blur-2xl"
            >
              {/* Glowing Top Left Edge */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/20 rounded-full blur-[40px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

              <div className="p-8 sm:p-10 relative z-10 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-gray-800 border-2 border-gray-700 rounded-full flex items-center justify-center mb-6 shadow-inner relative">
                  <div
                    className="absolute inset-0 bg-red-500/10 rounded-full animate-ping"
                    style={{ animationDuration: "3s" }}
                  />
                  <HeartHandshake size={36} className="text-red-400" />
                </div>

                <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 font-mukta">
                  {uiLang === "hi" ? "ट्रायल समाप्त!" : "Trial Ended!"}
                </h2>

                <p className="text-gray-300 text-base sm:text-lg mb-6 leading-relaxed">
                  {uiLang === "hi"
                    ? "आपके साथ मेरा ट्रायल खत्म हुआ, क्या हम अपनी दोस्ती जारी रख सकते हैं?"
                    : "My trial with you has ended, can we continue our friendship?"}
                </p>

                <div className="w-full bg-black/50 border border-gray-800 rounded-2xl p-4 mb-6 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-gray-400 text-sm font-medium">
                    {uiLang === "hi" ? "मैंने आपके" : "I securely tracked your"}
                  </p>
                  <p className="text-2xl font-black text-white mt-1">
                    {mockPaymentCount}{" "}
                    {uiLang === "hi"
                      ? "पेमेंट्स को सुरक्षित ट्रैक किया।"
                      : "payments during this time."}
                  </p>
                </div>

                <div className="w-full bg-red-950/30 border border-red-500/30 rounded-2xl p-3 mb-8 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.1)]">
                  <p className="text-red-300 font-bold text-sm">
                    {uiLang === "hi"
                      ? "🔥 अगले 1 घंटे में सब्सक्राइब करने पर ₹500 की सीधी छूट!"
                      : "🔥 Flat ₹500 discount if you subscribe in the next 1 hour!"}
                  </p>
                </div>

                <div className="flex flex-col w-full gap-3">
                  <button
                    onClick={() => {
                      setShowFinalOfferPopup(false);
                      setIsFinalOfferSeen(true);
                      try {
                        const saved = safeStorage.getItem("nard_global_config");
                        let planPrice = 4999;
                        let upiId = "nard@masterupi";
                        let bi = "Nard Inc";
                        if (saved) {
                          const parsed = JSON.parse(saved);
                          if (trialPlan === "basic") planPrice = parsed.pricingBasic || 999;
                          if (trialPlan === "pro") planPrice = parsed.pricingPro || 2499;
                          if (trialPlan === "ultra") planPrice = parsed.pricingUltra || 4999;
                          upiId = parsed.paymentUpi || "nard@masterupi";
                          bi = parsed.businessName || "Nard Inc";
                        } else {
                          if (trialPlan === "basic") planPrice = 999;
                          if (trialPlan === "pro") planPrice = 2499;
                          if (trialPlan === "ultra") planPrice = 4999;
                        }
                        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(bi)}&am=${planPrice}`;
                        setPaymentUrl(upiUrl);
                        setSubscriptionStatus("pending_payment");
                        const a = document.createElement("a");
                        a.href = upiUrl;
                        a.click();
                      } catch (e) {}
                      try {
                        safeStorage.setItem("nard_final_offer_seen", "true");
                      } catch (e) {}
                    }}
                    className="w-full py-4 rounded-full bg-green-500 hover:bg-green-400 text-black font-black text-lg transition-colors shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:shadow-[0_0_40px_rgba(34,197,94,0.6)] transform hover:scale-[1.02] active:scale-95"
                  >
                    {uiLang === "hi"
                      ? "प्रीमियम सेवा जारी रखें"
                      : "Continue Premium Service"}
                  </button>

                  <button
                    onClick={() => {
                      setShowFinalOfferPopup(false);
                      setIsFinalOfferSeen(true);
                      try {
                        safeStorage.setItem("nard_final_offer_seen", "true");
                      } catch (e) {}
                    }}
                    className="w-full py-3 rounded-full text-gray-500 hover:text-white font-bold text-sm transition-colors hover:bg-gray-800/50"
                  >
                    {uiLang === "hi" ? "बाद में" : "Later"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal Placeholder */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col"
            >
              {/* Header */}
              <div className="bg-gray-800/50 border-b border-gray-800 p-6 pb-4">
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 text-emerald-400">
                    <UserCircle2 size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {uiLang === "hi" ? "लॉगिन करें" : "Welcome Back"}
                  </h3>
                </div>
                <p className="text-sm text-gray-400 text-center">
                  {uiLang === "hi" 
                    ? "फ्री ट्रायल शुरू करने के लिए अपना अकाउंट वेरीफाई करें"
                    : "Verify your account to start the free trial"}
                </p>
              </div>

              {/* Body */}
              <div className="p-6 flex-1 flex flex-col items-center">
                {error && (
                  <div className="w-full mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-start gap-2">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <AnimatePresence mode="wait">
                  {authStep === "method" && (
                    <motion.div
                      key="step-method"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="w-full flex flex-col gap-4"
                    >
                      <button
                        onClick={() => setAuthStep("phone")}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-all border border-gray-700"
                      >
                        <Phone size={20} className="text-emerald-400" />
                        {uiLang === "hi" ? "मोबाइल नंबर से लॉगिन करें" : "Continue with Mobile"}
                      </button>

                      <div className="flex items-center my-2 gap-4">
                        <div className="flex-1 h-px bg-gray-800"></div>
                        <span className="text-xs text-gray-500 uppercase font-black tracking-widest">
                          {uiLang === "hi" ? "या" : "OR"}
                        </span>
                        <div className="flex-1 h-px bg-gray-800"></div>
                      </div>

                      <button
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-black font-medium transition-all"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fillRule="evenodd"
                            clipRule="evenodd"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                        {uiLang === "hi" ? "गूगल के साथ जारी रखें" : "Continue with Google"}
                      </button>

                      <button
                        onClick={handleFacebookLogin}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium transition-all"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        {uiLang === "hi" ? "फेसबुक के साथ जारी रखें" : "Continue with Facebook"}
                      </button>
                    </motion.div>
                  )}

                  {authStep === "phone" && (
                    <motion.div
                      key="step-phone"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="w-full flex flex-col gap-4"
                    >
                      <label className="text-sm text-gray-400">
                        {uiLang === "hi" ? "अपना मोबाइल नंबर दर्ज करें" : "Enter your mobile number"}
                      </label>
                      <div className="flex bg-gray-800 rounded-xl overflow-hidden border border-gray-700 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
                         <span className="pl-4 pr-3 py-3 text-gray-400 bg-gray-800/50 flex items-center border-r border-gray-700">
                           +91
                         </span>
                        <input
                          type="tel"
                          value={authPhone}
                          onChange={(e) => setAuthPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="flex-1 bg-transparent px-4 py-3 text-white outline-none font-bold tracking-widest placeholder-gray-600"
                          placeholder="00000 00000"
                          autoFocus
                        />
                      </div>
                      
                      <button
                        disabled={authPhone.length < 10}
                        onClick={sendOtp}
                        className={`w-full py-3 rounded-xl font-bold transition-all ${
                          authPhone.length >= 10 
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" 
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                        {isAuthenticating ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 size={18} className="animate-spin" />
                            {uiLang === "hi" ? "OTP भेज रहा है..." : "Sending OTP..."}
                          </div>
                        ) : (
                          uiLang === "hi" ? "OTP प्राप्त करें" : "Get OTP"
                        )}
                      </button>

                      <button
                        onClick={() => setAuthStep("method")}
                        className="text-sm text-gray-500 hover:text-white mt-2"
                      >
                        {uiLang === "hi" ? "वापस जाएँ" : "Go Back"}
                      </button>
                    </motion.div>
                  )}

                  {authStep === "otp" && (
                    <motion.div
                      key="step-otp"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="w-full flex flex-col items-center gap-6"
                    >
                      <div className="text-center">
                        <p className="text-sm text-gray-400 mb-1">
                          {uiLang === "hi" ? "हमने इस नंबर पर 6-अंकीय कोड भेजा है:" : "We've sent a 6-digit code to:"}
                        </p>
                        <p className="text-white font-bold tracking-widest">+91 {authPhone}</p>
                      </div>

                      <div className="flex gap-2 justify-center w-full">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <input
                            key={index}
                            id={`otp-${index}`}
                            type="text"
                            maxLength={1}
                            value={authOtp[index] || ""}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              const newOtp = [...authOtp];
                              newOtp[index] = val;
                              setAuthOtp(newOtp);
                              if (val && index < 5) {
                                document.getElementById(`otp-${index + 1}`)?.focus();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !authOtp[index] && index > 0) {
                                document.getElementById(`otp-${index - 1}`)?.focus();
                              }
                            }}
                            className="w-10 h-12 text-center text-xl font-bold bg-gray-800 border border-gray-700 text-white rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all sm:w-12 sm:h-14 sm:text-2xl"
                            autoFocus={index === 0}
                          />
                        ))}
                      </div>

                      <button
                        disabled={authOtp.join("").length < 6 || isAuthenticating}
                        onClick={handleAuthComplete}
                        className={`w-full py-3 rounded-xl font-bold transition-all ${
                          authOtp.join("").length === 6 
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" 
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                         {isAuthenticating ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 size={18} className="animate-spin" />
                            {uiLang === "hi" ? "लॉगिन कर रहा है..." : "Verifying..."}
                          </div>
                        ) : (
                          uiLang === "hi" ? "वेरीफाई और लॉगिन" : "Verify & Login"
                        )}
                      </button>
                      
                      <div className="flex justify-between w-full text-sm">
                        <button
                          onClick={() => setAuthStep("phone")}
                          className="text-gray-500 hover:text-white"
                        >
                          {uiLang === "hi" ? "नंबर बदलें" : "Change Number"}
                        </button>
                        <button onClick={sendOtp} disabled={isAuthenticating} className="text-emerald-500 hover:text-emerald-400 disabled:text-gray-600">
                          {uiLang === "hi" ? "OTP दोबारा भेजें" : "Resend OTP"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dual Path Setup Modal */}
      <AnimatePresence>
        {showPathModal && (
          <motion.div
            id="path-modal-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-start justify-center p-4 sm:p-8 bg-black/90 backdrop-blur-2xl overflow-y-auto hide-scrollbar"
          >
            <button
              onClick={() =>
                selectedPath ? setSelectedPath(null) : setShowPathModal(false)
              }
              className="absolute top-6 right-6 p-3 rounded-full bg-gray-800/80 hover:bg-gray-700 hover:scale-105 border border-gray-600 text-white shadow-xl transition-all z-50"
            >
              <X size={24} />
            </button>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-full max-w-5xl my-auto flex flex-col pt-12"
            >
              {!selectedPath ? (
                <>
                  <div className="text-center mb-12">
                    <h2 className="text-4xl md:text-5xl font-black text-white font-mukta drop-shadow-lg mb-4">
                      {uiLang === "hi"
                        ? "अपना रास्ता चुनें"
                        : "Choose Your Path"}
                    </h2>
                    <p className="text-xl text-gray-300 font-medium max-w-2xl mx-auto">
                      {uiLang === "hi"
                        ? "क्लिक करें कि आप नार्ड को कैसे डिप्लॉय करना चाहते हैं। अपनी साइट पर एक फ्लोटिंग चैटबॉट या हमारे प्लेटफार्म पर।"
                        : "Select how you want to deploy Nard. Embed it natively in your existing platform, or use it as a standalone powerful link."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
                    {/* Path 1: Widget */}
                    <div
                      onClick={() => setSelectedPath("widget")}
                      className={`relative flex flex-col bg-gray-900/60 border border-gray-700/50 rounded-[88px] rounded-b-[40px] p-8 md:p-10 cursor-pointer overflow-hidden group hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)] transition-all duration-300 transform md:hover:-translate-y-2 text-center h-[26rem] justify-center items-center`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="w-24 h-24 rounded-full bg-blue-900/40 border border-blue-500/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600/30 transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                        <Globe
                          size={48}
                          className="text-blue-400 group-hover:text-white transition-colors"
                        />
                      </div>

                      <h3 className="text-3xl font-black text-white mb-3 tracking-wide">
                        {uiLang === "hi"
                          ? "फ्लोटिंग आइकॉन इंटीग्रेशन"
                          : "Floating Icon Integration"}
                      </h3>
                      <p className="text-gray-400 font-medium text-lg px-2">
                        {uiLang === "hi"
                          ? "अपनी मौजूदा वेबसाइट या ऐप के लिए एक एम्बेडेड फ्लोटिंग चैटबॉट।"
                          : "Integrate Nard seamlessly into your existing site with our simple JavaScript widget."}
                      </p>

                      <div className="mt-8 flex items-center gap-2 text-blue-400 font-bold group-hover:gap-4 transition-all">
                        {uiLang === "hi" ? "विकल्प चुनें" : "Select Option"}{" "}
                        <ArrowLeft size={20} className="rotate-180" />
                      </div>
                    </div>

                    {/* Path 2: Platform */}
                    <div
                      onClick={() => setSelectedPath("platform")}
                      className={`relative flex flex-col bg-gray-900/60 border border-gray-700/50 rounded-[88px] rounded-b-[40px] p-8 md:p-10 cursor-pointer overflow-hidden group hover:border-pink-500/50 hover:shadow-[0_0_40px_rgba(236,72,153,0.3)] transition-all duration-300 transform md:hover:-translate-y-2 text-center h-[26rem] justify-center items-center`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-pink-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="w-24 h-24 rounded-full bg-pink-900/40 border border-pink-500/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-pink-600/30 transition-all shadow-[0_0_20px_rgba(236,72,153,0.2)]">
                        <Sparkles
                          size={48}
                          className="text-pink-400 group-hover:text-white transition-colors"
                        />
                      </div>

                      <h3 className="text-3xl font-black text-white mb-3 tracking-wide">
                        {uiLang === "hi"
                          ? "नार्ड होस्टेड प्लेटफॉर्म"
                          : "Powered by Nard"}
                      </h3>
                      <p className="text-gray-400 font-medium text-lg px-2">
                        {uiLang === "hi"
                          ? "यदि आपकी अपनी साइट नहीं है, तो हमारे रेडी-टू-यूज़ कस्टम यूआरएल प्लेटफॉर्म का उपयोग करें।"
                          : "No website? No problem. Get a dedicated Nard platform link built specifically for your brand."}
                      </p>

                      <div className="mt-8 flex items-center gap-2 text-pink-400 font-bold group-hover:gap-4 transition-all">
                        {uiLang === "hi" ? "विकल्प चुनें" : "Select Option"}{" "}
                        <ArrowLeft size={20} className="rotate-180" />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col w-full text-center">
                  <div className="flex flex-col sm:flex-row items-center justify-between mb-8 w-full">
                    <button
                      onClick={() => setSelectedPath(null)}
                      className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-lg font-bold"
                    >
                      <ArrowLeft size={22} /> Back to Options
                    </button>

                    <h2 className="text-3xl font-black text-white mt-4 sm:mt-0 drop-shadow-sm">
                      {selectedPath === "widget"
                        ? "Widget Integration Details"
                        : "Hosted Platform Details"}
                    </h2>

                    {/* Placeholder div for right centering balance */}
                    <div className="hidden sm:block w-32"></div>
                  </div>

                  {selectedPath === "widget" && (
                    <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 mb-12 shadow-inner text-left overflow-x-auto relative group">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sky-400 font-mono text-sm font-bold uppercase tracking-wider">
                          Embed Code
                        </span>
                        <div className="bg-sky-500/20 text-sky-300 text-xs px-3 py-1 rounded-full border border-sky-500/30">
                          Paste into &lt;body&gt;
                        </div>
                      </div>
                      <pre className="text-gray-300 font-mono text-sm p-4 bg-black/50 rounded-xl overflow-x-auto border border-gray-800">
                        <code>{`<script src="https://nard.ai/widget.js" data-id="YOUR_ID"></script>`}</code>
                      </pre>

                      <div className="mt-4 text-gray-400 text-sm flex gap-3">
                        <Info
                          size={16}
                          className="text-sky-400 shrink-0 mt-0.5"
                        />
                        <p>
                          Simply paste this snippet right before the closing
                          &lt;/body&gt; tag of your website. It'll automatically
                          load a beautiful floating Nard icon customized to your
                          brand color.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedPath === "platform" && (
                    <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 mb-12 shadow-inner group flex flex-col md:flex-row items-center justify-between text-left gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-pink-400 font-mono text-sm font-bold uppercase tracking-wider">
                            Custom Profile Link
                          </span>
                          <div className="bg-pink-500/20 text-pink-300 text-xs px-3 py-1 rounded-full border border-pink-500/30">
                            Instantly Live
                          </div>
                        </div>
                        <h4 className="text-white text-xl font-bold mb-2">
                          Build your brand identity directly on Nard.
                        </h4>
                        <p className="text-gray-400 text-sm leading-relaxed">
                          Skip the server setup. We host your agent securely and
                          provide deep analytics, customizable hero domains
                          (like nard.ai/YourBrand), and one-click sharing across
                          platforms.
                        </p>
                      </div>

                      <div className="bg-black/60 p-4 rounded-xl border border-gray-800 w-full md:w-auto shadow-sm">
                        <p className="text-gray-300 font-mono font-medium text-lg whitespace-nowrap overflow-hidden text-ellipsis flex items-center">
                          https://
                          <span className="text-pink-400 mx-1">nard.ai</span>/
                          <span className="text-yellow-400">your-brand</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedPath && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 mt-4 pt-12 border-t border-gray-800/30">
                    {/* Basic Plan */}
                    <div className="flex flex-col bg-gray-900/40 border border-gray-700/50 rounded-[40px] p-6 hover:bg-gray-800/60 transition-all text-left">
                      <h4 className="text-2xl font-black text-white mb-2">
                        {uiLang === "hi" ? "लोक मित्र (Basic)" : "Basic"}
                      </h4>
                      <div className="text-4xl font-black text-gray-300 mb-6 drop-shadow-sm">
                        $29
                        <span className="text-lg text-gray-500 font-bold">
                          /mo
                        </span>
                      </div>

                      <ul className="space-y-3 mb-8 flex-1">
                        {[
                          uiLang === "hi"
                            ? "मानक AI वॉयस"
                            : "Standard Voice Models",
                          uiLang === "hi"
                            ? "5,000 रिस्पॉन्स / माह"
                            : "5,000 requests / mo",
                          uiLang === "hi"
                            ? "बेसिक एनालिटिक्स"
                            : "Basic Analytics Dashboard",
                          uiLang === "hi"
                            ? "चैट और वॉयस सपोर्ट"
                            : "Chat & Voice Support",
                        ].map((feature, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-3 text-gray-300 font-medium"
                          >
                            <Check
                              size={18}
                              className="text-green-400 shrink-0"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => handleSelectPlan("basic", false)}
                          className="w-full py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg transition-colors border border-gray-600 shadow-sm"
                        >
                          {uiLang === "hi" ? "बेसिक चुनें" : "Start Basic"}
                        </button>
                        {!isTrialActive && subscriptionStatus !== "active" && (
                          <button
                            onClick={() => handleSelectPlan("basic", true)}
                            className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl border border-emerald-500/50 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center gap-2"
                          >
                            <Zap size={18} />
                            {uiLang === "hi"
                              ? "फ्री ट्रायल शुरू करें"
                              : "Start Free Trial"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pro Plan */}
                    <div className="relative flex flex-col bg-gradient-to-b from-[#1e293b] to-[#0f172a] border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] rounded-[40px] p-6 transform md:-translate-y-4 text-left">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-yellow-600 to-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg whitespace-nowrap">
                        Most Popular
                      </div>

                      <h4 className="text-2xl font-black text-white mb-2 mt-2">
                        {uiLang === "hi" ? "बिजनेस मैनेजर (Pro)" : "Pro"}
                      </h4>
                      <div className="text-4xl font-black text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                        $79
                        <span className="text-lg text-gray-400 font-bold">
                          /mo
                        </span>
                      </div>

                      <div className="mb-6 flex gap-2 flex-wrap">
                        <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]">
                          Automatic Lead Generation
                        </span>
                        <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 text-green-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">
                          WhatsApp Alerts
                        </span>
                      </div>

                      <ul className="space-y-3 mb-8 flex-1">
                        {[
                          uiLang === "hi"
                            ? "प्रीमियम AI वॉयस"
                            : "Premium Voice Models",
                          uiLang === "hi"
                            ? "अनलिमिटेड रिस्पॉन्स"
                            : "Unlimited requests",
                          uiLang === "hi"
                            ? "एडवांस्ड एनालिटिक्स"
                            : "Advanced Analytics & Insights",
                          uiLang === "hi" ? "लीड कैप्चर" : "Lead Capture",
                        ].map((feature, i) => (
                          <li
                            key={i}
                            className="flex flex-start gap-3 text-gray-200 font-medium"
                          >
                            <Check
                              size={18}
                              className="text-yellow-400 shrink-0 mt-0.5"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => handleSelectPlan("pro", false)}
                          className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-600 to-amber-500 shadow-lg shadow-yellow-500/20 hover:scale-[1.02] active:scale-95 text-white font-bold text-lg transition-all drop-shadow-md"
                        >
                          {uiLang === "hi"
                            ? "प्रो सब्सक्राइब करें"
                            : "Subscribe Pro"}
                        </button>
                        {!isTrialActive && subscriptionStatus !== "active" && (
                          <button
                            onClick={() => handleSelectPlan("pro", true)}
                            className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl border border-emerald-500/50 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center gap-2"
                          >
                            <Zap size={18} />
                            {uiLang === "hi"
                              ? "फ्री ट्रायल शुरू करें"
                              : "Start Free Trial"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ultra Plan */}
                    <div className="flex flex-col bg-gray-900/40 border border-gray-700/50 rounded-[40px] p-6 hover:bg-gray-800/60 transition-all text-left">
                      <h4 className="text-2xl font-black text-white mb-2">
                        {uiLang === "hi" ? "कॉमर्स एक्सपर्ट (Ultra)" : "Ultra"}
                      </h4>
                      <div className="text-4xl font-black text-sky-300 mb-6 drop-shadow-sm">
                        $199
                        <span className="text-lg text-gray-500 font-bold">
                          /mo
                        </span>
                      </div>

                      <div className="mb-6 flex gap-2 flex-wrap">
                        <span className="px-3 py-1 bg-sky-500/20 border border-sky-500/50 text-sky-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(56,189,248,0.8)]">
                          Direct Bank Payment
                        </span>
                        <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/50 text-purple-300 text-xs font-bold rounded-full drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">
                          Custom Avatars
                        </span>
                      </div>

                      <ul className="space-y-3 mb-8 flex-1">
                        {[
                          uiLang === "hi"
                            ? "प्रो के सभी फीचर्स"
                            : "Everything in Pro",
                          uiLang === "hi"
                            ? "ऑर्डर प्रोसेसिंग"
                            : "Order Processing",
                          uiLang === "hi"
                            ? "पेमेंट वेरिफिकेशन (UPI)"
                            : "Payment Verification (UPI)",
                          uiLang === "hi"
                            ? "डेडिकेटेड सपोर्ट"
                            : "Dedicated Support",
                        ].map((feature, i) => (
                          <li
                            key={i}
                            className="flex flex-start gap-3 text-gray-300 font-medium"
                          >
                            <Check
                              size={18}
                              className="text-sky-400 shrink-0 mt-0.5"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => handleSelectPlan("ultra", false)}
                          className="w-full py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-sky-400 font-bold text-lg transition-colors border border-gray-600 shadow-sm hover:text-white"
                        >
                          {uiLang === "hi" ? "अल्ट्रा पर जाएं" : "Go Ultra"}
                        </button>
                        {!isTrialActive && subscriptionStatus !== "active" && (
                          <button
                            onClick={() => handleSelectPlan("ultra", true)}
                            className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl border border-emerald-500/50 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center gap-2"
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

                  {/* Comparison Table */}
                  <div className="w-full bg-gray-900 border border-gray-700/50 rounded-3xl p-6 md:p-8 shadow-inner overflow-hidden">
                    <h3 className="text-2xl font-black text-white mb-6 text-left">
                      {uiLang === "hi" ? "प्लान तुलना" : "Feature Comparison"}
                    </h3>
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="p-4 text-gray-400 font-medium">
                              {uiLang === "hi" ? "फीचर" : "Feature"}
                            </th>
                            <th className="p-4 text-white font-bold text-center">
                              {uiLang === "hi" ? "बेसिक" : "Basic"}
                            </th>
                            <th className="p-4 text-yellow-400 font-bold text-center">
                              {uiLang === "hi" ? "प्रो" : "Pro"}
                            </th>
                            <th className="p-4 text-sky-400 font-bold text-center">
                              {uiLang === "hi" ? "अल्ट्रा" : "Ultra"}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "लाइव वॉयस चैट"
                                : "Live Voice Chat"}
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-green-400 mx-auto"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-yellow-400 mx-auto"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "कस्टम इंस्ट्रक्शन्स"
                                : "Custom Instructions"}
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-yellow-400 mx-auto"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "ऑटोमैटिक लीड जनरेशन"
                                : "Automatic Lead Gen"}
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-yellow-400 mx-auto"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "व्हाट्सएप अलर्ट्स"
                                : "WhatsApp Alerts"}
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-yellow-400 mx-auto"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "डायरेक्ट बैंक पेमेंट"
                                : "Direct Bank Payment"}
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 font-medium">
                              {uiLang === "hi"
                                ? "ऑर्डर मैनेजमेंट व रसीद"
                                : "Order Mgt & Receipts"}
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <X size={20} className="text-gray-600 mx-auto" />
                            </td>
                            <td className="p-4 text-center">
                              <Check
                                size={20}
                                className="text-sky-400 mx-auto"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Removed SMS Modal and Widget */}

      <AppTour
        isOpen={showTour}
        onRequestClose={handleTourComplete}
        uiLang={uiLang}
        steps={[
          {
            target: "#tour-identity",
            title: uiLang === "hi" ? "नार्ड से मिलें" : "Meet Nard",
            content:
              uiLang === "hi"
                ? "यह आपका एआई कैशियर है। इसका नाम आप अपनी पसंद का रख सकते हैं।"
                : "This is your AI Cashier. Give your AI assistant your preferred name here.",
          },
          {
            target: "#tour-sync-widget",
            title: uiLang === "hi" ? "लाइव एसएमएस सिंक" : "Live SMS Sync",
            content:
              uiLang === "hi"
                ? "नार्ड बैंक एसएमएस को पढ़कर सीधे पेमेंट्स को कन्फर्म करता है।"
                : "Nard reads bank SMS directly to confirm payments.",
          },
          {
            target: "#tour-settings",
            title:
              uiLang === "hi" ? "स्मार्ट वॉइस अलर्ट्स" : "Smart Voice Alerts",
            content:
              uiLang === "hi"
                ? "यहाँ से पेमेंट पर रियल-टाइम हिंदी वॉयस अलर्ट्स चालू करें (प्रीमियम प्लान में उपलब्ध)।"
                : "Turn on real-time Voice Alerts from here (Available in Premium Plans).",
          },
        ]}
      />
      <div id="recaptcha-container"></div>
    </div>
  );
}
