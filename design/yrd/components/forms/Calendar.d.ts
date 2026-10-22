import { ReactNode, InputHTMLAttributes } from "react";
export interface CalendarProps {
  value?: Date;
  onChange?: (d: Date) => void;
  month?: Date;
  onMonthChange?: (d: Date) => void;
  disabled?: (d: Date) => boolean;
  availability?: (d: Date) => "free" | "few" | "full" | null;
  today?: Date;
  className?: string;
}
export function Calendar(props: CalendarProps): JSX.Element;
