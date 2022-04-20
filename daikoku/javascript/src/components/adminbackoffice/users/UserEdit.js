import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import faker from 'faker';
import md5 from 'js-md5';
import { toastr } from 'react-redux-toastr';
import { Form, constraints, type, format } from '@maif/react-forms'

import * as Services from '../../../services';
import { Can, manage, daikoku, Spinner } from '../../utils';
import { I18nContext } from '../../../core';
import { useDaikokuBackOffice } from '../../../contexts';
import { useSelector } from 'react-redux';

const Avatar = ({ setValue, rawValues, value, onChange, tenant }) => {
  const { Translation } = useContext(I18nContext);

  const setFiles = (files) => {
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

  const changePicture = (picture) => {
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

  const isOtherOriginThanLocal = rawValues?.origins?.some((o) => o.toLowerCase !== 'local');

  if (!isOtherOriginThanLocal) {
    return null;
  }
  return (
    <div className="">
      <div className="float-right mb-4 position-relative">
        <img
          src={`${rawValues?.picture}${rawValues?.picture?.startsWith('http') ? '' : `?${Date.now()}`
            }`}
          style={{
            width: 100,
            borderRadius: '50%',
            backgroundColor: 'white',
          }}
          alt="avatar"
          className="mx-3"
        />
        <PictureUpload setFiles={setFiles} />
      </div>
      <div className="">
        <input
          type="text"
          className="form-control"
          value={value}
          onChange={(e) => changePicture(e.target.value)}
        />
        <div className="d-flex mt-1 justify-content-end">
          <button type="button" className="btn btn-outline-primary me-1" onClick={setGravatarLink}>
            <i className="fas fa-user-circle me-1" />
            <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
          </button>
          {isOtherOriginThanLocal && (
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={setPictureFromProvider}
              disabled={rawValues.pictureFromProvider ? 'disabled' : null}
            >
              <i className="fas fa-user-circle me-1" />
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

const PictureUpload = (props) => {
  const [uploading, setUploading] = useState(false);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files);
    setUploading(false);
  };

  const trigger = () => {
    input.click();
  };

  let input;

  return (
    <div className="changePicture mx-3">
      <input
        ref={(r) => (input = r)}
        type="file"
        className="form-control hide"
        onChange={setFiles}
      />
      <button
        type="button"
        className="btn btn-outline-secondary"
        disabled={uploading}
        onClick={trigger}
        style={{ width: 100, height: 100, borderRadius: '50%' }}
      >
        {uploading && <i className="fas fa-spinner" />}
        {!uploading && (
          <div className="text-white">
            <Translation i18nkey="Change your picture">Change your picture</Translation>
          </div>
        )}
      </button>
    </div>
  );
}

export const UserEdit = () => {
  const tenant = useSelector(s => s.context.tenant);
  useDaikokuBackOffice();
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [user, setUser] = useState();
  const [create, setCreate] = useState(false);

  const schema = {
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
      render: (v) => Avatar({ ...v, tenant: tenant }),
      constraints: [
        constraints.nullable(),
        constraints.url(
          translateMethod('constraints.format.url', false, '', translateMethod('Avatar'))
        ),
      ],
    },
    isDaikokuAdmin: {
      type: type.bool,
      label: translateMethod('Daikoku admin.')
    },

    personalToken: {
      type: type.string,
      label: translateMethod('Personal Token'),
      render: (({ value, onChange }) => {
        const reloadToken = () => {
          onChange(faker.random.alphaNumeric(32))
        }
        return (
          <div className="d-flex flex-row">
            <input className="form-control" disabled={true} value={value} />
            <button
              type="button"
              className="btn btn-outline-success ms-2"
              onClick={reloadToken}>
              {translateMethod('Reload')}
            </button>
          </div>
        )
      })
    },
    metadata: {
      type: type.object,
      label: translateMethod('Metadata')
    }
  }

  useEffect(() => {
    if (location && location.state && location.state.newUser) {
      setUser({
        ...location.state.newUser,
        personalToken: faker.random.alphaNumeric(32),
      });
      setCreate(true);
    } else {
      Services.findUserById(params.userId)
        .then(setUser);
    }
  }, []);

  const removeUser = () => {
    window.confirm(translateMethod('remove.user.confirm'))
      .then((ok) => {
        if (ok) {
          Services.deleteUserById(user._id).then(() => {
            toastr.info(
              translateMethod(
                'remove.user.success',
                false,
                `user ${user.name} is successfully deleted`,
                user.name
              )
            );
            navigate('/settings/users');
          });
        }
      });
  };

  const save = (u) => {
    if (create) {
      Services.createUser(u)
        .then(() => {
          toastr.success(
            translateMethod(
              'user.created.success',
              false,
              `user ${user.name} successfully created`,
              user.name
            )
          );
        });
    } else {
      Services.updateUserById(u)
        .then((updatedUser) => {
          setUser(updatedUser)
          setCreate(false)
          toastr.success(
            translateMethod(
              'user.updated.success',
              false,
              `user ${user.name} successfully updated`,
              user.name
            )
          );
        });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row d-flex justify-content-start align-items-center mb-2">
        {!user && <h1>User</h1>}
        {user && (
          <h1 className="h1-rwd-reduce ms-2">
            {user.name} - {user.email}
          </h1>
        )}
      </div>
      {user && (
        <div className="row">
            <Form
              schema={schema}
              value={user}
              onSubmit={setUser}
              footer={({ reset, valid }) => {
                return (
                  <div className="d-flex justify-content-end">
                    <button className="btn btn-outline-danger" onClick={reset}>
                      <Translation i18nkey="Cancel">Cancel</Translation>
                    </button>
                    {!create && (
                      <button
                        type="button"
                        className="btn btn-outline-danger ms-2"
                        onClick={removeUser}
                      >
                        <i className="fas fa-trash me-1" />
                        <Translation i18nkey="Delete">Delete</Translation>
                      </button>
                    )}
                    <button className="btn btn-outline-success ms-2" onClick={valid}>
                      {create && <Translation i18nkey="Save">Create</Translation>}
                      {!create && <Translation i18nkey="Save">Save</Translation>}
                    </button>
                  </div>
                );
              }}
            />
        </div>
      )}
    </Can>
  );
}
