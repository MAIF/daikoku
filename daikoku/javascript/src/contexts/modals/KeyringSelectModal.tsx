import classNames from 'classnames';
import { useContext, useState } from 'react';
import { I18nContext } from '../../contexts';
import {
  IFastPlan,
  ISubscription,
  ISubscriptionWithApiInfo,
  IUsagePlan
} from '../../types';
import { IBaseModalProps } from './types';
import { ArrowRight, Key, Plus } from "lucide-react";

/** A keyring (trousseau) the user may pick to add the new subscription into.
 * `subscription` is the representative subscription carrying that keyring ;
 * `aggregated` is true when the keyring already gathers more than one key. */
export interface IKeyringOption {
  keyringId: string;
  apiName: string;
  planName: string;
  customName?: string | null;
  count: number;
  aggregated: boolean;
  subscription: ISubscription;
}

export interface IKeyringSelectModalProps {
  onSubscribe: () => void;
  plan: IUsagePlan | IFastPlan;
  keyrings: Array<IKeyringOption>;
  onSelectKeyring: (key: ISubscription) => void;
}

export const KeyringSelectModal = (
  props: IKeyringSelectModalProps & IBaseModalProps
) => {
  const [showKeyrings, toggleKeyringsView] = useState(false);
  const [showSelectOrCreateKeyring, toggleSelectOrCreateKeyring] = useState(true);

  const { translate } = useContext(I18nContext);

  const finalAction = () => {
    props.close();
    props.onSubscribe();
  };

  const selectKeyring = (subscription: ISubscription) => {
    props.close();
    props.onSelectKeyring(subscription);
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
        {showSelectOrCreateKeyring && (
          <SelectOrCreateKeyring
            disableExtendButton={props.keyrings.length <= 0}
            create={(o: boolean) => {
              if (o) finalAction();
              else {
                toggleSelectOrCreateKeyring(false);
                toggleKeyringsView(true);
              }
            }}
            aggregationApiKeysSecurity={props.plan.aggregationApiKeysSecurity}
          />
        )}
        {showKeyrings && (
          <KeyringsView keyrings={props.keyrings} onSelectKeyring={selectKeyring} />
        )}
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="btn --secondary"
          onClick={props.close}
        >
          {translate('Close')}
        </button>
      </div>
    </div>
  );
};

type KeyringsViewProps = {
  keyrings: Array<IKeyringOption>;
  onSelectKeyring: (key: ISubscription) => void;
};

const KeyringsView = (props: KeyringsViewProps) => {
  const { translate } = useContext(I18nContext);
  const keyrings = [...props.keyrings].sort((a, b) =>
    (a.customName ?? a.planName).localeCompare(b.customName ?? b.planName)
  );
  return (
    <div>
      <h5 className="modal-title mb-3" id="modal-title">
        {translate('apikey_select_modal.select_your_keyring')}
      </h5>
      <div className="d-flex flex-column gap-2">
        {keyrings.map((keyring) => (
          <div
            key={keyring.keyringId}
            className="keyring-option selectable d-flex align-items-center justify-content-between p-3"
            role="button"
            onClick={() => props.onSelectKeyring(keyring.subscription)}
          >
            <div className="d-flex align-items-center gap-3">
              <Key />
              {/* <i className="fas fa-key fa-lg keyring-option__icon" /> */}
              <div className="d-flex flex-column">
                <strong>{keyring.customName ?? keyring.planName}</strong>
                <small className="text-muted">
                  {keyring.apiName}{keyring.customName ? '' : ` · ${keyring.planName}`}
                </small>
                {keyring.aggregated && (
                  <span className="badge badge-custom align-self-start mt-1">
                    {translate({
                      key: 'keyring_select_modal.keys_count',
                      replacements: [String(keyring.count)],
                    })}
                  </span>
                )}
              </div>
            </div>
            <span className="btn btn-sm btn-outline-primary">
              {translate('keyring_select_modal.join')}
              <ArrowRight className='ms-2' />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

type SelectOrCreateKeyringProps = {
  create: (t: boolean) => void;
  disableExtendButton: boolean;
  aggregationApiKeysSecurity?: boolean;
};
const SelectOrCreateKeyring = (props: SelectOrCreateKeyringProps) => {
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
          {icon}
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
        icon={<Plus />}
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
          icon={<Key />}
        />
      )}
    </div>
  );
};
