import React, { useEffect, useState } from 'react';
import { t } from '../../../locales';
import * as Services from '../../../services';

export const ApiKeySelectModal = ({ closeModal, currentLanguage, team, onSubscribe, api, plan }) => {
    const [showApiKeys, toggleApiKeysView] = useState(false);
    const [showSelectOrCreateApiKey, toggleSelectOrCreateApiKey] = useState(true);

    const finalAction = () => {
        closeModal();
        onSubscribe();
    };

    const extendApiKey = apiKey => {
        Services.extendApiKey(api._id, apiKey._id, selectedTeams, plan._id)
            .then(res => {
                closeModal();
                console.log(res)
                console.log("à voir pour le reste")
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
                        create={o => {
                            if (o)
                                finalAction()
                            else {
                                toggleSelectOrCreateApiKey(false);
                                toggleApiKeysView(true);
                            }
                        }} />
                }
                {showApiKeys &&
                    <ApiKeysView
                        currentLanguage={currentLanguage}
                        team={team}
                        apiId={api._id}
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

const ApiKeysView = ({ apiId, team, currentLanguage, extendApiKey }) => {
    const [apiKeys, setApiKeys] = useState([]);

    useEffect(() => {
        Services.getTeamSubscriptions(apiId, team)
            .then(apiKeys => setApiKeys(apiKeys))
    }, []);

    return <div>
        <h1>{t('apikey_select_modal.of_team', currentLanguage)}</h1>
        {apiKeys.map(apiKey => (
            <div className="row mt-1" key={apiKey._id}>
                <span className="col">{`${apiKey.apiName}/${apiKey.customName || apiKey.planType}`}</span>
                <span className="col-3 text-center">
                    <button className="btn btn-sm btn-outline-success" onClick={() => extendApiKey(apiKey)}>
                        <i className="fas fa-arrow-right" />
                    </button>
                </span>
            </div>
        ))}
    </div>
}

const SelectOrCreateApiKey = ({ create }) => {
    const Button = ({ onClick, message, icon }) => <button type="button" className="btn" style={{ maxWidth: '200px' }} onClick={onClick}>
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
        <Button onClick={() => create(false)} message="Subscribe using an exisiting api key" icon="key" />
    </div>
}