import React, { useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { t } from '../../../locales';
import * as Services from '../../../services';

export const ApiKeySelectModal = ({ closeModal, currentLanguage, team, onSubscribe, api, plan }) => {
    const [showApiKeys, toggleApiKeysView] = useState(false);
    const [showSelectOrCreateApiKey, toggleSelectOrCreateApiKey] = useState(true);
    const [apiKeys, setApiKeys] = useState([]);

    useEffect(() => {
        Services.getAllTeamSubscriptions(team)
            .then(setApiKeys)
    }, []);

    const finalAction = () => {
        closeModal();
        onSubscribe();
    };

    const extendApiKey = apiKey => {
        Services.extendApiKey(api._id, apiKey._id, team, plan._id)
            .then(res => {
                closeModal();
                if(res.error) 
                    toastr.error(res.error)
                // else 
                //     window.location.reload()
            })
    }

    return (
        <div className="modal-content">
            <div className="modal-header">
                <h5 className="modal-title">{t('apikey_select_modal.title', currentLanguage)}</h5>
                <button type="button" className="close" aria-label="Close" onClick={closeModal}>
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div className="modal-body">
                {showSelectOrCreateApiKey &&
                    <SelectOrCreateApiKey
                        disableExtendButton={apiKeys.length <= 0}
                        create={o => {
                            if (o)
                                finalAction()
                            else {
                                toggleSelectOrCreateApiKey(false);
                                toggleApiKeysView(true);
                            }
                        }}
                        aggregationApiKeysSecurity={plan.aggregationApiKeysSecurity} />
                }
                {showApiKeys &&
                    <ApiKeysView
                        apiKeys={apiKeys}
                        currentLanguage={currentLanguage}
                        extendApiKey={extendApiKey} />
                }
            </div>
            <div className="modal-footer">
                <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
                    {t('Close', currentLanguage, 'Close')}
                </button>
            </div>
        </div>
    );
};

const ApiKeysView = ({ apiKeys, currentLanguage, extendApiKey }) => (
    <div>
        <h5 className="modal-title">{t('apikey_select_modal.select_your_api_key', currentLanguage)}</h5>
        <div className="team-selection__container">
            {apiKeys.map(apiKey =>
                <div
                    key={apiKey._id}
                    className="team-selection team-selection__team selectable mt-1"
                    onClick={() => extendApiKey(apiKey)}>
                    <span className="ml-2">{`${apiKey.apiName}/${apiKey.customName || apiKey.planType}`}</span>
                </div>
            )}
        </div>
    </div>
)

const SelectOrCreateApiKey = ({ create, disableExtendButton, aggregationApiKeysSecurity }) => {
    const Button = ({ onClick, message, icon, disabled }) => <button type="button" className="btn"
        style={{ maxWidth: '200px' }} onClick={onClick} disabled={disabled}>
        <div className="d-flex flex-column p-2" style={{
            border: "1px solid rgb(222, 226, 230)",
            minHeight: "196px",
            borderRadius: "8px"
        }}>
            <div style={{ flex: 1, minHeight: '100px' }}
                className="d-flex align-items-center justify-content-center">
                <i className={`fas fa-${icon} fa-2x`} />
            </div>
            <div style={{ flex: 1 }} className="d-flex align-items-start justify-content-center">
                <span className="text-center px-3">{message}</span>
            </div>
        </div>
    </button>

    return <div className="d-flex justify-content-center">
        <Button onClick={() => create(true)} message="Subscribe with a new api key" icon="plus" />
        {aggregationApiKeysSecurity && <Button onClick={() => create(false)}
            disabled={disableExtendButton}
            message={disableExtendButton ? "No api keys are present in your team" : "Subscribe using an existing api key"}
            icon="key" />}
    </div>
}