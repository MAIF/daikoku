import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';

import { t, Translation } from '../../../locales';
import * as Services from '../../../services';

const ContactModalComponent = (props) => {
  const [email, setEmail] = useState(props.email);
  const [name, setName] = useState(props.name);
  const [honeyName, setHoneyName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formRef, setFormRef] = useState(undefined);
  const [validity, setValidity] = useState(false);

  useEffect(() => {
    if (formRef) {
      setValidity(formRef.checkValidity());
    }
  }, [email, subject, body]);

  const sendEmail = () => {
    if (!honeyName && validity) {
      Services.sendEmails(
        name,
        email,
        subject,
        body,
        props.tenant._id,
        props.team,
        props.api,
        props.currentLanguage
      ).then(() => props.closeModal());
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          <Translation i18nkey="Contact request" language={props.currentLanguage}>
            Contact request
          </Translation>
        </h5>
        <button type="button" className="close" aria-label="Close" onClick={props.closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <div className="modal-body">
        <div className="modal-description">
          <form ref={(ref) => setFormRef(ref)}>
            {!props.name && (
              <div className="form-group">
                <label htmlFor="sender-name">
                  <Translation i18nkey="Name" language={props.currentLanguage}>
                    Name
                  </Translation>
                </label>
                <input
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                  required
                  type="text"
                  className="form-control"
                  id="sender-name"
                  aria-describedby={t('Enter your name', props.currentLanguage)}
                  placeholder={t('Enter your name', props.currentLanguage)}
                />
              </div>
            )}
            {!props.email && (
              <div className="form-group">
                <label htmlFor="sender-email">
                  <Translation i18nkey="Email address" language={props.currentLanguage}>
                    Email address
                  </Translation>
                </label>
                <input
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  required
                  type="email"
                  className="form-control"
                  id="sender-email"
                  aria-describedby={t('Enter email', props.currentLanguage)}
                  placeholder={t('Enter email', props.currentLanguage)}
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="subject">
                <Translation i18nkey="Subject" language={props.currentLanguage}>
                  Subject
                </Translation>
              </label>
              <input
                onChange={(e) => setSubject(e.target.value)}
                value={subject}
                required
                type="text"
                className="form-control"
                id="subject"
                aria-describedby={t('subject', props.currentLanguage)}
                placeholder={t('Subject', props.currentLanguage)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="message">
                <Translation i18nkey="Message" language={props.currentLanguage}>
                  Message
                </Translation>
              </label>
              <textarea
                onChange={(e) => setBody(e.target.value)}
                value={body}
                required
                name="message"
                id="body"
                cols="30"
                rows="7"
                className="form-control"
                aria-describedby={t('Your message', props.currentLanguage)}
                placeholder={t('Your message', props.currentLanguage)}
              />
            </div>

            <div className="form-group ohnohoney">
              <label htmlFor="name">
                <Translation i18nkey="Name" language={props.currentLanguage}>
                  Name
                </Translation>
              </label>
              <input
                onChange={(e) => setHoneyName(e.target.value)}
                value={honeyName}
                type="text"
                className="form-control"
                id="name"
                aria-describedby={t('Enter your name', props.currentLanguage)}
                placeholder={t('Enter your name', props.currentLanguage)}
              />
            </div>
          </form>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          <Translation i18nkey="Cancel" language={props.currentLanguage}>
            Cancel
          </Translation>
        </button>

        <button
          type="button"
          className="btn btn-outline-success"
          disabled={!validity ? 'disabled' : undefined}
          onClick={() => sendEmail()}>
          <Translation i18nkey="Send" language={props.currentLanguage}>
            Send
          </Translation>
        </button>
      </div>
    </div>
  );
};

ContactModalComponent.propTypes = {
  closeModal: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const ContactModal = connect(mapStateToProps)(ContactModalComponent);
