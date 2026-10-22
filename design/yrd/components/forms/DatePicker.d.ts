import { ReactNode, InputHTMLAttributes } from "react";
export interface DatePickerProps {
  value?: Date;
  onChange?: (d: Date) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: (d: Date) => boolean;
  availability?: (d: Date) => "free" | "few" | "full" | null;
  className?: string;
}
export function DatePicker(props: DatePickerProps): JSX.Element;
