
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const analyzeFinances = async (transactions: Transaction[]) => {
  const model = "gemini-3-flash-preview";
  
  const dataSummary = transactions.map(t => ({
    type: t.type,
    amount: t.amount,
    category: t.category,
    date: t.date,
    desc: t.description
  }));

  const prompt = `
    Dưới đây là danh sách các giao dịch thu chi của một Khu công nghiệp:
    ${JSON.stringify(dataSummary)}
    
    Hãy phân tích các số liệu này và đưa ra 3 nhận xét quan trọng nhất về tình hình tài chính hiện tại.
    Nhận xét nên tập trung vào:
    1. Cơ cấu nguồn thu và chi phí lớn nhất.
    2. Cảnh báo nếu có sự bất thường.
    3. Đề xuất cải thiện lợi nhuận hoặc tối ưu chi phí.
    
    Yêu cầu: Viết bằng tiếng Việt, ngắn gọn, súc tích, theo định dạng JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insights: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["insights"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result.insights || [];
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return ["Không thể thực hiện phân tích AI lúc này."];
  }
};
