
import React, { useCallback, useState } from 'react';
import { UploadIcon, CameraIcon } from './icons';
import { CameraModal } from './CameraModal';

interface ImageUploaderProps {
    onImageUpload: (file: File) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onImageUpload(e.target.files[0]);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onImageUpload(e.dataTransfer.files[0]);
        }
    }, [onImageUpload]);

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleCapture = (file: File) => {
        onImageUpload(file);
        setIsCameraOpen(false);
    };

    return (
        <div className="w-full max-w-lg text-center">
            <label
                htmlFor="file-upload"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                className={`relative block w-full rounded-lg border-2 border-dashed p-12 text-center hover:border-brand-teal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-teal cursor-pointer transition-colors duration-300 ${isDragging ? 'border-brand-teal bg-teal-50' : 'border-gray-300'}`}
            >
                <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
                <span className="mt-2 block text-sm font-medium text-gray-900">
                    Drag and drop your IHC image
                </span>
                <span className="block text-xs text-gray-500">or click to browse</span>
            </label>
            <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
            />
             <div className="mt-4 flex items-center justify-center">
                <span className="h-px flex-1 bg-gray-300"></span>
                <span className="px-4 text-sm text-gray-500">OR</span>
                <span className="h-px flex-1 bg-gray-300"></span>
            </div>
            <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="mt-4 inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue"
            >
                <CameraIcon className="w-5 h-5 mr-2" />
                Use Camera
            </button>
            <CameraModal
                isOpen={isCameraOpen}
                onClose={() => setIsCameraOpen(false)}
                onCapture={handleCapture}
            />
        </div>
    );
};
