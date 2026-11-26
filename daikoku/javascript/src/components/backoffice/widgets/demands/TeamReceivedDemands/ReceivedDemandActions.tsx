import { useContext } from 'react';

import { I18nContext } from '../../../../../contexts';
import { FeedbackButton } from '../../../../utils/FeedbackButton';

type ReceivedDemandActionsProps = {
  canRerunStep: boolean;
  onRerunStep: () => Promise<void>;
};

export const ReceivedDemandActions = ({ canRerunStep, onRerunStep }: ReceivedDemandActionsProps) => {
  const { translate } = useContext(I18nContext);

  return (
    <div className="d-flex justify-content-end align-items-center gap-1">
      {canRerunStep && (
        <FeedbackButton
          className="btn --secondary --small"
          onPress={onRerunStep}
          feedbackTimeout={100}
        >
          {translate('widget.demands.rerun-step')}
        </FeedbackButton>
      )}
    </div>
  );
};
