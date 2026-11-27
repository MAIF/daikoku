import { Check } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import '../../style/components/checkbox.scss';

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export const Checkbox = (props: CheckboxProps) => (
  <span className="checkbox">
    <input {...props} type="checkbox" />
    <Check size={20} strokeWidth={2.5} aria-hidden="true" />
  </span>
);
