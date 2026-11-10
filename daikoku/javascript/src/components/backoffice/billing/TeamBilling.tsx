import { useContext, useEffect } from 'react';
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import { isError } from '../../../types';
import { Can, Spinner, read, stat } from '../../utils';
import { SubscriptionBillingStates } from './SubscriptionBillingStates';

export const TeamBilling = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  const { translate, Translation } = useContext(I18nContext);

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('Billing')}`;
  }, [currentTeam]);

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Billing">Billing</Translation>
            </h1>
            <SubscriptionBillingStates team={currentTeam} />
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error);
    return <></>;
  }
};
