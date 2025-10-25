
import React from 'react';
import type { AnalysisResult } from '../types';

interface ResultsDisplayProps {
    result: AnalysisResult;
}

const DonutChart: React.FC<{ percentage: number }> = ({ percentage }) => {
    const radius = 15.9155;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle
                    className="stroke-current text-negative opacity-20"
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    strokeWidth="3.8"
                />
                <circle
                    className="stroke-current text-positive"
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    strokeWidth="3.8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </svg>
            <div className="absolute top-0 left-0 flex items-center justify-center w-full h-full">
                <span className="text-3xl font-bold text-brand-blue">{percentage.toFixed(1)}%</span>
            </div>
        </div>
    );
};

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
    const { positive_nuclei_count, negative_nuclei_count, total_nuclei_count } = result;
    const positiveRatio = total_nuclei_count > 0 ? (positive_nuclei_count / total_nuclei_count) * 100 : 0;

    return (
        <div className="w-full text-center animate-fade-in flex flex-col items-center justify-center space-y-6">
            <h2 className="text-2xl font-semibold text-brand-blue">Analysis Results</h2>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 pt-6">
                <div className="flex flex-col items-center">
                    <DonutChart percentage={positiveRatio} />
                    <p className="mt-2 text-lg font-medium text-gray-600">Positive Ratio</p>
                </div>
                <div className="w-full md:w-auto md:text-left space-y-3 bg-gray-50 p-6 rounded-lg border min-w-[300px]">
                    <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-lg flex items-center">
                            <span className="w-3 h-3 rounded-full bg-positive mr-2"></span>
                            Positive Nuclei:
                        </span>
                        <span className="text-lg font-bold text-positive">{positive_nuclei_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-lg flex items-center">
                            <span className="w-3 h-3 rounded-full bg-negative mr-2"></span>
                            Negative Nuclei:
                        </span>
                        <span className="text-lg font-bold text-negative">{negative_nuclei_count.toLocaleString()}</span>
                    </div>
                    <hr className="my-2"/>
                    <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-xl text-brand-blue">
                            Total Nuclei:
                        </span>
                        <span className="text-xl font-extrabold text-brand-blue">{total_nuclei_count.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};