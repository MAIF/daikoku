import React, { useContext } from 'react';
import { AssetChooserByModal, MimeTypeFilter } from '../frontend';
import md5 from 'js-md5';
import { I18nContext } from '../../locales/i18n-context';

function Gravatar(props) {
  const { Translation } = useContext(I18nContext);
  const setGravatarLink = () => {
    const email = props.rawValue?.contact?.toLowerCase().trim() || '';
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    props.onChange(url);
  };

  return (
    <button type="button" className="btn btn-access" onClick={setGravatarLink}>
      <i className="fas fa-user-circle me-1" />
      <Translation i18nkey="gravatar.btn.label">Set avatar from Gravatar</Translation>
    </button>
  );
}

function AssetButton(props) {
  const { translateMethod } = useContext(I18nContext);

  return (
    <AssetChooserByModal
      typeFilter={MimeTypeFilter.image}
      onlyPreview
      tenantMode={false}
      team={props.team()}
      label={translateMethod('Set avatar from asset')}
      onSelect={(asset) => props.onChange(asset.link)}
    />
  );
}

export const AvatarChooser = (props) => {
  return (
    <div className="d-flex align-items-center">
      <div className="d-flex justify-content-start align-items-center mb-2">
        <div className="ms-1 avatar__container">
          <img src={props.rawValues.avatar} className="img-fluid" alt="avatar" />
        </div>
      </div>
      <div className="flex-grow-1 ms-3">
        <input className="mrf-input mb-3" value={props.value} onChange={props.onChange} />
        <div className="col-12 d-flex justify-content-end">
          <Gravatar {...props} />
          <AssetButton {...props} />
        </div>
      </div>
    </div>
  );
};
