import { GoogleGenAI, Modality } from "@google/genai";

async function test() {
  const tokenRes = await fetch("http://localhost:3000/api/gemini-token");
  if (!tokenRes.ok) {
    console.log("no token res okay");
    process.exit(1);
  }
  const tokenData = await tokenRes.json();
  const ai = new GoogleGenAI({ apiKey: tokenData.token });

  let done = false;
  setTimeout(() => {
    if (!done) { console.log("Timeout."); process.exit(0); }
  }, 4000);

  try {
    const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "Hello" as any,
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
                console.dir(err, { depth: null });
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
