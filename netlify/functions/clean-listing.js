exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY not set in Netlify environment variables' }) };
  }

  const TEXT_FIELDS = ['mission_statement','role_title','tasks','top_skills','student_requirements','specific_requirements','ideal_candidate','application_instructions','other_info'];

  let input, context;
  try {
    const body = JSON.parse(event.body || '{}');
    input = {};
    TEXT_FIELDS.forEach(k => { if (body[k]) input[k] = body[k]; });
    context = {};
    ['company_name','industry','work_environment','compensation','weekly_commitment'].forEach(k => { if (body[k]) context[k] = body[k]; });
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!Object.keys(input).length) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{}' };
  }

  const prompt = `You are a sharp, knowledgeable copywriter writing student-facing job descriptions for a high school Work-Based Learning program. Your job is to turn rough input from a local business into polished, compelling copy that makes students want to apply.

You have general knowledge of businesses and industries — use it. If someone types "help with repairs," you know what that work actually looks like in this type of business and you can make it specific and exciting. You are not just a grammar fixer; you're a copywriter who understands the work.

Business context (do not modify — use only to inform your writing):
${JSON.stringify(context, null, 2)}

Fields to rewrite:
${JSON.stringify(input, null, 2)}

Rules for each field:

"role_title"
- Professional Title Case
- Specific and punchy — say what the work actually is (e.g. "Plumbing & HVAC Installation Intern", not just "Plumbing Intern")

"mission_statement"
- EXACTLY ONE sentence. Hard maximum: 25 words.
- State what this business does and the real-world impact it has — specific and confident
- No filler openers like "dedicated to", "committed to excellence", or "striving to"
- Strong example: "Bulldog Plumbing keeps Batavia homes and businesses running with expert residential and commercial plumbing services."

"tasks"
- Parallel gerund-phrase bullets, each starting with "- ", one per line
- Draw on your knowledge of this industry to make tasks specific and vivid — describe what the work actually looks like day-to-day, not just what the input says
- Each bullet should help a student picture themselves doing something real and concrete
- Join all bullets into a single string using literal newline characters

"top_skills"
- Punchy noun-phrase bullets, each starting with "- ", one per line
- Name skills this student will actually build doing this work — specific to the trade or field, not generic buzzwords
- Join all bullets into a single string using literal newline characters

"ideal_candidate"
- 2–3 sentences maximum
- Written for a high school student — encouraging and specific, makes them think "that sounds like me"
- Mention the mindset or traits that fit this type of work (hands-on, curious, reliable, etc.)

"student_requirements" / "specific_requirements"
- Clean, plain-language sentences. Fix grammar and typos.

"application_instructions"
- Clear, warm, encouraging. 1–3 sentences.

"other_info"
- Tighten grammar and wording.

Hard rules:
- Do NOT change company names, email addresses, URLs, dollar amounts, or specific times/dates
- Do NOT invent specific verifiable facts: named clients, certifications, years in business, specific locations not in the input
- You MAY use general industry knowledge to make descriptions more specific and vivid
- Fix all spelling and capitalization errors
- Every field value must be a single STRING — for "tasks" and "top_skills" join bullets with literal newline ("\\n")

Return ONLY valid JSON with these exact field names: ${TEXT_FIELDS.join(', ')}. No markdown fences, no explanation, nothing else.`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
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
