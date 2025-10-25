
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { ResultsDisplay } from './components/ResultsDisplay';
import { analyzeIHCImage, performQualityCheck, editImageWithText, fileToBase64, base64ToFile } from './services/geminiService';
import type { AnalysisResult, QualityCheckResult } from './types';
import { ClearIcon, ProcessIcon, QualityCheckIcon, CheckIcon, WarningIcon, MicroscopeIcon, EditIcon, CropIcon } from './components/icons';

type Mode = 'ANALYSIS' | 'EDIT';

const QualityCheckDisplay: React.FC<{ result: QualityCheckResult }> = ({ result }) => {
    const { is_suitable, feedback, issues } = result;
    const bgColor = is_suitable ? 'bg-green-50' : 'bg-yellow-50';
    const borderColor = is_suitable ? 'border-green-300' : 'border-yellow-400';
    const textColor = is_suitable ? 'text-green-800' : 'text-yellow-800';
    const Icon = is_suitable ? CheckIcon : WarningIcon;

    return (
        <div className={`w-full max-w-md p-4 mt-4 rounded-lg border ${bgColor} ${borderColor} ${textColor} animate-fade-in`}>
            <div className="flex items-center">
                <Icon className="w-6 h-6 mr-3 flex-shrink-0" />
                <h3 className="font-semibold text-lg">{is_suitable ? 'Quality Check Passed' : 'Quality Warning'}</h3>
            </div>
            <p className="mt-2 text-sm text-gray-700">{feedback}</p>
            {issues.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-sm text-gray-600">
                    {issues.map((issue, index) => (
                        <li key={index} className="capitalize">{issue.replace(/_/g, ' ')}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};


const App: React.FC = () => {
    const [mode, setMode] = useState<Mode>('ANALYSIS');
    const [image, setImage] = useState<{ file: File; url: string } | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');

    const [qualityCheckResult, setQualityCheckResult] = useState<QualityCheckResult | null>(null);
    const [isQualityChecking, setIsQualityChecking] = useState(false);
    const [qualityCheckError, setQualityCheckError] = useState<string | null>(null);

    const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);

    // State for free-form selection
    const [selectionPoints, setSelectionPoints] = useState<{ x: number, y: number }[]>([]);
    const [isDrawing, setIsDrawing] = useState(true);
    const [previewPoint, setPreviewPoint] = useState<{ x: number, y: number } | null>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        // Load last session
        const savedResultJSON = localStorage.getItem('lastAnalysisResult');
        const savedImageJSON = localStorage.getItem('lastAnalysisImage');
        if (savedResultJSON && savedImageJSON) {
            try {
                const savedResult: AnalysisResult = JSON.parse(savedResultJSON);
                const { base64, name, type } = JSON.parse(savedImageJSON);
                const restoredImage = base64ToFile(base64, name, type);
                setImage(restoredImage);
                setAnalysisResult(savedResult);
                setQualityCheckResult({ is_suitable: true, feedback: 'Restored from previous session.', issues: [] });
            } catch (e) {
                console.error("Failed to load saved analysis from localStorage", e);
                localStorage.removeItem('lastAnalysisResult');
                localStorage.removeItem('lastAnalysisImage');
            }
        }
    }, []);
    
    const clearSelection = useCallback(() => {
        setSelectionPoints([]);
        setIsDrawing(true);
        setPreviewPoint(null);
    }, []);

    const resetState = useCallback((clearImage = true) => {
        if (clearImage && image?.url) {
            URL.revokeObjectURL(image.url);
            setImage(null);
            localStorage.removeItem('lastAnalysisImage');
        }
        setAnalysisResult(null);
        setError(null);
        setIsLoading(false);
        setQualityCheckResult(null);
        setIsQualityChecking(false);
        setQualityCheckError(null);
        setAnalysisProgress(null);
        clearSelection();
        localStorage.removeItem('lastAnalysisResult');
    }, [image?.url, clearSelection]);

    const handleImageUpload = useCallback((file: File) => {
        resetState();
        setImage({ file, url: URL.createObjectURL(file) });
    }, [resetState]);

     const getMaskedFile = async (
        sourceFile: File,
        points: { x: number; y: number }[]
    ): Promise<File> => {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = URL.createObjectURL(sourceFile);
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Draw the polygon
                ctx.beginPath();
                ctx.moveTo(points[0].x * image.naturalWidth, points[0].y * image.naturalHeight);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x * image.naturalWidth, points[i].y * image.naturalHeight);
                }
                ctx.closePath();
                
                // Use the polygon as a clipping mask
                ctx.clip();

                // Draw the image inside the clipped area
                ctx.drawImage(image, 0, 0);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas to Blob conversion failed'));
                        return;
                    }
                    // Use PNG to support transparency if needed, though clipping makes it irrelevant
                    const maskedFile = new File([blob], `masked_${sourceFile.name}`, { type: 'image/png' });
                    resolve(maskedFile);
                }, 'image/png');
                URL.revokeObjectURL(image.src); // Clean up
            };
            image.onerror = (error) => reject(error);
        });
    };

    const getFileToProcess = async (): Promise<File | null> => {
        if (!image) return null;
    
        if (selectionPoints.length > 2 && !isDrawing) {
             const scaledPoints = selectionPoints.map(p => ({
                x: p.x / 100,
                y: p.y / 100,
            }));
            return await getMaskedFile(image.file, scaledPoints);
        }
        return image.file;
    };


    const handleQualityCheck = async () => {
        const fileToProcess = await getFileToProcess();
        if (!fileToProcess) return;

        setIsQualityChecking(true);
        setQualityCheckError(null);
        setQualityCheckResult(null);
        try {
            const result = await performQualityCheck(fileToProcess);
            setQualityCheckResult(result);
        } catch (err) {
            console.error(err);
            setQualityCheckError('An error occurred during quality check.');
        } finally {
            setIsQualityChecking(false);
        }
    };

    const handleAnalyzeClick = async () => {
        const fileToProcess = await getFileToProcess();
        if (!fileToProcess || !image) return;

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        setAnalysisProgress(0);
        try {
             // Only save the full, original image to local storage
            const base64Image = await fileToBase64(image.file);
            const imageToSave = { base64: base64Image, name: image.file.name, type: image.file.type };

            const result = await analyzeIHCImage(fileToProcess, setAnalysisProgress);
            setAnalysisResult(result);
            localStorage.setItem('lastAnalysisResult', JSON.stringify(result));
            localStorage.setItem('lastAnalysisImage', JSON.stringify(imageToSave));
        } catch (err) {
            console.error(err);
            setError('An error occurred during analysis. Please try another image.');
        } finally {
            setIsLoading(false);
            setAnalysisProgress(null);
        }
    };
    
    const handleEditClick = async () => {
        if (!prompt || !image) return;
        setIsLoading(true);
        setError(null);
        resetState(false); // don't clear the image while editing
        try {
            const editedImage = await editImageWithText(image.file, prompt);
            URL.revokeObjectURL(image.url);
            setImage(editedImage);
        } catch (err) {
            console.error(err);
            setError('An error occurred during image editing.');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Polygon selection handlers
    const getPointFromEvent = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    };

    const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing) return;

        const point = getPointFromEvent(e);

        if (selectionPoints.length > 0) {
            const firstPoint = selectionPoints[0];
            const clickRadius = 2; // in percentage of width/height
            const distance = Math.sqrt(Math.pow(point.x - firstPoint.x, 2) + Math.pow(point.y - firstPoint.y, 2));

            if (distance < clickRadius) {
                // Close the polygon
                setIsDrawing(false);
                setPreviewPoint(null);
                return;
            }
        }
        setSelectionPoints([...selectionPoints, point]);
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isDrawing && selectionPoints.length > 0) {
            setPreviewPoint(getPointFromEvent(e));
        }
    };

    const renderAnalysisLoadingState = () => {
        if (isLoading && analysisProgress !== null) {
            return (
                <div className="flex flex-col items-center text-center text-brand-blue w-full max-w-md">
                    <p className="text-xl font-semibold mb-2">Performing AI analysis...</p>
                    <p className="text-gray-500 mt-0 mb-4 text-sm">Running two analysis passes for consistency. {analysisProgress}% complete.</p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                            className="bg-brand-teal h-2.5 rounded-full transition-all duration-500" 
                            style={{ width: `${analysisProgress}%` }}
                        ></div>
                    </div>
                </div>
            )
        }
        return (
             <div className="flex flex-col items-center text-center text-brand-blue">
                <svg className="animate-spin h-10 w-10 text-brand-teal mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 S0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-xl font-semibold">AI is working...</p>
                <p className="text-gray-500 mt-2">This may take a moment.</p>
            </div>
        )
    }

    const hasSelection = selectionPoints.length > 0;
    const isSelectionComplete = hasSelection && !isDrawing;

    const renderContent = () => {
        if (isLoading && mode === 'EDIT' && !analysisResult) {
            return renderAnalysisLoadingState();
        }
        
        if(error) {
             return (
                <div className="text-center text-red-600">
                    <h3 className="text-xl font-semibold">Action Failed</h3>
                    <p className="mt-2">{error}</p>
                </div>
            )
        }

        switch (mode) {
            case 'ANALYSIS':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left Column: Image Upload and Preview */}
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 flex flex-col items-center justify-center min-h-[300px] lg:min-h-[60vh]">
                            {!image ? <ImageUploader onImageUpload={handleImageUpload} /> : (
                                <div className="w-full flex flex-col items-center text-center">
                                    <h2 className="text-xl font-semibold text-brand-blue mb-4">Image Preview</h2>
                                    <div
                                        className="relative w-full max-w-md mb-2 rounded-lg overflow-hidden shadow-md border cursor-crosshair"
                                        onClick={handleImageClick}
                                        onMouseMove={handleMouseMove}
                                    >
                                        <img ref={imageRef} src={image.url} alt="IHC sample" className="w-full h-auto object-contain select-none pointer-events-none" draggable="false" />
                                        <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                                            {/* Dimming overlay */}
                                            {isSelectionComplete && (
                                                <path
                                                    d={`M0,0 H100 V100 H0 Z M ${selectionPoints.map(p => `${p.x},${p.y}`).join(' ')} Z`}
                                                    fill="rgba(0,0,0,0.6)"
                                                    fillRule="evenodd"
                                                />
                                            )}
                                            {/* Polygon lines */}
                                            <polyline
                                                points={selectionPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                                fill="none"
                                                stroke="#28A8A6"
                                                strokeWidth="0.5"
                                            />
                                            {/* Preview line */}
                                            {isDrawing && selectionPoints.length > 0 && previewPoint && (
                                                 <line
                                                    x1={selectionPoints[selectionPoints.length - 1].x}
                                                    y1={selectionPoints[selectionPoints.length - 1].y}
                                                    x2={previewPoint.x}
                                                    y2={previewPoint.y}
                                                    stroke="#28A8A6"
                                                    strokeWidth="0.5"
                                                    strokeDasharray="1,1"
                                                />
                                            )}
                                            {/* Vertices */}
                                            {selectionPoints.map((p, i) => (
                                                <circle
                                                    key={i}
                                                    cx={p.x}
                                                    cy={p.y}
                                                    r={i === 0 ? "1" : "0.7"}
                                                    fill={i === 0 ? "#FFD700" : "#28A8A6"}
                                                    stroke="white"
                                                    strokeWidth="0.2"
                                                />
                                            ))}
                                        </svg>
                                    </div>
                                    <p className="text-xs text-gray-500 italic mb-4">
                                        {isDrawing ? "Click points to draw a selection. Click the first point to close it." : "Selection complete."}
                                    </p>

                                    {isQualityChecking && <div className="flex items-center text-brand-blue my-2"><svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Running quality check...</span></div>}
                                    {qualityCheckError && <p className="text-red-600 my-2">{qualityCheckError}</p>}
                                    {qualityCheckResult && <QualityCheckDisplay result={qualityCheckResult} />}
                                    <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
                                       {!qualityCheckResult && <button onClick={handleQualityCheck} disabled={isQualityChecking || !image || (hasSelection && isDrawing)} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"><QualityCheckIcon className="w-5 h-5 mr-2" />{isSelectionComplete ? 'Check Selection Quality' : 'Run Quality Check'}</button>}
                                       {hasSelection && <button onClick={clearSelection} className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"><CropIcon className="w-5 h-5 mr-2" />Clear Selection</button>}
                                       {qualityCheckResult && <button onClick={handleAnalyzeClick} disabled={isLoading || (hasSelection && isDrawing)} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-brand-teal hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-teal disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"><ProcessIcon className="w-5 h-5 mr-2" />{isLoading ? 'Analyzing...' : isSelectionComplete ? 'Analyze Selection' : 'Analyze Nuclei'}{qualityCheckResult && !qualityCheckResult.is_suitable && <WarningIcon className="w-5 h-5 ml-2 text-yellow-300" />}</button>}
                                        <button onClick={() => resetState()} className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"><ClearIcon className="w-5 h-5 mr-2" />Clear Image</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 flex flex-col items-center justify-center min-h-[300px] lg:min-h-[60vh]">
                           {isLoading && analysisResult === null ? renderAnalysisLoadingState() : 
                           error ? <div className="text-center text-red-600"><h3 className="text-xl font-semibold">Analysis Failed</h3><p className="mt-2">{error}</p></div> : 
                           analysisResult ? <ResultsDisplay result={analysisResult} /> : 
                           <div className="text-center text-gray-500"><h3 className="text-2xl font-semibold text-brand-blue">Awaiting Image</h3><p className="mt-2 max-w-sm">Upload an IHC image to begin the analysis workflow.</p></div>}
                        </div>
                    </div>
                )
            case 'EDIT':
                 return (
                    <div className="w-full flex flex-col items-center">
                        {!image ? <div className="w-full max-w-lg"><ImageUploader onImageUpload={handleImageUpload} /></div> : (
                             <div className="w-full max-w-2xl text-center">
                                 <h2 className="text-2xl font-bold text-brand-blue mb-4">Image Editing</h2>
                                 <div className="rounded-lg overflow-hidden shadow-md border mb-6"><img src={image.url} alt="To be edited" className="w-full h-auto object-contain" /></div>
                                 <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., Add a retro filter, make the background blurry" className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-brand-teal focus:border-brand-teal" rows={3}></textarea>
                                 <button onClick={handleEditClick} disabled={isLoading || !prompt} className="mt-4 w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"><EditIcon className="w-5 h-5 mr-2" />Apply Edit</button>
                             </div>
                        )}
                    </div>
                 );
        }
    }

    const NavButton: React.FC<{ targetMode: Mode, icon: React.ReactNode, text: string }> = ({ targetMode, icon, text }) => {
        const isActive = mode === targetMode;
        return (
            <button
                onClick={() => { setMode(targetMode); setError(null); }}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${isActive ? 'border-brand-teal text-brand-teal' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
                {icon}
                <span className="ml-2 hidden sm:inline">{text}</span>
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-brand-light text-gray-800 font-sans">
             <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                         <div className="flex items-center text-brand-blue">
                            <MicroscopeIcon className="w-8 h-8 mr-3 text-brand-teal" />
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">AI Image Studio</h1>
                        </div>
                         <div className="flex items-center">
                            <div className="border-b border-gray-200">
                                <nav className="-mb-px flex space-x-2 sm:space-x-6" aria-label="Tabs">
                                    <NavButton targetMode="ANALYSIS" icon={<MicroscopeIcon className="w-5 h-5"/>} text="Nuclei Analysis" />
                                    <NavButton targetMode="EDIT" icon={<EditIcon className="w-5 h-5"/>} text="Image Editing" />
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[calc(100vh-80px)]">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;
