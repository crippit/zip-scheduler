export async function parseScheduleDescription(description: string) {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("API returned non-JSON response:", text);
      throw new Error(`API Error (${response.status}): Server returned non-JSON response. Check console for details.`);
    }

    if (!response.ok) {
      throw new Error(data.error || data.details || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error("Failed to parse schedule:", error);
    throw error;
  }
}
