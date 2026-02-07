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

        const prompt = `Analyze the following teacher's schedule description and extract structured data.
      
      Description: "${description}"
      
      Extract:
      1. Cycle length (number of days)
      2. Periods per day
      3. Period timings (start and end times)
      4. Room numbers mentioned
      5. List of unique class names or subjects mentioned (e.g. "Math 10", "Physics 11", "Homeroom")
      
      If information is missing, use reasonable defaults (e.g., 6 cycle days, 8 periods).`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    response_mime_type: "application/json",
                    response_schema: {
                        type: "OBJECT",
                        properties: {
                            cycleDays: { type: "NUMBER" },
                            periodsPerDay: { type: "NUMBER" },
                            rooms: { type: "ARRAY", items: { type: "STRING" } },
                            classList: { type: "ARRAY", items: { type: "STRING" } },
                            periods: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        name: { type: "STRING" },
                                        startTime: { type: "STRING", description: "HH:mm format" },
                                        endTime: { type: "STRING", description: "HH:mm format" }
                                    },
                                    required: ["name", "startTime", "endTime"]
                                }
                            }
                        },
                        required: ["cycleDays", "periodsPerDay", "rooms", "classList", "periods"]
                    }
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        // Gemini REST API returns { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
        let jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?\n/, '').replace(/```$/, '').trim();
        }

        let parsedData;
        try {
            parsedData = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Raw Response:", jsonStr);
            return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: jsonStr }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(parsedData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("API Error - Stack:", error.stack);
        console.error("API Error - Message:", error.message);
        console.error("API Error - Full:", JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return new Response(JSON.stringify({
            error: error.message || "Internal Server Error",
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
