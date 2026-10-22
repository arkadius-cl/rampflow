import { ReactNode, InputHTMLAttributes } from "react";
export interface FormFieldProps {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}
export function FormField(props: FormFieldProps): JSX.Element;
