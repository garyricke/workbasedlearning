exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY not set in Netlify environment variables' }) };
  }

  const TEXT_FIELDS = ['mission_statement','role_title','tasks','top_skills','student_requirements','specific_requirements','ideal_candidate','application_instructions','other_info'];

  let input;
  try {
    const body = JSON.parse(event.body || '{}');
    input = {};
    TEXT_FIELDS.forEach(k => { if (body[k]) input[k] = body[k]; });
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!Object.keys(input).length) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{}' };
  }

  const prompt = `You are a professional copywriter turning rough, informal notes from a local business partner into a polished, compelling one-page job description for a high school Work-Based Learning program. Students will read this to decide whether to apply, so it needs to sound genuinely exciting and professional — not like raw meeting notes or a transcript.

Rules:
- Rewrite everything in clear, confident, professional language. Assume the input is rough draft material (typos, filler words, run-on thoughts, transcript-style phrasing) that needs a real rewrite, not just a light edit.
- "role_title": punchy, professional Title Case (e.g. "Marketing & Social Media Intern")
- "mission_statement": a polished, inviting 1–2 sentence paragraph capturing what the business does and why it matters — professional but warm
- "tasks": rewrite as parallel gerund-phrase bullets (e.g. "- Designing social media graphics for Instagram and TikTok campaigns"), one concrete idea per line, each starting with "- ". Merge fragments and drop stray punctuation.
- "top_skills": concise, punchy noun-phrase bullets, one per line starting with "- "
- "ideal_candidate": 2–3 clear, encouraging sentences describing the right student, written so a student reading it thinks "that's me" — never transcript-style or rambling
- "student_requirements" / "specific_requirements": clean, plain-language phrasing, fix grammar
- "application_instructions": clear, encouraging, professional sentences
- "other_info": fix grammar and punctuation, tighten wording
- Fix all grammar, spelling, and capitalization issues throughout (e.g. "libray" -> "library", "spedific" -> "specific")
- Do NOT invent new facts, tasks, skills, or requirements that aren't implied by the input
- Do NOT alter company names, email addresses, URLs, dollar amounts, or specific times/dates
- Every field value must be a single STRING, never a JSON array — for "tasks" and "top_skills", join the bullet lines into one string separated by literal newline characters ("\\n")

Input:
${JSON.stringify(input, null, 2)}

Return ONLY valid JSON with the same field names, every value a string. No markdown, no explanation.`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.55, maxOutputTokens: 4096, responseMimeType: 'application/json' }
  });

  // Try as API key first, then as Bearer token (handles both AIzaSy... and AQ... formats)
  let res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody }
  );

  if (!res.ok && (res.status === 401 || res.status === 403)) {
    res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: requestBody }
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    return { statusCode: res.status, body: JSON.stringify({ error: `Gemini ${res.status}: ${errText.slice(0, 200)}` }) };
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No JSON returned from Gemini' }) };
  }

  const result = JSON.parse(match[0]);
  const safe = {};
  TEXT_FIELDS.forEach(k => {
    let v = result[k];
    if (Array.isArray(v)) v = v.join('\n');
    if (v) safe[k] = v;
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safe)
  };
};
