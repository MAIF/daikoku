import classNames from 'classnames';
import { Check, Plus } from 'lucide-react';
import { useId } from 'react';

export type ChoiceOption<T> = {
  value: T;
  label: string;
  muted?: boolean;
  title?: string;
  disabled?: boolean;
};

type ChoiceChipsProps<T> = {
  label: string;
  options: Array<ChoiceOption<T>>;
  value?: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export const ChoiceChips = <T,>(props: ChoiceChipsProps<T>) => {
  const labelId = useId();

  return (
    <div className="choice-chips">
      <span id={labelId} className="form-label d-block">
        {props.label}
      </span>

      <div className="d-flex flex-wrap gap-2" role="radiogroup" aria-labelledby={labelId}>
        {props.options.map((option) => {
          const selected = option.value === props.value;

          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              className={classNames('chips --rounded', { '--selected': selected, '--muted': option.muted })}
              disabled={props.disabled || option.disabled}
              title={option.title}
              onClick={() => props.onChange(option.value)}
            >
              {selected && <Check size={14} aria-hidden="true" />}
              {option.muted && <Plus size={14} aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
