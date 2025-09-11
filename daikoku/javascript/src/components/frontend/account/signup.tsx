import { constraints, Form, format, type } from '@maif/react-forms';
import { md5 } from 'js-md5';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../../contexts';
import { IUserSimple, IValidationStep } from '../../../types';
import { GlobalContext } from '../../../contexts/globalContext';
import { Option } from '../../utils'

export const Signup = () => {
  const { translate, Translation } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext)

  const formStepAccountCreation = tenant.accountCreationProcess.find(s => s.type === 'form')
  const defaultSchema = {
    name: {
      type: type.string,
      label: translate('Name'),
      constraints: [constraints.required(translate('constraints.required.name'))],
    },
    email: {
      type: type.string,
      format: format.email,
      label: translate('Email address'),
      constraints: [
        constraints.required(translate('constraints.required.email')),
        constraints.email(translate('constraints.matches.email')),
      ],
    },
    avatar: {
      type: type.string,
      label: translate('Avatar'),
      // defaultValue: defaultAvatar,
      // render: AvatarInput,
    },
    password: {
      type: type.string,
      format: format.password,
      label: translate('Password'),
      constraints: [
        constraints.required(translate('constraints.required.password')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translate('constraints.matches.password')
        ),
      ],
    },
    confirmPassword: {
      type: type.string,
      format: format.password,
      label: translate('Confirm password'),
      constraints: [
        constraints.required(translate('constraints.required.confirmPassword')),
        constraints.oneOf(
          [constraints.ref('password')],
          translate('constraints.oneof.confirm.password')
        ),
      ],
    },
  };

  const navigate = useNavigate();

  const defaultAvatar = `https://www.gravatar.com/avatar/${md5('foo@foo.bar')}?size=128&d=robohash`;
  const [user, setUser] = useState<IUserSimple>();
  const [state, setState] = useState<'creation' | 'error' | 'done'>('creation');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('error')) {
      setState('error');
      setError(translate(`account.creation.error.${query.get('error')}`));
    }
  }, []);


  const createAccount = (data: any) => {
    setUser(data);
    return fetch('/account', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...data }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          setState('error');
          setError(res.error);
        } else {
          setUser(data);
          setState('done');
        }
      });
  };

  if (state === 'done') {
    return (
      <div className="col">
        <h1 className="h1-rwd-reduce text-center">
          <Translation i18nkey="Create account">Create account</Translation>
        </h1>
        <p style={{ width: '100%', textAlign: 'center' }}>
          <Translation i18nkey="create.account.done" replacements={[user!.email]}>
            You will receive an email at <b>{user!.email}</b> to finish your account creation
            process. You will have 15 minutes from now to finish your account creation process.
          </Translation>
        </p>
      </div>
    );
  }

  const schema = Option(formStepAccountCreation)
    .map(s => s as IValidationStep & {type: 'form'})
    .map(s => s.schema)
    .map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => ([k, {...v, label: v.label ? translate(v.label as string) : undefined}]))))
    .getOrElse(defaultSchema)

  return (
    <div className="section mx-auto mt-3 p-3" style={{ maxWidth: '448px' }}>
      {state === 'error' && error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <Form
        schema={schema}
        onSubmit={createAccount}
        value={user}
        className='signup-form'
        options={{
          actions: {
            cancel: {
              display: true,
              label: translate('Cancel'),
              action: () => navigate('/')
            },
            submit: {
              label: translate('Create account')
            }
          }
        }}
      />
    </div>
  );
};