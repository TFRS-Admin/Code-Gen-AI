// Core integrations — self-hosted stub replacing Base44 SDK
// InvokeLLM routes to the Blair server provider gateway.

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export async function InvokeLLM({ prompt, response_json_schema, add_context_from_internet }) {
  try {
    const res = await fetch(`${SERVER_URL}/api/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: 'local',
        baseBranch: 'develop',
        prompt,
        provider: 'mock',
      }),
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();

    // If a JSON schema was requested, try to parse the response as JSON
    if (response_json_schema) {
      try {
        return JSON.parse(data?.data?.content || '{}');
      } catch {
        return data?.data || {};
      }
    }

    return data?.data?.content || '';
  } catch (err) {
    console.warn('[InvokeLLM] Server unavailable, returning mock response:', err.message);
    // Graceful fallback so the UI doesn't crash when server is offline
    if (response_json_schema) return {};
    return '[Blair server offline — start the server to enable AI responses]';
  }
}

export default { InvokeLLM };
