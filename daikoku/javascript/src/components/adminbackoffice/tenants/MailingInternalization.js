import React, { Suspense } from 'react';
import { Can, manage, tenant as TENANT } from '../../utils';
import { connect } from 'react-redux';
import { UserBackOffice } from '../../backoffice';
import { t, Translation } from '../../../locales';
import { useEffect, useState } from 'react';
import * as Services from '../../../services';
import { toastr } from 'react-redux-toastr';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));

const MarkdownComponent = ({
    currentLanguage, team, value, translationKey, language, toggleTranslation, saveTranslation, handleInputChange
}) => (
    <Suspense fallback={<div>loading ...</div>}>
        <div style={{ position: 'relative' }}>
            <LazySingleMarkdownInput
                currentLanguage={currentLanguage}
                team={team}
                value={value}
                onChange={code => handleInputChange(translationKey, language, code)}
            />
            <div style={{ position: 'absolute', top: 0, right: 0 }}>
                <button type="button" onClick={() => toggleTranslation(translationKey, language)}
                    className="btn btn-outline-danger">
                    <i className="fas fa-times" />
                </button>
                <button type="button" onClick={() => saveTranslation(translationKey, language)}
                    className="btn ml-1 btn-outline-success">
                    <i className="fas fa-save" />
                </button>
            </div>
        </div>
    </Suspense>
)

const TranslationComponent = ({ language, value, translationKey, lastModificationAt, toggleTranslation, resetTranslation }) => (
    <div className="input-group mt-1">
        <div className="input-group-prepend">
            <span className="input-group-text" style={{ minWidth: '50px' }}>{language}</span>
        </div>

        <textarea className="form-control"
            value={value}
            disabled
            style={{
                resize: 'none',
                backgroundColor: "#fff",
                color: "#000",
                borderColor: "rgb(206, 212, 218)"
            }}></textarea>

        <div className="input-group-append">
            <span className="input-group-text"
                onClick={() => toggleTranslation(translationKey, language)} style={{ cursor: 'pointer' }}>
                <i className="fas fa-edit fa-xs" />
            </span>
            {lastModificationAt && <span className="input-group-text"
                onClick={() => resetTranslation(translationKey, language)} style={{ cursor: 'pointer' }}>
                <i className="fas fa-undo fa-xs" />
            </span>}
        </div>
    </div>
)

function MailingInternalizationComponent({ currentLanguage, team }) {
    const [translations, setTranslations] = useState([]);

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

    function toggleTranslation(editedKey, language) {
        editTranslations(editedKey, language, [{ action: edited => !edited ? true : false, field: 'edited' }])
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

    return (
        <UserBackOffice tab="Internalization">
            <Can I={manage} a={TENANT} dispatchError>
                <div className="row">
                    <h1><Translation i18nkey="internationalization" language={currentLanguage} /></h1>
                    <div className="container">
                        {translations.map(([key, values]) => (
                            <div className="row d-flex flex-column mb-3" key={key}>
                                <span style={{ fontWeight: 'bold' }}>{key}</span>
                                <div>
                                    {values.map(({ edited, ...v }, i) => (
                                        edited ?
                                            <MarkdownComponent
                                                {...v}
                                                key={`${key}-${v.language}-${i}`}
                                                currentLanguage={currentLanguage}
                                                team={team}
                                                translationKey={key}
                                                toggleTranslation={toggleTranslation}
                                                saveTranslation={saveTranslation}
                                                handleInputChange={handleInputChange} /> :
                                            <TranslationComponent
                                                {...v}
                                                key={`${key}-${v.language}-${i}`}
                                                translationKey={key}
                                                toggleTranslation={toggleTranslation}
                                                resetTranslation={resetTranslation}
                                            />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Can>
        </UserBackOffice>
    )
}

const mapStateToProps = (state) => ({
    ...state.context,
});

export const MailingInternalization = connect(mapStateToProps)(MailingInternalizationComponent);