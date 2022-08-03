import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'js-m... Remove this comment to see the full error message
import md5 from 'js-md5';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import { Form, type, format, constraints } from '@maif/react-forms';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { I18nContext, updateUser } from '../../../core';
import { useUserBackOffice } from '../../../contexts';

const TwoFactorAuthentication = ({
  user
}: any) => {
  const [modal, setModal] = useState(false);
  const [error, setError] = useState();
  const [backupCodes, setBackupCodes] = useState('');

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const getQRCode = () => {
    Services.getQRCode().then((res) =>
      setModal({
        ...res,
        code: '',
      })
    );
  };

  const disable2FA = () => {
    (window.confirm(translateMethod('2fa.disable_confirm_message')) as any).then((ok: any) => {
    if (ok) {
        Services.disable2FA().then(() => {
            toastr.success(translateMethod('2fa.successfully_disabled_from_pr'));
            window.location.reload();
        });
    }
});
  };

  function copyToClipboard() {
    navigator.clipboard.writeText(user?.twoFactorAuthentication.backupCodes);
    toastr.success(translateMethod('2fa.copied'));
  }

  function verify() {
    if (!(modal as any).code || (modal as any).code.length !== 6) {
      setError(translateMethod('2fa.code_error'));
      // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
      setModal({ ...modal, code: '' });
    } else {
      Services.selfVerify2faCode((modal as any).code).then((res) => {
    if (res.error) {
        setError(translateMethod('2fa.wrong_code'));
        // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
        setModal({ ...modal, code: '' });
    }
    else {
        toastr.success(res.message);
        setBackupCodes(res.backupCodes);
    }
});
    }
  }

  return modal ? // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    (<div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {backupCodes ? (<div className="d-flex flex-column justify-content-center align-items-center w-50 mx-auto">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="my-3">{translateMethod('2fa.backup_codes_message')}</span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex w-100 mb-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input type="text" disabled={true} value={backupCodes} className="form-control"/>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-outline-success ms-1" type="button" onClick={() => {
            navigator.clipboard.writeText(backupCodes);
            toastr.success('Copied');
        }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-copy"/>
            </button>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-success" type="button" onClick={() => window.location.reload()}>
            {translateMethod('2fa.confirm')}
          </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        </div>) : (<div className="d-flex flex-column justify-content-center align-items-center p-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex justify-content-center align-items-center p-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex flex-column justify-content-center align-items-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="my-3 text-center w-75 mx-auto">
                {translateMethod('2fa.advice_scan')}
              </span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent((modal as any).qrcode)}`} style={{
            maxWidth: '250px',
            height: '250px',
        }}/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="w-75">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span className="my-3 text-center">
                {translateMethod('2fa.advice_enter_manually')}
              </span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <textarea type="text" style={{
            resize: 'none',
            background: 'none',
            fontWeight: 'bold',
            border: 0,
            color: 'black',
            letterSpacing: '3px',
        }} disabled={true} value={(modal as any).rawSecret.match(/.{1,4}/g).join(' ')} className="form-control"/>
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="w-75 mx-auto">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="mt-3">{translateMethod('2fa.enter_6_digits')}</span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="mb-3">{translateMethod('2fa.enter_a_code')}</span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {error && (<div className="alert alert-danger" role="alert">
                {error}
              </div>)}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input type="number" value={(modal as any).code} placeholder={translateMethod('2fa.insert_code')} onChange={(e) => {
            if (e.target.value.length < 7) {
                // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
                setError(null);
                // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
                setModal({ ...modal, code: e.target.value });
            }
        }} className="form-control my-3"/>

            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-outline-success" type="button" onClick={verify}>
              {translateMethod('2fa.complete_registration')}
            </button>
          </div>
        </div>)}
    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
    </div>) : (<>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="form-group row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {user?.twoFactorAuthentication?.enabled ? (<button onClick={disable2FA} className="btn btn-outline-danger" type="button">
              {translateMethod('2fa.disable_action')}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            </button>) : (<button onClick={getQRCode} className="btn btn-outline-success" type="button">
              {translateMethod('2fa.enable_action')}
            </button>)}
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {user?.twoFactorAuthentication?.enabled && (<div className="form-group row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <label className="col-xs-12 col-sm-2 col-form-label">
            {translateMethod('2fa.backup_codes')}
          </label>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-sm-10">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input type="text" disabled={true} value={user?.twoFactorAuthentication.backupCodes} className="form-control"/>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-outline-success ms-1" type="button" onClick={copyToClipboard}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-copy"/>
              </button>
            </div>
          </div>
        </div>)}
    </>);
};

const Avatar = ({
  setValue,
  rawValues,
  value,
  error,
  onChange,
  tenant
}: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const setFiles = (files: any) => {
    const file = files[0];
    const filename = file.name;
    const contentType = file.type;
    return Services.storeUserAvatar(filename, contentType, file).then((res) => {
      if (res.error) {
        toastr.error(res.error);
      } else {
        setValue('pictureFromProvider', false);
        onChange(`/user-avatar/${tenant._humanReadableId}/${res.id}`);
      }
    });
  };

  const setPictureFromProvider = () => {
    setValue('pictureFromProvider', true);
  };

  const changePicture = (picture: any) => {
    if (rawValues.pictureFromProvider) {
      setValue('pictureFromProvider', false);
      onChange(picture);
    } else {
      onChange(picture);
    }
  };

  const setGravatarLink = () => {
    const email = rawValues.email.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    changePicture(url);
  };

  const isOtherOriginThanLocal = rawValues?.origins?.some((o: any) => o.toLowerCase !== 'local');

  if (!isOtherOriginThanLocal) {
    return null;
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="float-right mb-4 position-relative">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <img
          src={`${rawValues?.picture}${
            rawValues?.picture?.startsWith('http') ? '' : `?${Date.now()}`
          }`}
          style={{
            width: 100,
            borderRadius: '50%',
            backgroundColor: 'white',
          }}
          alt="avatar"
          className="mx-3"
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <PictureUpload setFiles={setFiles} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => changePicture(e.target.value)}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex mt-1 justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button type="button" className="btn btn-outline-primary me-1" onClick={setGravatarLink}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-user-circle me-1" />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
          </button>
          {isOtherOriginThanLocal && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={setPictureFromProvider}
              // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'bo... Remove this comment to see the full error message
              disabled={rawValues.pictureFromProvider ? 'disabled' : null}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-user-circle me-1" />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Set avatar from auth. provider">
                Set avatar from auth. Provider
              </Translation>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PictureUpload = (props: any) => {
  const [uploading, setUploading] = useState(false);

  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const setFiles = (e: any) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files);
    setUploading(false);
  };

  const trigger = () => {
    input.click();
  };

  let input: any;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="changePicture mx-3">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <input
        ref={(r) => (input = r)}
        type="file"
        className="form-control hide"
        onChange={setFiles}
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <button
        type="button"
        className="btn btn-outline-secondary"
        disabled={uploading}
        onClick={trigger}
        style={{ width: 100, height: 100, borderRadius: '50%' }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {uploading && <i className="fas fa-spinner" />}
        {!uploading && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="text-white">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Change your picture">Change your picture</Translation>
          </div>
        )}
      </button>
    </div>
  );
};

export const MyProfile = () => {
  useUserBackOffice();

  const [user, setUser] = useState();
  const [tab, setTab] = useState('infos');

  const { tenant, connectedUser } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, setLanguage, language, Translation, languages } =
    useContext(I18nContext);

  const navigate = useNavigate();

  const formSchema = {
    name: {
      type: type.string,
      label: translateMethod('Name'),
      constraints: [constraints.required(translateMethod('constraints.required.name'))],
    },
    email: {
      type: type.string,
      format: format.email,
      label: translateMethod('Email address'),
      constraints: [
        constraints.required(translateMethod('constraints.required.email')),
        constraints.email(translateMethod('constraints.matches.email')),
      ],
    },
    picture: {
      type: type.string,
      label: translateMethod('Avatar'),
      render: (v: any) => Avatar({ ...v, tenant: tenant }),
      constraints: [
        constraints.required(translateMethod('constraints.required.avatar')),
        constraints.url(
          translateMethod('constraints.format.url', false, '', translateMethod('Avatar'))
        ),
      ],
    },
    defaultLanguage: {
      type: type.string,
      format: format.select,
      label: translateMethod('Default language'),
      defaultValue: languages.find((l: any) => l.value === tenant.defaultLanguage),
      options: languages,
    },
  };

  const formFlow = ['picture', 'name', 'email', 'defaultLanguage'];

  const changePasswordSchema = {
    oldPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('profile.security.oldPassword'),
      constraints: [constraints.required(translateMethod('constraints.required.oldPassword'))],
    },
    newPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('profile.security.newPassword'),
      constraints: [
        constraints.required(translateMethod('constraints.required.newPassword')),
        constraints.matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,1000}$/,
          translateMethod('constraint.matches.password')
        ),
      ],
    },
    confirmNewPassword: {
      type: type.string,
      format: format.password,
      label: translateMethod('profile.security.confirmPassword'),
      constraints: [
        constraints.required(translateMethod('constraints.required.newPassword')),
        constraints.oneOf(
          [constraints.ref('newPassword')],
          translateMethod('constraint.oneof.confirm.password')
        ),
      ],
    },
  };

  useEffect(() => {
    // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
    Services.me(connectedUser._id).then((user) => {
      setUser(user);
      if (user.defaultLanguage && user.defaultLanguage !== language)
        setLanguage(user.defaultLanguage);
    });
  }, []);

  const save = (data: any) => {
    Services.updateUserById(data).then((user) => {
      setUser(user);
      updateUser(user)(dispatch);

      if (language !== user.defaultLanguage) setLanguage(user.defaultLanguage);

      toastr.success(
        translateMethod('user.updated.success', false, 'user successfully updated', user.name)
      );
    });
  };

  const removeUser = () => {
    (window
    .confirm(translateMethod('delete account', false, 'Are you sure you want to delete your account ? This action cannot be undone ...')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteSelfUserById().then(() => {
            navigate('/logout');
        });
    }
});
  };

  const updatePassword = ({
    oldPassword,
    newPassword
  }: any) => {
    Services.updateMyPassword(oldPassword, newPassword).then((user) => {
      if (user.error) {
        toastr.error(translateMethod(user.error, false));
      } else {
        setUser(user);
        updateUser(user)(dispatch);

        toastr.success(
          translateMethod(
            'user.password.updated.success',
            false,
            'Your password has been successfully updated'
          )
        );
      }
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="container-fluid">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ul className="nav nav-tabs flex-column flex-sm-row mb-3 mt-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <li className="nav-item">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className={`nav-link cursor-pointer ${tab === 'infos' ? 'active' : ''}`}
              onClick={() => setTab('infos')}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Informations">Informations</Translation>
            </span>
          </li>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <li className="nav-item">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className={`nav-link cursor-pointer ${tab === 'security' ? 'active' : ''}`}
              onClick={() => setTab('security')}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Security">AccountSecurity</Translation>
            </span>
          </li>
        </ul>
        {tab === 'infos' && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Form
            flow={formFlow}
            // @ts-expect-error TS(2322): Type '{ name: { type: "string"; label: any; constr... Remove this comment to see the full error message
            schema={formSchema}
            value={user}
            onSubmit={save}
            footer={({ valid }) => {
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="d-flex mt-3" style={{ justifyContent: 'flex-end' }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    style={{ marginLeft: 5 }}
                    onClick={removeUser}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-trash me-1" />
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="Delete my profile">Delete my profile</Translation>
                  </button>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    style={{ marginLeft: 5 }}
                    type="button"
                    className="btn btn-outline-success"
                    onClick={valid}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-save me-1" />
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Save">Save</Translation>
                    </span>
                  </button>
                </div>
              );
            }}
          />
        )}
        {tab === 'security' && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-6">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="row">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <h4>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Translation i18nkey="profile.security.updatePassword">
                    Update password
                  </Translation>
                </h4>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Form
                  schema={changePasswordSchema}
                  onSubmit={updatePassword}
                  footer={({ valid }) => {
                    return (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <div className="d-flex justify-content-end">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <button
                          type="button"
                          className="btn btn-outline-success mb-2"
                          onClick={valid}
                        >
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <span>
                            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                            <Translation i18nkey="profile.security.updatePassword">
                              Update password
                            </Translation>
                          </span>
                        </button>
                        {/* TODO: forgot password link */}
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-6">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h4>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="2fa">Two-factor authentication</Translation>
              </h4>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <TwoFactorAuthentication user={user} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
