import { constraints, Form, format, FormRef, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { md5 } from 'js-md5';
import { nanoid } from 'nanoid';
import React, { JSX, useContext, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useDaikokuBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { IState, ITenant, IUser } from '../../../types';
import { Can, daikoku, manage, Spinner } from '../../utils';
import { GlobalContext } from '../../../contexts/globalContext';
import { allowedAvatarFileTypes } from '../../utils/tenantUtils';

const Avatar = ({
  setValue,
  rawValues,
  getValue,
  value,
  onChange,
  tenant
}: {
  rawValues?: IUser;
  value?: any;
  onChange?: (param: any) => void;
  error?: boolean;
  getValue: (entry: string) => any;
  setValue?: (key: string, data: any) => void;
  defaultValue?: any;
  tenant: ITenant
}) => {
  const { Translation } = useContext(I18nContext);

  const setFiles = (files: FileList | null) => {
    const file = files && files[0];

    if (file) {
      const filename = file.name;
      const contentType = file.type;

      if (allowedAvatarFileTypes.includes(contentType)) {
        return Services.storeUserAvatar(filename, contentType, file)
          .then((res) => {
            if (res.error) {
              toast.error(res.error);
            } else {
              setValue!('pictureFromProvider', false);
              onChange!(`/user-avatar/${tenant._humanReadableId}/${res.id}`);
            }
          });
      } else {
        return Promise.reject(toast.error("file type not allowed"))
      }
    }
  };

  const setPictureFromProvider = () => {
    setValue!('pictureFromProvider', true);
  };

  const changePicture = (picture: string) => {
    if (rawValues?.pictureFromProvider) {
      setValue!('pictureFromProvider', false);
      onChange!(picture);
    } else {
      onChange!(picture);
    }
  };

  const setGravatarLink = () => {
    const email = getValue('email').toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    changePicture(url);
  };

  const isOtherOriginThanLocal = rawValues?.origins?.some((o) => o.toLowerCase() !== 'local');

  if (!isOtherOriginThanLocal) {
    return <></>;
  }
  return (
    <div className="">
      <div className="float-right mb-4 position-relative">
        <img
          src={`${rawValues?.picture}${rawValues?.picture.startsWith('http') ? '' : `?${Date.now()}`
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
        <div className="d-flex mt-1 justify-content-end">
          <button type="button" className="btn btn-outline-info me-1" onClick={setGravatarLink} disabled={!rawValues?.email}>
            <i className="fas fa-user-circle me-1" />
            <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
          </button>
          {isOtherOriginThanLocal && (
            <button
              type="button"
              className="btn btn-outline-info"
              onClick={setPictureFromProvider}
              disabled={!!rawValues?.pictureFromProvider}
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

const PictureUpload = (props: { setFiles: (l: FileList | null) => void }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files);
    setUploading(false);
  };

  const trigger = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };


  return (
    <div className="changePicture mx-3">
      <input
        ref={inputRef}
        type="file"
        className="form-control hide"
        accept="image/png, image/jpeg, image/jpg"
        onChange={e => setFiles(e)}
      />
      <button
        type="button"
        className="btn btn-outline-primary"
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
};

export const UserEdit = () => {
  const { tenant } = useContext(GlobalContext);
  useDaikokuBackOffice();
  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const navigate = useNavigate();
  const params = useParams();

  const queryClient = useQueryClient();
  const queryUser = useQuery({
    queryKey: ['user-infos'],
    queryFn: () => Services.findUserById(params.userId!)
  });

  const schema: Schema = {
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
    picture: {
      type: type.string,
      label: translate('Avatar'),
      render: (v): JSX.Element => Avatar({ ...v, tenant: tenant }),
      constraints: [
        constraints.url(
          translate({ key: 'constraints.format.url', replacements: [translate('Avatar')] })
        ),
      ],
    },
    isDaikokuAdmin: {
      type: type.bool,
      label: translate('Daikoku admin.'),
    },

    personalToken: {
      type: type.string,
      label: translate('Personal Token'),
      render: ({
        value,
        onChange
      }): JSX.Element => {
        const reloadToken = () => {
          onChange!(nanoid(32));
        };
        return (
          <div className="d-flex flex-row">
            <input className="form-control" disabled={true} value={value} />
            <button type="button" className="btn btn-outline-success ms-2" onClick={reloadToken}>
              {translate('Reload')}
            </button>
          </div>
        );
      },
    },
    metadata: {
      type: type.object,
      label: translate('Metadata'),
    },
  };

  const removeUser = (user: IUser) => {
    (confirm({ message: translate('remove.user.confirm') }))
      .then((ok) => {
        if (ok) {
          Services.deleteUserById(user._id)
            .then(() => {
              toast.success(translate({ key: 'remove.user.success', replacements: [user.name] }));
              navigate('/settings/users');
            });
        }
      });
  };

  const save = (u: IUser) => {
    Services.updateUserById(u)
      .then((updatedUser) => {
        toast.success(translate({ key: 'user.updated.success', replacements: [u.name] }));
        if (u.email !== queryUser.data?.email) {
          navigate(`/settings/users/${updatedUser._humanReadableId}`)
        } else {
          queryClient.invalidateQueries({ queryKey: ['user-infos'] })

        }
      });
  };

  const ref = useRef<FormRef>(undefined)
  if (queryUser.isLoading) {
    return <Spinner />;
  } else if (queryUser.data) {
    return (
      <Can I={manage} a={daikoku} dispatchError>
        <Form
          ref={ref}
          schema={schema}
          value={queryUser.data}
          onSubmit={save}
          footer={({ valid }) => {
            return (
              <div className="d-flex justify-content-end">
                <button className="btn btn-outline-danger" onClick={() => navigate('/settings/users')}>
                  <Translation i18nkey="Cancel">Cancel</Translation>
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => removeUser(queryUser.data)}
                >
                  <i className="fas fa-trash me-1" />
                  <Translation i18nkey="Delete">Delete</Translation>
                </button>
                <button className="btn btn-outline-success ms-2" onClick={valid}>
                  <Translation i18nkey="Save">Save</Translation>
                </button>
              </div>
            );
          }}
        />
      </Can>
    );
  } else {
    return (
      <div>Error while fetching user</div>
    )
  }



};
