import { GoogleGenAI, Type } from "@google/genai";



export const config = {
    maxDuration: 60,
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
            model: 'gemini-1.5-flash',
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

        let jsonStr = response.text?.trim() || "{}";

        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?\n/, '').replace(/```$/, '').trim();
        }

        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Raw Response:", jsonStr);
            return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: jsonStr }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });



    } catch (error: any) {
        console.error("API Error - Stack:", error.stack);
        console.error("API Error - Message:", error.message);
        console.error("API Error - Full:", JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return new Response(JSON.stringify({
            error: "Internal Server Error",
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
