import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../../core';

export const MailTemplateButton = ({
  isTenantUpdated,
  openModal,
  save
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const navigate = useNavigate();

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="mb-3 row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <label className="col-xs-12 col-sm-2 col-form-label">
        {translateMethod('mailing_internalization.mail_template_tab')}
      </label>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-sm-10">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => {
            const RedirectToUI = () => navigate('/settings/internationalization/mail-template');
            if (isTenantUpdated()) {
              openModal({
                open: true,
                dontsave: () => RedirectToUI(),
                save: () => save().then(() => RedirectToUI()),
                title: translateMethod(
                  'unsaved.modifications.title',
                  false,
                  'Unsaved modifications'
                ),
                message: translateMethod(
                  'unsaved.modifications.message',
                  false,
                  'Your have unsaved modifications, do you want to save it before continue ?'
                ),
              });
            } else {
              RedirectToUI();
            }
          }}
        >
          {translateMethod('mailing_internalization.go_to_edit_template')}
        </button>
      </div>
    </div>
  );
};
