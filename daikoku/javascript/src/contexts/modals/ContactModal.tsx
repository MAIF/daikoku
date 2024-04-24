import { useContext, useEffect, useState } from 'react';

import { I18nContext } from '../../contexts';
import * as Services from '../../services';
import { GlobalContext } from '../globalContext';
import { IBaseModalProps, IContactModalComponentProps } from './types';

export const ContactModal = (props: IContactModalComponentProps & IBaseModalProps) => {
  const [email, setEmail] = useState(props.email);
  const [name, setName] = useState(props.name);
  const [honeyName, setHoneyName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formRef, setFormRef] = useState<HTMLFormElement | null>(null);
  const [validity, setValidity] = useState(false);

  const { tenant } = useContext(GlobalContext)

  const { translate, Translation, language } = useContext(I18nContext);

  useEffect(() => {
    if (formRef) {
      setValidity(formRef.checkValidity());
    }
  }, [email, subject, body]);

  const sendEmail = () => {
    if (!honeyName && validity) {
      Services.sendEmails(name!, email!, subject, body, tenant._id, props.team, props.api, language)
        .then(() => props.close());
    }
  };

  return (<div className="modal-content">
    <div className="modal-header">
      <h5 className="modal-title">
        <Translation i18nkey="Contact request">Contact request</Translation>
      </h5>
      <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
    </div>

    <div className="modal-body">
      <div className="modal-description">
        <form ref={(ref) => setFormRef(ref)}>
          {!props.name && (<div className="mb-3">
            <label htmlFor="sender-name">
              <Translation i18nkey="Name">Name</Translation>
            </label>
            <input onChange={(e) => setName(e.target.value)} value={name} required type="text" className="form-control" id="sender-name" aria-describedby={translate('Enter your name')} placeholder={translate('Enter your name')} />
          </div>)}
          {!props.email && (<div className="mb-3">
            <label htmlFor="sender-email">
              <Translation i18nkey="Email address">Email address</Translation>
            </label>
            <input onChange={(e) => setEmail(e.target.value)} value={email} required type="email" className="form-control" id="sender-email" aria-describedby={translate('Enter email')} placeholder={translate('Enter email')} />
          </div>)}
          <div className="mb-3">
            <label htmlFor="subject">
              <Translation i18nkey="Subject">Subject</Translation>
            </label>
            <input onChange={(e) => setSubject(e.target.value)} value={subject} required type="text" className="form-control" id="subject" aria-describedby={translate('subject')} placeholder={translate('Subject')} />
          </div>
          <div className="mb-3">
            <label htmlFor="message">
              <Translation i18nkey="Message">Message</Translation>
            </label>
            <textarea onChange={(e) => setBody(e.target.value)} value={body} required name="message" id="body" cols={30} rows={7} className="form-control" aria-describedby={translate('Your message')} placeholder={translate('Your message')} />
          </div>

          <div className="mb-3 ohnohoney">
            <label htmlFor="name">
              <Translation i18nkey="Name">Name</Translation>
            </label>
            <input onChange={(e) => setHoneyName(e.target.value)} value={honeyName} type="text" className="form-control" id="name" aria-describedby={translate('Enter your name')} placeholder={translate('Enter your name')} />
          </div>
        </form>
      </div>
    </div>

    <div className="modal-footer">
      <button type="button" className="btn btn-outline-danger" onClick={() => props.close()}>
        <Translation i18nkey="Cancel">Cancel</Translation>
      </button>

      <button type="button" className="btn btn-outline-success" disabled={!validity} onClick={() => sendEmail()}>
        <Translation i18nkey="Send">Send</Translation>
      </button>
    </div>
  </div>);
};
