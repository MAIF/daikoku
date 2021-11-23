import React, { useContext } from 'react';
import { I18nContext } from '../../../../core';

export const MailTemplateButton = ({ history, isTenantUpdated, openModal, save}) => {
  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label">
        {translateMethod('mailing_internalization.mail_template_tab')}
      </label>
      <div className="col-sm-10">
        <button 
          type="button"
          className="btn btn-outline-success"
          onClick={() => {
            const RedirectToUI = () => history.push('/settings/internationalization/mail-template');
            if (isTenantUpdated()) {
              openModal({
                open: true,
                dontsave: () => RedirectToUI(),
                save: () => save().then(() => RedirectToUI()),
                title: translateMethod('unsaved.modifications.title', false, 'Unsaved modifications'),
                message: translateMethod(
                  'unsaved.modifications.message',
                  false,
                  'Your have unsaved modifications, do you want to save it before continue ?'
                ),
              });
            } else {
              RedirectToUI();
            }
          }}>
          {translateMethod('mailing_internalization.go_to_edit_template')}
        </button>
      </div>
    </div>
  );
};
