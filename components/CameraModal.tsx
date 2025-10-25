import React, { useRef, useEffect, useCallback } from 'react';

interface CameraModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            const startStream = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    alert("Could not access the camera. Please ensure you have granted permission and are not using it in another application.");
                    onClose();
                }
            };
            startStream();
        } else {
            stopStream();
        }

        return () => {
            stopStream();
        };
    }, [isOpen, onClose, stopStream]);

    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
                        onCapture(file);
                    }
                }, 'image/jpeg');
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-brand-blue">Camera Capture</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl font-light">&times;</button>
                </header>
                <div className="p-4 bg-gray-100">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-md bg-black"></video>
                </div>
                <footer className="p-4 border-t bg-gray-50 flex justify-center gap-4">
                    <button onClick={handleCapture} className="px-6 py-3 text-lg font-medium text-white bg-brand-teal border border-transparent rounded-md shadow-sm hover:bg-opacity-90">
                        Take Photo
                    </button>
                </footer>
            </div>
        </div>
    );
};
