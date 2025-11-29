import { NextRequest, NextResponse } from 'next/server';

interface ExtractedFields {
  documentType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown';
  fields: Record<string, string>;
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const documentType = formData.get('documentType') as string;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert image to base64
    const buffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString('base64');

    // Call Gemini API
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const prompt = getExtractionPrompt(documentType);

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inlineData: {
                  mimeType: imageFile.type,
                  data: base64Image,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Gemini API error:', error);
      return NextResponse.json({ error: 'OCR processing failed' }, { status: 500 });
    }

    const result = await response.json();
    const extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse extracted fields
    const extractedFields = parseExtractedFields(extractedText, documentType);

    return NextResponse.json({
      success: true,
      data: extractedFields,
    });
  } catch (error) {
    console.error('OCR error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

function getExtractionPrompt(documentType: string): string {
  const basePrompt = `You are an expert document OCR system. Extract all visible text and data from this document image.

Return the extracted information in this exact JSON format:
{
  "fields": {
    "field_name": "extracted_value"
  },
  "rawText": "all visible text",
  "confidence": "high|medium|low"
}`;

  const typeSpecificPrompts: Record<string, string> = {
    yemeni_id_front: `${basePrompt}

For a Yemeni ID Front, extract:
- Name (Arabic and English if present)
- ID Number
- Date of Birth
- Gender
- Governorate
- Any other visible text`,

    yemeni_id_back: `${basePrompt}

For a Yemeni ID Back, extract:
- Issue Date
- Expiration Date
- Passport Number
- Address
- Occupation
- Any other visible text`,

    passport: `${basePrompt}

For a Passport, extract:
- Surname/Family Name
- Given Names
- Passport Number
- Date of Birth
- Gender
- Place of Birth
- Date of Issue
- Date of Expiration
- Authority
- Nationality
- MRZ (Machine Readable Zone) if visible
- Any other visible text`,

    unknown: basePrompt,
  };

  return typeSpecificPrompts[documentType] || basePrompt;
}

function parseExtractedFields(text: string, documentType: string): ExtractedFields {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(text);
    return {
      documentType: (documentType as any) || 'unknown',
      fields: parsed.fields || {},
      rawText: parsed.rawText || text,
      confidence: parsed.confidence || 'medium',
    };
  } catch {
    // Fallback: return raw text as fallback
    return {
      documentType: (documentType as any) || 'unknown',
      fields: { rawExtraction: text },
      rawText: text,
      confidence: 'low',
    };
  }
}
