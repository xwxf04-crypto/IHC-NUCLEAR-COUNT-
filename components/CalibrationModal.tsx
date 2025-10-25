
import React, { useState, useEffect, useCallback } from 'react';
import type { TrainingExample } from '../types';
import { fileToBase64 } from '../services/geminiService';
import { UploadIcon, ClearIcon } from './icons';

interface CalibrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (examples: TrainingExample[]) => void;
    initialExamples: TrainingExample[];
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({ isOpen, onClose, onSave, initialExamples }) => {
    const [examples, setExamples] = useState<TrainingExample[]>(initialExamples);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setExamples(initialExamples);
    }, [initialExamples, isOpen]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        setIsLoading(true);

        const newExamples: TrainingExample[] = [...examples];

        // FIX: Use a standard for-loop to iterate over the FileList.
        // This ensures correct type inference for `file` as a File object,
        // resolving errors where it was previously treated as 'unknown' in a for...of loop.
        for (let i = 0; i < e.target.files.length; i++) {
            const file = e.target.files[i];
            if (file) {
                const base64 = await fileToBase64(file);
                newExamples.push({
                    id: `${file.name}-${Date.now()}`,
                    image_base64: base64,
                    image_name: file.name,
                    mime_type: file.type,
                    positive_nuclei_count: 0,
                    negative_nuclei_count: 0,
                });
            }
        }
        
        setExamples(newExamples);
        setIsLoading(false);
        // Reset file input value to allow re-uploading the same file
        e.target.value = '';
    };

    const handleCountChange = (id: string, field: 'positive_nuclei_count' | 'negative_nuclei_count', value: string) => {
        const intValue = parseInt(value, 10);
        if (isNaN(intValue) || intValue < 0) return;

        setExamples(prev => prev.map(ex => ex.id === id ? { ...ex, [field]: intValue } : ex));
    };

    const handleRemoveExample = (id: string) => {
        setExamples(prev => prev.filter(ex => ex.id !== id));
    };

    const handleSave = () => {
        onSave(examples);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-brand-blue">Calibrate AI with Examples</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto flex-grow">
                    <p className="text-sm text-gray-600 mb-4">
                        Provide images with known nuclei counts to improve the AI's accuracy. The more high-quality examples you provide, the better the results will be.
                    </p>
                    <div className="space-y-4">
                        {examples.map(ex => (
                            <div key={ex.id} className="flex items-center gap-4 p-3 border rounded-md shadow-sm bg-gray-50">
                                <img
                                    src={`data:${ex.mime_type};base64,${ex.image_base64}`}
                                    alt={ex.image_name}
                                    className="w-24 h-24 object-cover rounded-md border"
                                />
                                <div className="flex-grow space-y-2">
                                    <p className="text-sm font-medium text-gray-800 truncate" title={ex.image_name}>{ex.image_name}</p>
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <label htmlFor={`positive-${ex.id}`} className="block text-xs font-medium text-gray-700">Positive</label>
                                            <input
                                                type="number"
                                                id={`positive-${ex.id}`}
                                                value={ex.positive_nuclei_count}
                                                onChange={e => handleCountChange(ex.id, 'positive_nuclei_count', e.target.value)}
                                                className="w-24 p-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-teal focus:border-brand-teal"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`negative-${ex.id}`} className="block text-xs font-medium text-gray-700">Negative</label>
                                            <input
                                                type="number"
                                                id={`negative-${ex.id}`}
                                                value={ex.negative_nuclei_count}
                                                onChange={e => handleCountChange(ex.id, 'negative_nuclei_count', e.target.value)}
                                                className="w-24 p-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-teal focus:border-brand-teal"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleRemoveExample(ex.id)} className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-100">
                                    <ClearIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                     <label
                        htmlFor="calibration-file-upload"
                        className="relative block w-full rounded-lg border-2 border-dashed p-8 text-center mt-6 hover:border-brand-teal cursor-pointer transition-colors"
                    >
                        <UploadIcon className="mx-auto h-10 w-10 text-gray-400" />
                        <span className="mt-2 block text-sm font-medium text-gray-900">
                            {isLoading ? 'Processing images...' : 'Add more example images'}
                        </span>
                    </label>
                    <input
                        id="calibration-file-upload"
                        type="file"
                        className="sr-only"
                        accept="image/png, image/jpeg, image/webp"
                        multiple
                        onChange={handleFileChange}
                        disabled={isLoading}
                    />
                </div>
                <footer className="p-4 border-t bg-gray-50 flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-brand-teal border border-transparent rounded-md shadow-sm hover:bg-opacity-90">
                        Save & Close
                    </button>
                </footer>
            </div>
        </div>
    );
};
