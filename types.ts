export interface AnalysisResult {
  positive_nuclei_count: number;
  negative_nuclei_count: number;
  total_nuclei_count: number;
}

export interface QualityCheckResult {
  is_suitable: boolean;
  feedback: string;
  issues: string[];
}

// FIX: Add and export the TrainingExample interface.
export interface TrainingExample {
  id: string;
  image_base64: string;
  image_name: string;
  mime_type: string;
  positive_nuclei_count: number;
  negative_nuclei_count: number;
}
