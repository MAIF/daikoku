import { useContext, useId } from 'react';
import Select from 'react-select';

import { I18nContext } from '../../../../contexts';
import { ChoiceChips } from '../../../inputs';
import { InfoCallout } from '../../../utils';
import { CompatibleKeyring } from './compatibleKeyrings';

export type KeyringChoice = {
  attach?: 'existing' | 'new';
  keyringId?: string;
  newKeyringName: string;
};

export type ResolvedKeyringChoice = {
  groupKey: string;
  title: string;
  choice: KeyringChoice;
  compatibleKeyrings: Array<CompatibleKeyring>;
  joinsKeyring: boolean;
  createsKeyring: boolean;
  joinedKeyringId?: string;
  defaultKeyringName: string;
  isComplete: boolean;
};

type KeyringChoiceFieldsProps = {
  resolved: ResolvedKeyringChoice;
  onChange: (choice: KeyringChoice) => void;
};

export const KeyringChoiceFields = ({ resolved, onChange }: KeyringChoiceFieldsProps) => {
  const { translate } = useContext(I18nContext);

  const titleId = useId();
  const keyringLabelId = useId();
  const keyringNameInputId = useId();

  const { choice, compatibleKeyrings, defaultKeyringName } = resolved;

  const keyringOptions = compatibleKeyrings.map((keyring) => ({
    value: keyring.keyringId,
    label: keyring.label,
  }));
  const joinedKeyringOption =
    keyringOptions.find((option) => option.value === resolved.joinedKeyringId) ?? null;

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId}>{resolved.title}</h3>

      {compatibleKeyrings.length > 0 && (
        <div className="mb-3">
          <ChoiceChips
            label={translate('api.editor.key.request.attach.label')}
            options={[
              {
                value: 'existing' as const,
                label: translate('api.editor.key.request.attach.existing'),
              },
              {
                value: 'new' as const,
                label: translate('api.editor.key.request.attach.new'),
              },
            ]}
            value={choice.attach}
            onChange={(attach) =>
              onChange({
                ...choice,
                attach,
              })
            }
          />
        </div>
      )}

      {resolved.joinsKeyring && (
        <label id={keyringLabelId} className="form-label">
          {translate('api.editor.key.request.keyring.label')}
        </label>
      )}

      {resolved.joinsKeyring && (
        <Select
          aria-labelledby={keyringLabelId}
          classNamePrefix="reactSelect"
          placeholder={translate('Select')}
          options={keyringOptions}
          value={joinedKeyringOption}
          onChange={(option) =>
            onChange({
              ...choice,
              keyringId: option?.value,
            })
          }
        />
      )}

      {resolved.createsKeyring && (
        <>
          <label className="form-label" htmlFor={keyringNameInputId}>
            {translate('api.editor.key.request.keyring.name.label')}
          </label>
          <input
            id={keyringNameInputId}
            className="form-control mb-3"
            placeholder={translate({
              key: 'api.editor.key.request.keyring.name.placeholder',
              replacements: [defaultKeyringName],
            })}
            value={choice.newKeyringName}
            onChange={(e) =>
              onChange({
                ...choice,
                newKeyringName: e.target.value,
              })
            }
          />
          <InfoCallout>
            {translate({
              key: 'api.editor.key.request.keyring.name.help',
              replacements: [defaultKeyringName],
            })}
          </InfoCallout>
        </>
      )}
    </section>
  );
};
