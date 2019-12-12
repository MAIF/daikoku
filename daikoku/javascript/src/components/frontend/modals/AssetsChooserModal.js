import React, { Component, useState } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import Popover from 'react-popover';

import * as Services from '../../../services';
import { openModal, closeModal } from '../../../core/modal/actions';
import { t, Translation } from '../../../locales';

export const MimeTypeFilter = {
  image: value => value.startsWith('image'),
  css: value => value.indexOf('css') > -1,
  javascript: value => value.indexOf('javascript') > -1,
};

export const AssetSelectorModal = ({
  closeModal,
  assets,
  onSelect,
  onlyPreview,
  currentLanguage,
}) => {
  const [selectedAsset, setSelectedAsset] = useState({});
  const [search, setSearch] = useState();

  const selectAssetAndCloseModal = () => {
    onSelect(selectedAsset);
    closeModal();
  };

  const filteredAssets = assets.filter(
    asset => !search || asset.title.toLowerCase().includes(search)
  );

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          <Translation i18nkey="Select an asset" language={currentLanguage}>
            Select an asset
          </Translation>
        </h5>
        <button type="button" className="close" aria-label="Close" onClick={closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <div className="asset-selection-body">
          <input
            placeholder={t('Find an assets', currentLanguage)}
            className="form-control"
            onChange={e => setSearch(e.target.value)}
          />
          <div
            className={classNames({
              'asset-selection__container--column': !onlyPreview,
              'asset-selection__container--row': onlyPreview,
              tiles: onlyPreview,
            })}>
            {filteredAssets.map((asset, idx) => {
              if (onlyPreview) {
                return (
                  <div
                    className={classNames('tile', {
                      selected: asset.value === selectedAsset.value,
                    })}
                    key={idx}>
                    <img
                      onClick={() => setSelectedAsset(asset)}
                      src={`/asset-thumbnails/${asset.value}`}
                      alt={t('Thumbnail', currentLanguage)}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className={classNames('asset-selection', {
                    selected: asset.value === selectedAsset.value,
                  })}
                  onClick={() => setSelectedAsset(asset)}>
                  <span className="ml-2">{asset.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={classNames('asset__preview', { open: !!selectedAsset.title })}>
          {selectedAsset.title && (
            <div>
              <p>file: {selectedAsset.title}</p>
              {selectedAsset.desc && selectedAsset.desc !== 'undefined' && (
                <em>{selectedAsset.desc}</em>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer">
          <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
              <Translation i18nkey="Close" language={currentLanguage}>
                  Close
              </Translation>
          </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => selectAssetAndCloseModal()}>
          <Translation i18nkey="Select" language={currentLanguage}>
            Select
          </Translation>
        </button>
      </div>
    </div>
  );
};

export class AssetChooserComponent extends Component {
  state = {
    loading: true,
    assets: [],
    error: false,
    popoverIsOpen: false,
  };

  getTenantAssets = () =>
    Services.listTenantAssets(this.props.teamId).then(assets =>
      assets.map(asset => ({
        label: asset.meta.filename + ' - ' + asset.meta.title,
        value: asset.meta.asset,
        filename: asset.meta.filename,
        title: asset.meta.title,
        desc: asset.meta.desc,
        contentType: asset.meta['content-type'],
        meta: asset.meta,
        link: `/tenant-assets/${asset.meta.asset}`,
      }))
    );

  getTeamAssets = team =>
    Services.listAssets(team._id).then(assets =>
      assets.map(asset => ({
        label: asset.meta.filename + ' - ' + asset.meta.title,
        value: asset.meta.asset,
        filename: asset.meta.filename,
        title: asset.meta.title,
        desc: asset.meta.desc,
        contentType: asset.meta['content-type'],
        meta: asset.meta,
        link: `/team-assets/${team._id}/${asset.meta.asset}`,
      }))
    );

  componentDidMount() {
    this.getAssets(this.props.team);
  }

  // shouldComponentUpdate(nextProps,nexState) {
  // 	const shouldUpdate = this.state.loading || nextProps.currentTeam._id !== this.props.currentTeam._id;
  // 	console.debug(shouldUpdate)
  // 	return shouldUpdate;
  // }

  getAssets(team) {
    let fetchAssets = () => new Promise(resolve => resolve([]));
    if (this.props.tenantMode) {
      fetchAssets = () => this.getTenantAssets();
    } else if (!this.props.tenantMode && team._id) {
      fetchAssets = () => this.getTeamAssets(team);
    }

    fetchAssets()
      .then(assets => {
        if (this.props.typeFilter) {
          this.setState({
            assets: assets.filter(asset => this.props.typeFilter(asset.contentType)),
            loading: false,
          });
        } else {
          this.setState({ assets, loading: false });
        }
      })
      .catch(error => this.setState({ error, loading: false }));
  }

  toggle(toState = null) {
    this.setState({ popoverIsOpen: toState === null ? !this.state.popoverIsOpen : toState });
  }

  render() {
    if (this.state.assets && this.state.loading) {
      return (
        <button type="button" className="btn btn-outline-success ml-1" disabled>
          <Translation i18nkey="loading" language={this.props.currentLanguage}>
            loading...
          </Translation>
        </button>
      );
    }

    if (this.state.error) {
      return (
        <Popover isOpen={this.state.popoverIsOpen} body={this.state.error.message}>
          <button
            type="button"
            className="btn btn-outline-primary ml-1 cursor-help"
            onMouseEnter={() => this.toggle(true)}
            onMouseLeave={() => this.toggle(false)}
            disabled>
            <i
              className={classNames('fas', {
                'fa-user-circle mr-1': !!this.props.onlyPreview,
                'fa-file mr-1': !this.props.onlyPreview,
              })}
            />
            {this.props.label}
          </button>
        </Popover>
      );
    }

    if (!this.state.assets.length) {
      return (
        <Popover
          isOpen={this.state.popoverIsOpen}
          body={t('No assets found', this.props.currentLanguage)}>
          <button
            type="button"
            className="btn btn-outline-success ml-1 cursor-help"
            onMouseEnter={() =>
              this.setState({ popoverIsOpen: true }, () =>
                setTimeout(() => this.setState({ popoverIsOpen: false }), 2000)
              )
            }
            disabled>
            <i
              className={classNames('fas mr-1', {
                'fa-user-circle': !!this.props.onlyPreview,
                'fa-file': !this.props.onlyPreview,
              })}
            />
            {this.props.label}
          </button>
        </Popover>
      );
    }

    return (
      <button
        type="button"
        className="btn btn-outline-success ml-1"
        onClick={() =>
          this.props.openModal(
            {
              open: true,
              assets: this.state.assets,
              onSelect: asset => this.props.onSelect(asset),
              closeModal: this.props.closeModal,
              onlyPreview: this.props.onlyPreview,
              panelView: true,
              currentLanguage: this.props.currentLanguage,
            },
            'assetSelector',
            true
          )
        }>
        <i
          className={classNames('fas mr-1', {
            'fa-user-circle': !!this.props.onlyPreview,
            'fa-file': !this.props.onlyPreview,
          })}
        />{' '}
        {this.props.label}
      </button>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  closeModal: () => closeModal(),
  openModal: (modalProps, modalType) => openModal({ modalProps, modalType }),
};

export const AssetChooserByModal = connect(
  mapStateToProps,
  mapDispatchToProps
)(AssetChooserComponent);
