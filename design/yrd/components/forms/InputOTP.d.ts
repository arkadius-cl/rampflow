import { ReactNode, InputHTMLAttributes } from "react";
export interface InputOTPProps {
  length?: number;
  value?: string;
  onChange?: (v: string) => void;
  invalid?: boolean;
  size?: "default" | "lg";
  className?: string;
}
export function InputOTP(props: InputOTPProps): JSX.Element;
