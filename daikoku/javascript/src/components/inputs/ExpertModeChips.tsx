import { useContext } from 'react';

import { I18nContext } from '../../contexts';
import { GlobalContext } from '../../contexts/globalContext';
import { ChoiceChips } from './ChoiceChips';

export const ExpertModeChips = () => {
  const { translate } = useContext(I18nContext);
  const { expertMode, toggleExpertMode } = useContext(GlobalContext);

  return (
    <ChoiceChips
      label={translate('api.editor.mode.label')}
      options={[
        { value: false, label: translate('Standard mode') },
        { value: true, label: translate('Expert mode') },
      ]}
      value={expertMode}
      onChange={(expert) => expert !== expertMode && toggleExpertMode()}
    />
  );
};
