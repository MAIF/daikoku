import React, { Component } from 'react';
import { AssetChooserByModal, MimeTypeFilter } from '../frontend';
import md5 from 'js-md5';
import { t, Translation } from '../../locales';

class Gravatar extends Component {
  setGravatarLink = () => {
    const email = this.props.rawValue.contact.toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    this.props.changeValue('avatar', url);
  };

  render() {
    return (
      <button type="button" className="btn btn-access" onClick={this.setGravatarLink}>
        <i className="fas fa-user-circle mr-1" />
        <Translation i18nkey="gravatar.btn.label">
          Set avatar from Gravatar
        </Translation>
      </button>
    );
  }
}

class AssetButton extends Component {
  render() {
    return (
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        tenantMode={false}
        team={this.props.team()}
        label={t('Set avatar from asset', this.props.currentLanguage)}
        onSelect={(asset) => this.props.changeValue('avatar', asset.link)}
      />
    );
  }
}

export class AvatarChooser extends Component {
  render() {
    return (
      <div className="form-group row">
        <div className="col-12 d-flex justify-content-end">
          <Gravatar {...this.props} />
          <AssetButton {...this.props} />
        </div>
      </div>
    );
  }
}
