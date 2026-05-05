import { GoogleGenAI, Modality } from "@google/genai";

async function test() {
  const ai = new GoogleGenAI({ apiKey: "invalid_key_xxxxx" });

  let done = false;
  setTimeout(() => {
    if (!done) { console.log("Timeout."); process.exit(0); }
  }, 4000);

  try {
    const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Zephyr" },
                },
            },
        },
        callbacks: {
            onopen: () => {
                console.log("Connected");
                done = true;
                process.exit(0);
            },
            onmessage: (msg) => {            },
            onerror: (err) => {
                console.error("====== Error connecting ======");
                console.error(err);
                done = true;
                process.exit(1);
            },
            onclose: (e) => {
                console.log("Closed", e);
                done = true;
                process.exit(0);
            }
        }
    });
  } catch (e) {
    console.error("Caught error:", e);
    process.exit(1);
  }
}

test();
