import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { I18nContext } from '../../../core';

type ContactModalComponentProps = {
    closeModal: (...args: any[]) => any;
};

const ContactModalComponent = (props: ContactModalComponentProps) => {
  const [email, setEmail] = useState((props as any).email);
  const [name, setName] = useState((props as any).name);
  const [honeyName, setHoneyName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formRef, setFormRef] = useState(undefined);
  const [validity, setValidity] = useState(false);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation, language } = useContext(I18nContext);

  useEffect(() => {
    if (formRef) {
      setValidity((formRef as any).checkValidity());
    }
  }, [email, subject, body]);

  const sendEmail = () => {
    if (!honeyName && validity) {
      Services.sendEmails(name, email, subject, body, (props as any).tenant._id, (props as any).team, (props as any).api, language).then(() => props.closeModal());
    }
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Contact request">Contact request</Translation>
        </h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={props.closeModal}/>
      </div>

      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="modal-description">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <form ref={(ref) => setFormRef(ref)}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {!(props as any).name && (<div className="mb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <label htmlFor="sender-name">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="Name">Name</Translation>
                </label>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <input onChange={(e) => setName(e.target.value)} value={name} required type="text" className="form-control" id="sender-name" aria-describedby={translateMethod('Enter your name')} placeholder={translateMethod('Enter your name')}/>
              </div>)}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {!(props as any).email && (<div className="mb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <label htmlFor="sender-email">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="Email address">Email address</Translation>
                </label>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <input onChange={(e) => setEmail(e.target.value)} value={email} required type="email" className="form-control" id="sender-email" aria-describedby={translateMethod('Enter email')} placeholder={translateMethod('Enter email')}/>
              </div>)}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="mb-3">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <label htmlFor="subject">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Subject">Subject</Translation>
              </label>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input onChange={(e) => setSubject(e.target.value)} value={subject} required type="text" className="form-control" id="subject" aria-describedby={translateMethod('subject')} placeholder={translateMethod('Subject')}/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="mb-3">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <label htmlFor="message">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Message">Message</Translation>
              </label>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <textarea onChange={(e) => setBody(e.target.value)} value={body} required name="message" id="body" cols="30" rows="7" className="form-control" aria-describedby={translateMethod('Your message')} placeholder={translateMethod('Your message')}/>
            </div>

            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="mb-3 ohnohoney">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <label htmlFor="name">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="Name">Name</Translation>
              </label>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input onChange={(e) => setHoneyName(e.target.value)} value={honeyName} type="text" className="form-control" id="name" aria-describedby={translateMethod('Enter your name')} placeholder={translateMethod('Enter your name')}/>
            </div>
          </form>
        </div>
      </div>

      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => props.closeModal()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Cancel">Cancel</Translation>
        </button>

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-success" disabled={!validity ? 'disabled' : undefined} onClick={() => sendEmail()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Send">Send</Translation>
        </button>
      </div>
    </div>);
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

export const ContactModal = connect(mapStateToProps)(ContactModalComponent);
