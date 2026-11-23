import { useContext } from 'react';

import { I18nContext } from '../../../../../contexts';
import { FeedbackButton } from '../../../../utils/FeedbackButton';

type PendingDemandActionsProps = {
  canResumePayment: boolean;
  onResumePayment: () => Promise<void>;
  canCancel: boolean;
  onCancel: () => void;
};

export const PendingDemandActions = ({
  canResumePayment,
  onResumePayment,
  canCancel,
  onCancel,
}: PendingDemandActionsProps) => {
  const { translate } = useContext(I18nContext);

  return (
    <div className="d-flex justify-content-end align-items-center gap-1">
      {canResumePayment && (
        <FeedbackButton
          className="btn --primary --small"
          onPress={onResumePayment}
          feedbackTimeout={100}
        >
          {translate('widget.demands.resume-payment')}
        </FeedbackButton>
      )}
      {canCancel && (
        <button type="button" className="btn --secondary --small" onClick={onCancel}>
          {translate('Cancel')}
        </button>
      )}
    </div>
  );
};
