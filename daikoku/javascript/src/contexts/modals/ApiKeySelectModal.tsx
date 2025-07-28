import React, { useContext, useState } from 'react';
import { I18nContext } from '../../contexts';
import {
  IApiKey,
  IFastPlan,
  ISubscription,
  ISubscriptionWithApiInfo,
  IUsagePlan,
} from '../../types';
import { IBaseModalProps } from './types';
import classNames from 'classnames';

export interface IApiKeySelectModalProps {
  onSubscribe: () => void;
  plan: IUsagePlan | IFastPlan;
  apiKeys: Array<ISubscriptionWithApiInfo>;
  extendApiKey: (key: ISubscription) => void;
}

export const ApiKeySelectModal = (
  props: IApiKeySelectModalProps & IBaseModalProps
) => {
  const [showApiKeys, toggleApiKeysView] = useState(false);
  const [showSelectOrCreateApiKey, toggleSelectOrCreateApiKey] = useState(true);

  const { translate } = useContext(I18nContext);

  const finalAction = () => {
    props.close();
    props.onSubscribe();
  };

  const extendApiKey = (apiKey: ISubscription) => {
    props.close();
    props.extendApiKey(apiKey);
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">
          {translate('apikey_select_modal.title')}
        </h5>
        <button
          type="button"
          className="btn-close"
          aria-label="Close"
          onClick={props.close}
        />
      </div>
      <div className="modal-body">
        {showSelectOrCreateApiKey && (
          <SelectOrCreateApiKey
            disableExtendButton={props.apiKeys.length <= 0}
            create={(o: boolean) => {
              if (o) finalAction();
              else {
                toggleSelectOrCreateApiKey(false);
                toggleApiKeysView(true);
              }
            }}
            aggregationApiKeysSecurity={props.plan.aggregationApiKeysSecurity}
          />
        )}
        {showApiKeys && (
          <ApiKeysView
            plan={props.plan}
            apiKeys={props.apiKeys}
            extendApiKey={extendApiKey}
          />
        )}
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={props.close}
        >
          {translate('Close')}
        </button>
      </div>
    </div>
  );
};

type ApiKeysViewProps = {
  plan: IUsagePlan | IFastPlan;
  apiKeys: Array<ISubscriptionWithApiInfo>;
  extendApiKey: (key: ISubscriptionWithApiInfo) => void;
};

const ApiKeysView = (props: ApiKeysViewProps) => {
  const { translate } = useContext(I18nContext);
  return (
    <div>
      <h5 className="modal-title" id="modal-title">
        {translate('apikey_select_modal.select_your_api_key')}
      </h5>
      <div className="team-selection__container">
        {props.apiKeys
          .filter((a) => !a.parent)
          .sort(
            (a, b) =>
              a.apiName.localeCompare(b.apiName) ||
              (a.customName || a.planName).localeCompare(
                b.customName || b.planName
              )
          )
          .map((apiKey) => {
            return (
              <div
                key={apiKey._id}
                className="team-selection team-selection__team selectable mt-1"
                onClick={() => props.extendApiKey(apiKey)}
              >
                <span className="ms-2">{`${apiKey.apiName}/${apiKey.customName || apiKey.planName || apiKey.planName
                  }`}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
};

type SelectOrCreateApiKeyProps = {
  create: (t: boolean) => void;
  disableExtendButton: boolean;
  aggregationApiKeysSecurity?: boolean;
};
const SelectOrCreateApiKey = (props: SelectOrCreateApiKeyProps) => {
  const Button = ({ onClick, message, icon, disabled }: any) => (
    <button
      type="button"
      className="btn"
      style={{ maxWidth: '200px', border: 'none' }}
      onClick={onClick}
      disabled={disabled}
    >
      <div
        className={classNames('d-flex flex-column p-2 aggregation-button', {
          disabled,
        })}
      >
        <div
          style={{ flex: 1, minHeight: '100px' }}
          className="d-flex align-items-center justify-content-center"
        >
          <i className={`fas fa-${icon} fa-2x`} />
        </div>
        <div
          style={{ flex: 1 }}
          className="d-flex align-items-start justify-content-center"
        >
          <span className="text-center px-3">{message}</span>
        </div>
      </div>
    </button>
  );

  const { translate } = useContext(I18nContext);

  return (
    <div className="d-flex justify-content-center">
      <Button
        onClick={() => props.create(true)}
        message={translate('aggregation.button.subscription.usual.label')}
        icon="plus"
      />
      {props.aggregationApiKeysSecurity && (
        <Button
          onClick={() => props.create(false)}
          disabled={props.disableExtendButton}
          message={
            props.disableExtendButton
              ? translate('aggregation.button.subscription.disable.label')
              : translate('aggregation.button.subscription.enable.label')
          }
          icon="key"
        />
      )}
    </div>
  );
};
