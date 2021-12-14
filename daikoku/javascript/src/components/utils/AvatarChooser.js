import React, { useContext } from 'react';
import { AssetChooserByModal, MimeTypeFilter } from '../frontend';
import md5 from 'js-md5';
import { I18nContext } from '../../locales/i18n-context';

function Gravatar(props) {
  const { Translation } = useContext(I18nContext);
  const setGravatarLink = () => {
    const email = props.rawValue?.contact?.toLowerCase().trim() || '';
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    props.changeValue('avatar', url);
  };

  return (
    <button type="button" className="btn btn-access" onClick={setGravatarLink}>
      <i className="fas fa-user-circle mr-1" />
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
      onSelect={(asset) => props.changeValue('avatar', asset.link)}
    />
  );
}

export const AvatarChooser = (props) => {
  return (
    <div className="form-group row">
      <div className="col-12 d-flex justify-content-end">
        <Gravatar {...props} />
        <AssetButton {...props} />
      </div>
    </div>
  );
};
