const { OpenAI } = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Enrich vocabulary data using OpenAI API.
 * Input: array of { en, vn? }
 * Output: { data: enriched[], usage: { input, output, total } }
 */
async function enrichVocabulary(rawData) {
  if (!rawData || rawData.length === 0) {
    throw new Error('No vocabulary data provided');
  }

  const sample = rawData.slice(0, 100);

  const prompt = `You are a vocabulary data enricher. For each vocabulary item, fill in missing fields.

Input format: [{ "en": "word", "vn": "translation (may be empty)" }, ...]

For each item, output:
{
  "en": "English word",
  "vn": "Vietnamese translation (fill if empty)",
  "phonetic": "/IPA phonetic/",
  "part": "noun|verb|adjective|adverb|...",
  "synonyms": "comma-separated synonyms",
  "type": "word type",
  "image": "",
  "example": "Example sentence using the word",
  "level": "A1|A2|B1|B2|C1|C2",
  "source": "user_upload"
}

Input data:
${JSON.stringify(sample, null, 2)}

Rules:
1. Keep 'en' exactly as given
2. If 'vn' is empty, provide accurate Vietnamese translation
3. Fill all other fields with accurate info
4. Set 'image' to empty string
5. Set 'source' to "user_upload"
6. Return ONLY valid JSON array, no markdown fences, no explanation

Output: Valid JSON array`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.choices[0].message.content.trim();
  const cleaned = responseText.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();

  let enriched;
  try {
    enriched = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Failed to parse OpenAI response as JSON');
  }

  if (!Array.isArray(enriched)) {
    throw new Error('OpenAI response is not an array');
  }

  // Validate
  const valid = enriched.filter(item => item.en && typeof item.en === 'string');

  return {
    data: valid,
    usage: {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
      total: response.usage?.total_tokens || 0,
    },
  };
}

module.exports = { enrichVocabulary };
