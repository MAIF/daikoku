import { Plus } from 'lucide-react';
import Select from 'react-select';

type ScopeOption = {
  value: string;
  label: string;
  muted?: boolean;
};

type ScopeSelectProps = {
  badge: string;
  ariaLabel: string;
  options: Array<ScopeOption>;
  value: string;
  onChange: (value: string) => void;
};

export const ScopeSelect = (props: ScopeSelectProps) => (
  <Select
    className="scope-select"
    classNamePrefix="reactSelect"
    aria-label={props.ariaLabel}
    options={props.options}
    value={props.options.find((option) => option.value === props.value) ?? null}
    onChange={(option) => option && props.onChange(option.value)}
    isSearchable={props.options.length > 8}
    formatOptionLabel={(option, { context }) =>
      context === 'value' ? (
        <span className="d-flex align-items-center gap-2">
          <span className="badge --primary text-uppercase">{props.badge}</span>
          {option.label}
        </span>
      ) : option.muted ? (
        <span className="d-flex align-items-center gap-1 text-muted">
          <Plus size={14} aria-hidden="true" />
          {option.label}
        </span>
      ) : (
        option.label
      )
    }
    components={{ IndicatorSeparator: () => null }}
    menuPortalTarget={document.body}
    styles={{ menuPortal: (base) => ({ ...base, zIndex: 2147483647 }) }}
  />
);
