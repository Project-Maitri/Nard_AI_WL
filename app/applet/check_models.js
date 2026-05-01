import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI();
async function run() {
  try {
    for await (const m of ai.models.list()) {
      if (m.name.includes("flash-lite")) console.log(m.name);
    }
  } catch (e) {
    console.error(e);
  }
}
run();
