import React, { useState, useEffect, useContext } from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { I18nContext } from '../../../core';

const ContactModalComponent = (props) => {
  const [email, setEmail] = useState(props.email);
  const [name, setName] = useState(props.name);
  const [honeyName, setHoneyName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formRef, setFormRef] = useState(undefined);
  const [validity, setValidity] = useState(false);

  const { translateMethod, Translation, language } = useContext(I18nContext);

  useEffect(() => {
    if (formRef) {
      setValidity(formRef.checkValidity());
    }
  }, [email, subject, body]);

  const sendEmail = () => {
    if (!honeyName && validity) {
      console.debug({language})
      Services.sendEmails(name, email, subject, body, props.tenant._id, props.team, props.api, language)
        .then(
          () => props.closeModal()
        );
    }
  };

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          <Translation i18nkey="Contact request">Contact request</Translation>
        </h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal} />
      </div>

      <div className="modal-body">
        <div className="modal-description">
          <form ref={(ref) => setFormRef(ref)}>
            {!props.name && (
              <div className="mb-3">
                <label htmlFor="sender-name">
                  <Translation i18nkey="Name">Name</Translation>
                </label>
                <input
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                  required
                  type="text"
                  className="form-control"
                  id="sender-name"
                  aria-describedby={translateMethod('Enter your name')}
                  placeholder={translateMethod('Enter your name')}
                />
              </div>
            )}
            {!props.email && (
              <div className="mb-3">
                <label htmlFor="sender-email">
                  <Translation i18nkey="Email address">Email address</Translation>
                </label>
                <input
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  required
                  type="email"
                  className="form-control"
                  id="sender-email"
                  aria-describedby={translateMethod('Enter email')}
                  placeholder={translateMethod('Enter email')}
                />
              </div>
            )}
            <div className="mb-3">
              <label htmlFor="subject">
                <Translation i18nkey="Subject">Subject</Translation>
              </label>
              <input
                onChange={(e) => setSubject(e.target.value)}
                value={subject}
                required
                type="text"
                className="form-control"
                id="subject"
                aria-describedby={translateMethod('subject')}
                placeholder={translateMethod('Subject')}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="message">
                <Translation i18nkey="Message">Message</Translation>
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
                aria-describedby={translateMethod('Your message')}
                placeholder={translateMethod('Your message')}
              />
            </div>

            <div className="mb-3 ohnohoney">
              <label htmlFor="name">
                <Translation i18nkey="Name">Name</Translation>
              </label>
              <input
                onChange={(e) => setHoneyName(e.target.value)}
                value={honeyName}
                type="text"
                className="form-control"
                id="name"
                aria-describedby={translateMethod('Enter your name')}
                placeholder={translateMethod('Enter your name')}
              />
            </div>
          </form>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>

        <button
          type="button"
          className="btn btn-outline-success"
          disabled={!validity ? 'disabled' : undefined}
          onClick={() => sendEmail()}
        >
          <Translation i18nkey="Send">Send</Translation>
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
