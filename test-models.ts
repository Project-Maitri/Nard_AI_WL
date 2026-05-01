import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const models = await ai.models.list();
    let has31 = false;
    for await (const model of models) {
      if (model.name.includes("live")) console.log(model.name);
    }
  } catch (e) {
    console.error(e);
  }
}
test();
