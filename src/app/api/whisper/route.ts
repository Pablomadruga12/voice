import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 500 });
  }

  const formData = await req.formData();
  const audio = formData.get('audio');

  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
  }

  const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: (() => {
      const fd = new FormData();
      fd.append('file', audio);
      fd.append('model', 'whisper-1');
      fd.append('response_format', 'json');
      return fd;
    })(),
  });

  if (!openaiRes.ok) {
    const error = await openaiRes.text();
    return NextResponse.json({ error }, { status: 500 });
  }

  const data = await openaiRes.json();
  return NextResponse.json({ text: data.text });
} 