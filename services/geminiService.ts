import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { AnalysisResult, QualityCheckResult } from '../types';

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const base64ToFile = (base64: string, filename: string, mimeType: string): { file: File, url: string } => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], filename, { type: mimeType });
    const url = URL.createObjectURL(file);
    return { file, url };
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function editImageWithText(imageFile: File, prompt: string): Promise<{ file: File; url: string }> {
    const base64Image = await fileToBase64(imageFile);

    const imagePart = {
        inlineData: {
            mimeType: imageFile.type,
            data: base64Image,
        },
    };

    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const imageResponsePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imageResponsePart?.inlineData) {
        const enhancedBase64 = imageResponsePart.inlineData.data;
        const mimeType = imageResponsePart.inlineData.mimeType;
        return base64ToFile(enhancedBase64, `edited_${imageFile.name}`, mimeType);
    }

    throw new Error("Failed to edit image. No image data received from API.");
}

export async function performQualityCheck(imageFile: File): Promise<QualityCheckResult> {
    const base64Image = await fileToBase64(imageFile);

    const imagePart = {
        inlineData: {
            mimeType: imageFile.type,
            data: base64Image,
        },
    };

    const textPart = {
        text: `You are an expert histopathologist AI. Analyze the provided Immunohistochemistry (IHC) image for its suitability for automated nuclei counting. Evaluate:
1.  **Clarity/Focus**: Is the image sharp or blurry?
2.  **Staining Quality**: Is there clear differentiation between brown (positive) and blue (negative) staining?
3.  **Magnification**: Is the magnification appropriate for identifying individual cell nuclei (e.g., 20x or 40x)?
4.  **Artifacts**: Are there significant artifacts like tissue folds, dust, or air bubbles?
Based on your evaluation, provide a JSON response. Do not add any explanatory text.`,
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, imagePart] },
        config: {
            responseMimeType: "application/json",
            temperature: 0,
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    is_suitable: {
                        type: Type.BOOLEAN,
                        description: "True if the image is of good quality and suitable for analysis, false otherwise."
                    },
                    feedback: {
                        type: Type.STRING,
                        description: "A concise, one-sentence summary of the image quality."
                    },
                    issues: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                        description: "A list of identified issues, if any (e.g., 'blurry', 'poor_staining', 'low_magnification', 'artifacts'). Can be an empty array."
                    }
                },
                required: ["is_suitable", "feedback", "issues"],
            },
        },
    });

    const resultJson = response.text;
    const parsedResult = JSON.parse(resultJson) as QualityCheckResult;

    if (typeof parsedResult.is_suitable !== 'boolean' ||
        typeof parsedResult.feedback !== 'string' ||
        !Array.isArray(parsedResult.issues)) {
        throw new Error("Invalid data format received from API for quality check.");
    }

    return parsedResult;
}


export async function analyzeIHCImage(
    imageFile: File, 
    onProgress?: (progress: number) => void
): Promise<AnalysisResult> {
    onProgress?.(0);
    
    const initialPrompt = `You are a computational pathologist AI with an expert ability to differentiate IHC staining. Your task is to count nuclei with high precision.
1. **Establish General Morphology:** First, identify a representative set of clear, well-defined oval or round cell nuclei, regardless of their stain color. Use these examples to establish a general reference for typical nuclear size and shape in this sample.
2. **Classify and Count:** Scan the entire image and classify every nucleus that matches the reference morphology based on its stain color:
    - **Positive Nuclei:** Classify nuclei with a distinct, solid brown stain as 'positive'.
    - **Negative Nuclei:** Classify nuclei with a distinct blue or purple (hematoxylin) stain as 'negative'.
3. **Careful Differentiation:** Your goal is a comprehensive and accurate count. Carefully differentiate true nuclei from background staining, debris, or cytoplasm. If a structure clearly has nuclear morphology (oval/round shape) and distinct staining (either brown or blue), it should be included in the count, even if staining intensity varies slightly.
4.  **Output:** Provide the final counts in the requested JSON format. Do not add any explanatory text.`;
    
    const base64Image = await fileToBase64(imageFile);
    
    const requestConfig = {
        model: 'gemini-2.5-pro',
        contents: { 
            parts: [
                { text: initialPrompt },
                {
                    inlineData: {
                        mimeType: imageFile.type,
                        data: base64Image,
                    },
                }
            ]
        },
        config: {
            responseMimeType: "application/json",
            temperature: 0,
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    positive_nuclei_count: {
                        type: Type.INTEGER,
                        description: "The total count of brown-stained (positive) nuclei that match the reference morphology and strict criteria."
                    },
                    negative_nuclei_count: {
                        type: Type.INTEGER,
                        description: "The total count of blue-stained (negative) nuclei that match the reference morphology."
                    },
                    total_nuclei_count: {
                        type: Type.INTEGER,
                        description: "The combined total count of all identified positive and negative nuclei that meet the criteria."
                    }
                },
                required: ["positive_nuclei_count", "negative_nuclei_count", "total_nuclei_count"],
            },
        },
    };

    const runSingleAnalysis = async (): Promise<AnalysisResult> => {
        const response = await ai.models.generateContent(requestConfig);
        const resultJson = response.text;
        const parsedResult = JSON.parse(resultJson) as AnalysisResult;

        if (typeof parsedResult.positive_nuclei_count !== 'number' ||
            typeof parsedResult.negative_nuclei_count !== 'number' ||
            typeof parsedResult.total_nuclei_count !== 'number') {
            throw new Error("Invalid data format received from API.");
        }
        return parsedResult;
    };

    const result1 = await runSingleAnalysis();
    onProgress?.(50);

    const result2 = await runSingleAnalysis();
    onProgress?.(100);

    const avgPositive = Math.round((result1.positive_nuclei_count + result2.positive_nuclei_count) / 2);
    const avgNegative = Math.round((result1.negative_nuclei_count + result2.negative_nuclei_count) / 2);

    return {
        positive_nuclei_count: avgPositive,
        negative_nuclei_count: avgNegative,
        total_nuclei_count: avgPositive + avgNegative,
    };
}