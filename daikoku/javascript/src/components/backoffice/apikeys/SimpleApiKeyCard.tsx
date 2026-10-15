import { isBefore } from 'date-fns';
import {
  IApi,
  ISubscription,
  ITeamSimple,
  IUsagePlan,
} from '../../../types';
import { useContext } from 'react';
import { I18nContext } from '../../../contexts';
import {
  BeautifulTitle,
  formatDate,
} from '../../utils';
import { toast } from 'sonner';
import {
  Copy
} from "lucide-react";


type SimpleApiKeyCardProps = {
  subscription: ISubscription,
  plan: IUsagePlan,
  api: IApi
  apiTeam: ITeamSimple
}

export const SimpleApiKeyCard = (props: SimpleApiKeyCardProps) => {
  const { translate } = useContext(I18nContext);

  const _customName = props.subscription.customName || props.plan.customName
  const isApiCMS = props.api.visibility === "AdminOnly" && props.api.name.includes("cms");
  const isSubscriptionExpired =
  props.subscription.validUntil &&
  isBefore(new Date(props.subscription.validUntil), new Date());

  return (
    <div className='api-subscription'>
      <div className="api-subscription__container flex-column flex-xl-row gap-3">
        <div className='api-subscription__infos'>
          <div className='api-subscription__infos__name'>{_customName}</div>
          <div className='d-flex gap-2'>
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.apikey.help")}>
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(`${props.subscription.keyring?.apiKey.clientId}:${props.subscription.keyring?.apiKey.clientSecret}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.apikey.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.token.help")}>
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(props.subscription.keyring?.integrationToken ?? '')
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.token.label")}
              </button>
            </BeautifulTitle>}
            {!isApiCMS && <BeautifulTitle title={translate("subscription.copy.basic.auth.help")}>
              <button className='btn --secondary --small' onClick={() => {
                navigator.clipboard
                  .writeText(`Basic ${btoa(`${props.subscription.keyring?.apiKey?.clientId}:${props.subscription.keyring?.apiKey?.clientSecret}`)}`)
                  .then(() =>
                    toast.info(translate('credential.copy.success'))
                  )
                  .catch(() =>
                    toast.warning(translate('credential.copy.error'))
                  );
              }}>
                <Copy className="me-1" />
                {translate("subscription.copy.basic.auth.label")}
              </button>
            </BeautifulTitle>}
            {!!isApiCMS && <BeautifulTitle title={translate("subscription.copy.cli.auth.help")}>
              <button className='btn --secondary --small'
                aria-label={translate("subscription.copy.cli.auth.aria.label")}
                onClick={() => {
                  navigator.clipboard
                    .writeText(`Basic ${btoa(`${props.subscription.keyring?.apiKey?.clientId}:${props.subscription.keyring?.apiKey?.clientSecret}`)}`)
                    .then(() =>
                      toast.info(translate('credential.copy.success'))
                    )
                    .catch(() =>
                      toast.warning(translate('credential.copy.error'))
                    );
                }}>
                <Copy className="me-1" />
                {translate("subscription.copy.cli.auth.label")}
              </button>
            </BeautifulTitle>}
          </div>
          <div className='api-subscription__infos__creation'>{
            translate("subscription.for")}
            <span className='ms-1 underline'>{props.api.name}</span>/<span
              className='me-1 underline'>{props.plan.customName}</span>
            {translate({
              key: 'subscription.created.at',
              replacements: [formatDate(props.subscription.createdAt, translate('date.locale'), translate('date.format.without.hours'))]
            })}
            <span className={isSubscriptionExpired ? 'ms-1 danger-color' : 'ms-1'}></span></div>
        </div>
      </div>
    </div>
  )
}
