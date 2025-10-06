"use client";
import React from "react";

type StepperProps = {
  step: number;
  children: React.ReactNode;
};

export default function Stepper({ step, children }: StepperProps) {
  return <div className={`step step${step}`}>{children}</div>;
}
