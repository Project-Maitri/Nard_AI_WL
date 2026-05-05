import { GoogleGenAI, Modality } from "@google/genai";

async function test() {
  const tokenRes = await fetch("http://localhost:3000/api/gemini-token");
  if (!tokenRes.ok) {
    console.error("Failed to get token", tokenRes.status);
    return;
  }
  const tokenData = await tokenRes.json();
  const ai = new GoogleGenAI({ apiKey: tokenData.token });

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
            outputAudioTranscription: {},
            inputAudioTranscription: {},
        },
        callbacks: {
            onopen: () => {
                console.log("Connected");
            },
            onmessage: (msg) => {
                console.log("Message", msg);
            },
            onerror: (err) => {
                console.error("====== Error connecting ======");
                console.dir(err, { depth: null });
            },
            onclose: (e) => {
                console.log("Closed", e);
            }
        }
    });

    sessionPromise.then(() => console.log("Promise resolved")).catch(e => console.error("Promise error", e));

    await new Promise(r => setTimeout(r, 6000));
  } catch (e) {
    console.error("Caught error:", e);
  }
}

test();
