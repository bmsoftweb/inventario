import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType, productDescription } = await req.json();

    if (!image || !mimeType || !productDescription) {
      return NextResponse.json(
        { error: "Dados incompletos. Forneça imagem, mimeType e descrição do produto." },
        { status: 400 }
      );
    }

    // Clean up base64 prefix if present
    let cleanBase64 = image;
    if (image.includes(";base64,")) {
      cleanBase64 = image.split(";base64,").pop();
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        },
        {
          text: `Você é um assistente de auditoria de estoque inteligente. Identifique e conte todos os itens na imagem que correspondem a: "${productDescription}". Seja preciso na contagem.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            count: {
              type: Type.INTEGER,
              description: "A quantidade exata de itens do tipo pedido encontrados na foto."
            },
            reasoning: {
              type: Type.STRING,
              description: "Uma explicação curta e direta em português do que foi identificado e como foi contado."
            }
          },
          required: ["count", "reasoning"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Nenhuma resposta recebida do modelo Gemini.");
    }

    const parsedResult = JSON.parse(resultText.trim());
    return NextResponse.json(parsedResult);

  } catch (error: any) {
    console.error("Erro na rota de contagem com Gemini:", error);
    return NextResponse.json(
      { error: "Falha ao analisar imagem com inteligência artificial.", details: error.message || String(error) },
      { status: 500 }
    );
  }
}
