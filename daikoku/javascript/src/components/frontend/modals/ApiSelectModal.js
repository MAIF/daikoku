import Select from 'react-select';
import React, { useEffect, useState } from 'react';
import { t } from '../../../locales';
import * as Services from '../../../services';
import { toastr } from 'react-redux-toastr';

export const ApiSelectModal = ({ closeModal, currentLanguage, teamId, api, onClose }) => {
    const [apis, setApis] = useState([]);
    const [plan, setPlan] = useState();

    useEffect(() => {
        Services.getAllPlanOfApi(teamId, api._humanReadableId, api.currentVersion)
            .then(apis => {
                setApis(apis.flatMap(api => api.possibleUsagePlans.reduce((a, plan) => {
                    const value = { apiId: api._id, version: api.currentVersion, planId: plan._id }
                    const groupName = `${api._humanReadableId}/${api.currentVersion}`
                    const optGroup = a.find(grp => grp.label === groupName)
                    if (!optGroup)
                        return [...a, {
                            options: [{ label: plan.customName || plan.type, value }],
                            label: groupName
                        }]

                    return a.map(group => {
                        if (group.label === groupName)
                            group.options.push({ label: plan.customName || plan.type, value })

                        return group
                    })
                }, [])))
            });
    }, [])

    function clonePlan() {
        Services.cloneApiPlan(teamId, api._id, plan.value.apiId, plan.value.planId)
            .then(() => onClose())
            .then(() => closeModal())
    }

    return (
        <div className="modal-content">
            <div className="modal-header">
                <h5 className="modal-title">{t('api_select_modal.title', currentLanguage)}</h5>
                <button type="button" className="close" aria-label="Close" onClick={closeModal}>
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div className="modal-body">
                <Select
                    placeholder={t('Search', currentLanguage)}
                    options={apis}
                    onChange={setPlan}
                    classNamePrefix="reactSelect"
                />
            </div>
            <div className="modal-footer">
                <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
                    {t('Close', currentLanguage, 'Close')}
                </button>
                <button type="button" className="btn btn-outline-success" onClick={clonePlan}>
                    {t('Choose', currentLanguage, 'Close')}
                </button>
            </div>
        </div>
    );
};
