import { GoogleGenAI, Type } from "@google/genai";

export const config = {
    runtime: 'edge',
};

const apiKey = process.env.GEMINI_API_KEY;

export default async function handler(request: Request) {
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { description } = await request.json();

        if (!description) {
            return new Response(JSON.stringify({ error: "Description is required" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Analyze the following teacher's schedule description and extract structured data.
      
      Description: "${description}"
      
      Extract:
      1. Cycle length (number of days)
      2. Periods per day
      3. Period timings (start and end times)
      4. Room numbers mentioned
      5. List of unique class names or subjects mentioned (e.g. "Math 10", "Physics 11", "Homeroom")
      
      If information is missing, use reasonable defaults (e.g., 6 cycle days, 8 periods).`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        cycleDays: { type: Type.NUMBER },
                        periodsPerDay: { type: Type.NUMBER },
                        rooms: { type: Type.ARRAY, items: { type: Type.STRING } },
                        classList: { type: Type.ARRAY, items: { type: Type.STRING } },
                        periods: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    startTime: { type: Type.STRING, description: "HH:mm format" },
                                    endTime: { type: Type.STRING, description: "HH:mm format" }
                                },
                                required: ["name", "startTime", "endTime"]
                            }
                        }
                    },
                    required: ["cycleDays", "periodsPerDay", "rooms", "classList", "periods"]
                }
            }
        });

        const jsonStr = response.text?.trim() || "{}";
        const data = JSON.parse(jsonStr);

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("API Error:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
