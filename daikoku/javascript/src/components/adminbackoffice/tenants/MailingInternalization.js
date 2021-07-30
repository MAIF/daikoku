import React, { Suspense, useEffect, useState } from 'react';
import { Can, manage, tenant as TENANT } from '../../utils';
import { connect } from 'react-redux';
import { UserBackOffice } from '../../backoffice';
import { t, Translation } from '../../../locales';
import * as Services from '../../../services';
import { toastr } from 'react-redux-toastr';
import { Link, Route, Switch, useParams } from 'react-router-dom';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));

const MarkdownComponent = ({
    currentLanguage, team, value, translationKey, language,
    toggleTranslation, saveTranslation, handleInputChange, resetTranslation
}) => (
    <Suspense fallback={<div>loading ...</div>}>
        <div style={{ position: 'relative' }} className="my-2">
            <LazySingleMarkdownInput
                currentLanguage={currentLanguage}
                team={team}
                value={value}
                onChange={code => handleInputChange(translationKey, language, code)}
            />
            <div style={{ position: 'absolute', top: 0, right: 0 }}>
                <button type="button" onClick={() => toggleTranslation(translationKey)}
                    className="btn btn-outline-danger">
                    <i className="fas fa-times" />
                </button>
                <button type="button" onClick={() => resetTranslation(translationKey, language)}
                    className="btn btn-outline-info mx-1">
                    <i className="fas fa-undo" />
                </button>
                <button type="button" onClick={() => saveTranslation(translationKey, language)}
                    className="btn btn-outline-success">
                    <i className="fas fa-save" />
                </button>
            </div>
        </div>
    </Suspense>
)

const Collapse = ({ label, children, edited, toggleTranslation, translationKey }) => {

    function getRequiredVariables(str) {
        let dels = [];
        const words = [];
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '[')
                dels.push(i);
            else if (str[i] === ']' && dels.length > 0) {
                let pos = dels[dels.length - 1];
                dels.pop();

                const len = i - 1 - pos;
                words.push(str.substring(pos + 1, (pos < len ? len : len + pos) + 1))
            }
        }
        return words;
    }

    return <div onClick={() => toggleTranslation(translationKey)} style={{ cursor: 'pointer' }}>
        <div className="row">
            <div className="col-12 d-flex justify-space-between">
                <span style={{ fontWeight: 'bold', flex: 1 }}>{label}</span>
                <div style={{ flex: 1 }} className="text-center">
                    {getRequiredVariables(label).map((word, i) => (
                        <span className="badge badge-info mr-2" key={`translationKey${i}`}>[{word}]</span>
                    ))}
                </div>
                <button
                    type="button"
                    className="btn btn-access-negative btn-sm"
                    style={{ float: 'right' }}>
                    <i className={`fas fa-eye${!edited ? '' : '-slash'}`} />
                </button>
            </div>
        </div>
        {edited && children}
        <hr />
    </div>
}

function MailingInternalizationComponent({ currentLanguage, team }) {
    const [translations, setTranslations] = useState([]);
    const params = useParams()

    useEffect(() => {
        Services.getTranslations("mail")
            .then(res => setTranslations(res.translations))
    }, [])

    function saveTranslation(key, language) {
        Services.saveTranslation(
            translations.find(([k, _]) => k === key)[1].find(translation => translation.key === key && translation.language === language)
        )
            .then(res => {
                if (res.status === 200) {
                    toastr.success(t("Translation updated", currentLanguage))
                    res.json()
                        .then(translation => {
                            editTranslations(key, language, [
                                { action: _ => translation.lastModificationAt, field: 'lastModificationAt' },
                                { action: _ => false, field: 'edited' }
                            ])
                        })
                }
                else
                    toastr.error(t("Failed to save translation", currentLanguage))
            })
    }

    function handleInputChange(editedKey, language, value) {
        editTranslations(editedKey, language, [{ action: _ => value, field: 'value' }])
    }

    function toggleTranslation(editedKey) {
        setTranslations(translations.map(([key, values, edited]) => [key, values, key === editedKey ? (edited === undefined ? true : !edited) : edited]))
    }

    function resetTranslation(key, language) {
        Services.resetTranslation(
            translations.find(([k, _]) => k === key)[1].find(translation => translation.key === key && translation.language === language)
        ).then(res => {
            if (res.status === 200) {
                toastr.success(t("Translation reset", currentLanguage))
                res.json()
                    .then(translation => {
                        editTranslations(key, language, [
                            { action: _ => undefined, field: 'lastModificationAt' },
                            { action: _ => translation.value, field: 'value' }
                        ])
                    })
            }
            else
                toastr.error(t("Failed to reset translation", currentLanguage))
        })
    }

    function editTranslations(editedKey, language, actions) {
        setTranslations(translations.map(([key, values]) => {
            if (key === editedKey)
                return [
                    key,
                    values.map(translation => {
                        if (translation.key === editedKey && translation.language === language)
                            actions.forEach(({ action, field }) => translation[field] = action(translation[field]))
                        return translation
                    })
                ]
            return [key, values]
        }))
    }

    const basePath = '/settings/internationalization';

    console.log(translations)

    return (
        <UserBackOffice tab="Internalization">
            <Can I={manage} a={TENANT} dispatchError>
                <h1><Translation i18nkey="internationalization" language={currentLanguage} /></h1>
                <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
                    <li className="nav-item">
                        <Link
                            className={`nav-link ${params.domain === 'mail' ? 'active' : ''}`}
                            to={`/settings/internationalization/mail`}>
                            <i className="fas fa-envelope mr-1" />
                            <Translation i18nkey="Mail" language={currentLanguage}>
                                Mail
                            </Translation>
                        </Link>
                    </li>
                    <li className="nav-item">
                        <Link
                            className={`nav-link ${params.domain === 'front' ? 'active' : ''}`}
                            to={`/settings/internationalization/front`}>
                            <i className="fas fa-globe mr-1" />
                            <Translation i18nkey="Front office" language={currentLanguage}>
                                Front Office
                            </Translation>
                        </Link>
                    </li>
                </ul>

                <Switch>
                    <Route path={`${basePath}/mail`} render={() => (
                        <div className="col-12 pb-3">
                            <div className="d-flex justify-space-between py-3">
                                <span style={{ flex: 1 }} className="lead">Message text</span>
                                <span style={{ flex: 1 }} className="lead text-center">Required variables</span>
                                <span className="lead">Action</span>
                            </div>
                            {translations.map(([key, values, edited]) => (
                                <Collapse
                                    label={t(key, currentLanguage)}
                                    edited={edited === undefined ? false : edited}
                                    translationKey={key}
                                    toggleTranslation={toggleTranslation}
                                    key={`${key}-collapse`}>
                                    {values.map((v, i) => (
                                        <MarkdownComponent
                                            {...v}
                                            key={`${key}-${v.language}-${i}`}
                                            currentLanguage={currentLanguage}
                                            team={team}
                                            translationKey={key}
                                            toggleTranslation={toggleTranslation}
                                            saveTranslation={saveTranslation}
                                            resetTranslation={resetTranslation}
                                            handleInputChange={handleInputChange} />
                                    ))}
                                </Collapse>
                            ))}
                        </div>)}
                    />
                    <Route path={`${basePath}/front`} render={() => <p style={{ fontStyle: 'italic' }} className="text-center w-100">Edition of all front office text will be available in next version</p>} />
                </Switch>
            </Can>
        </UserBackOffice>
    )
}

const mapStateToProps = (state) => ({
    ...state.context,
});

export const MailingInternalization = connect(mapStateToProps)(MailingInternalizationComponent);