import React, { useContext, useState } from 'react';
import { I18nContext } from '../../../core';

export const ApiKeySelectModal = ({
  closeModal,
  onSubscribe,
  plan,
  apiKeys,
  ...props
}: any) => {
  const [showApiKeys, toggleApiKeysView] = useState(false);
  const [showSelectOrCreateApiKey, toggleSelectOrCreateApiKey] = useState(true);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const finalAction = () => {
    closeModal();
    onSubscribe();
  };

  const extendApiKey = (apiKey: any) => {
    closeModal();
    props.extendApiKey(apiKey);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">{translateMethod('apikey_select_modal.title')}</h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {showSelectOrCreateApiKey && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <SelectOrCreateApiKey
            disableExtendButton={apiKeys.length <= 0}
            create={(o: any) => {
              if (o) finalAction();
              else {
                toggleSelectOrCreateApiKey(false);
                toggleApiKeysView(true);
              }
            }}
            aggregationApiKeysSecurity={plan.aggregationApiKeysSecurity}
          />
        )}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {showApiKeys && <ApiKeysView apiKeys={apiKeys} extendApiKey={extendApiKey} />}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          {translateMethod('Close', 'Close')}
        </button>
      </div>
    </div>
  );
};

const ApiKeysView = ({
  apiKeys,
  extendApiKey
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <h5 className="modal-title">{translateMethod('apikey_select_modal.select_your_api_key')}</h5>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="team-selection__container">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {apiKeys.map((apiKey: any) => <div
          key={apiKey._id}
          className="team-selection team-selection__team selectable mt-1"
          onClick={() => extendApiKey(apiKey)}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="ms-2">{`${apiKey.apiName}/${
            apiKey.customName || apiKey.planType
          }`}</span>
        </div>)}
      </div>
    </div>
  );
};

const SelectOrCreateApiKey = ({
  create,
  disableExtendButton,
  aggregationApiKeysSecurity
}: any) => {
  const Button = ({
    onClick,
    message,
    icon,
    disabled
  }: any) => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <button
      type="button"
      className="btn"
      style={{ maxWidth: '200px' }}
      onClick={onClick}
      disabled={disabled}
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="d-flex flex-column p-2"
        style={{
          border: '1px solid rgb(222, 226, 230)',
          minHeight: '196px',
          borderRadius: '8px',
        }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          style={{ flex: 1, minHeight: '100px' }}
          className="d-flex align-items-center justify-content-center"
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={`fas fa-${icon} fa-2x`} />
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={{ flex: 1 }} className="d-flex align-items-start justify-content-center">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="text-center px-3">{message}</span>
        </div>
      </div>
    </button>
  );

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex justify-content-center">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Button onClick={() => create(true)} message="Subscribe with a new api key" icon="plus" />
      {aggregationApiKeysSecurity && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Button
          onClick={() => create(false)}
          disabled={disableExtendButton}
          message={
            disableExtendButton
              ? 'No api keys are present in your team'
              : 'Subscribe using an existing api key'
          }
          icon="key"
        />
      )}
    </div>
  );
};
