"use client";
import React from "react";

type StepperProps = {
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  disableNext?: boolean;
  disableBack?: boolean;
};

export default function Stepper({
  children,
  onNext,
  onBack,
  nextLabel = "Next",
  backLabel = "Back",
  disableNext = false,
  disableBack = false,
}: StepperProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 mb-5">
      {children}
      <div className="flex flex-row gap-2 mt-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={disableBack}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:disabled:bg-gray-700 dark:text-gray-300 border-0 rounded-md text-base font-semibold transition-colors flex-1"
          >
            {backLabel}
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={disableNext}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white border-0 rounded-md text-base font-semibold transition-colors flex-1"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
