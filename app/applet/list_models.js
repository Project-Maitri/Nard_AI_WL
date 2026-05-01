import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI();
async function run() {
  try {
    for await (const m of ai.models.list()) {
      console.log(m.name, m.supportedGenerationMethods);
    }
  } catch (e) {
    console.error(e);
  }
}
run();
