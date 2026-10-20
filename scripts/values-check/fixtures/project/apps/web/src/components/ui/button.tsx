import { cva } from 'fake-cva';

export const buttonVariants = cva({ variants: { size: { sm: 'h-8', lg: 'h-10' } } });

export function Button(props: { variant?: 'default' | 'outline' }): JSX.Element {
  return <span>{props.variant}</span>;
}
