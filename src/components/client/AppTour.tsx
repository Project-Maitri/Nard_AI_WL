import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, Check } from "lucide-react";

interface Step {
  target: string;
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface AppTourProps {
  steps: Step[];
  isOpen: boolean;
  onRequestClose: () => void;
  uiLang: string;
}

export const AppTour: React.FC<AppTourProps> = ({
  steps,
  isOpen,
  onRequestClose,
  uiLang,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const calculatePosition = useCallback(() => {
    if (!isOpen || currentStep >= steps.length) return;

    const step = steps[currentStep];
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [currentStep, isOpen, steps]);

  useEffect(() => {
    calculatePosition();
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);

    return () => {
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
    };
  }, [calculatePosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    // Play voice message in Hindi
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(
        "नमस्ते! मैं आपका नया डिजिटल साथी हूँ, चलिए साथ मिलकर आपके व्यापार को आगे बढ़ाते हैं।",
      );
      msg.lang = "hi-IN";
      msg.rate = 0.9;
      window.speechSynthesis.speak(msg);
    }
    onRequestClose();
  };

  if (!isOpen) return null;

  const tooltipX = targetRect
    ? targetRect.left + targetRect.width / 2
    : window.innerWidth / 2;
  const tooltipY = targetRect ? targetRect.bottom + 20 : window.innerHeight / 2;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10005] pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 pointer-events-auto"
          onClick={handleNext}
        />

        {/* Highlight target element if possible by using a box-shadow approach or clipping, 
            but for simplicity we just render the tooltip. */}
        {targetRect && (
          <motion.div
            initial={false}
            animate={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
            }}
            className="absolute border-2 border-teal-400 rounded-2xl z-[10006] pointer-events-none shadow-[0_0_20px_rgba(45,212,191,0.5)]"
          />
        )}

        {/* Tooltip */}
        <div className="absolute inset-0 flex items-center justify-center z-[10007] pointer-events-none">
          <motion.div
            key={`step-${currentStep}`}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.4 }}
            style={{
              borderRadius: "32px 16px 32px 16px",
            }}
            className="bg-gray-900/95 border border-teal-500/30 backdrop-blur-xl p-6 w-[calc(100vw-32px)] sm:w-[320px] max-w-[320px] pointer-events-auto flex flex-col gap-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">
                {steps[currentStep].title}
              </h3>
              <span className="text-xs font-mono text-teal-400 bg-teal-950/50 px-2 py-1 rounded-full">
                {currentStep + 1} / {steps.length}
              </span>
            </div>

            <p className="text-gray-300 text-sm leading-relaxed">
              {steps[currentStep].content}
            </p>

            <div className="flex justify-end mt-2">
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-full transition-all flex items-center gap-2 active:scale-95 shadow-[0_0_15px_rgba(13,148,136,0.5)]"
              >
                {currentStep < steps.length - 1 ? (
                  <>
                    Next <ChevronRight size={16} />
                  </>
                ) : (
                  <>
                    Get Started <Check size={16} />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};
