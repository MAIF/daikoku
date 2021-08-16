import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';

import * as Services from '../../../services';
import { openAssetSelectorModal } from '../../../core/modal/actions';
import { Translation } from '../../../locales';
import { BeautifulTitle } from '../../utils';
import { I18nContext } from '../../../core';

export const MimeTypeFilter = {
  image: (value) => value.startsWith('image'),
  css: (value) => value.indexOf('css') > -1,
  javascript: (value) => value.indexOf('javascript') > -1,
  font: (value) => value.indexOf('font') > -1,
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

  const { translateMethod } = useContext(I18nContext);

  const selectAssetAndCloseModal = () => {
    onSelect(selectedAsset);
    closeModal();
  };

  const filteredAssets = assets.filter(
    (asset) => !search || asset.title.toLowerCase().includes(search)
  );

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">
          <Translation i18nkey="Select an asset">
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
            placeholder={translateMethode('Find an assets')}
            className="form-control"
            onChange={(e) => setSearch(e.target.value)}
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
                      onDoubleClick={() => {
                        setSelectedAsset(asset);
                        selectAssetAndCloseModal();
                      }}
                      src={
                        asset.contentType.includes('svg')
                          ? asset.link
                          : `/asset-thumbnails/${asset.value}`
                      }
                      alt={translateMethode('Thumbnail')}
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
          <Translation i18nkey="Close">
            Close
          </Translation>
        </button>
        <button
          type="button"
          className="btn btn-outline-success"
          onClick={() => selectAssetAndCloseModal()}>
          <Translation i18nkey="Select">
            Select
          </Translation>
        </button>
      </div>
    </div>
  );
};

export function AssetChooserComponent(props) {
  const [state, setState] = useState({
    loading: true,
    assets: [],
    error: false,
  });

  const getTenantAssets = () =>
    Services.listTenantAssets(props.teamId).then((assets) =>
      assets.error ? [] :
        assets.map((asset) => ({
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

  const getTeamAssets = (team) =>
    Services.listAssets(team._id).then((assets) =>
      assets.error
        ? []
        : assets.map((asset) => ({
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

  useEffect(() => {
    getAssets(props.team);
  }, []);

  const getAssets = (team) => {
    let fetchAssets = () => new Promise((resolve) => resolve([]));
    if (props.tenantMode) {
      fetchAssets = () => getTenantAssets();
    } else if (!props.tenantMode && team._id) {
      fetchAssets = () => getTeamAssets(team);
    }

    fetchAssets()
      .then((assets) => {
        if (props.typeFilter) {
          setState({
            ...state,
            assets: assets.filter((asset) => props.typeFilter(asset.contentType)),
            loading: false,
          });
        } else {
          setState({ ...state, assets, loading: false });
        }
      })
      .catch((error) => setState({ ...state, error, loading: false }));
  }

  if (state.assets && state.loading) {
    return (
      <button type="button" className="btn btn-outline-success ml-1" disabled>
        <Translation i18nkey="loading">
          loading...
        </Translation>
      </button>
    );
  }

  if (state.error) {
    return (
      <BeautifulTitle title={state.error.message}>
        <button type="button" className="btn btn-outline-primary ml-1 cursor-help" disabled>
          <i
            className={classNames('fas', {
              'fa-user-circle mr-1': !!props.onlyPreview,
              'fa-file mr-1': !props.onlyPreview,
            })}
          />
          {props.label}
        </button>
      </BeautifulTitle>
    );
  }

  if (!state.assets.length) {
    return (
      <BeautifulTitle title={translateMethode('No assets found')}>
        <button type="button" className="btn btn-sm btn-access-negative ml-1 cursor-help" disabled>
          <i
            className={classNames('fas mr-1', {
              'fa-user-circle': !!props.onlyPreview,
              'fa-file': !props.onlyPreview,
            })}
          />
          {props.label}
        </button>
      </BeautifulTitle>
    );
  }

  return (
    <button
      type="button"
      className={props.classNames ? props.classNames : 'btn btn-access-negative ml-1'}
      onClick={() =>
        props.openAssetSelectorModal({
          open: true,
          assets: state.assets,
          onSelect: (asset) => props.onSelect(asset),
          onlyPreview: props.onlyPreview,
          panelView: true,
          currentLanguage: props.currentLanguage,
        })
      }>
      <i
        className={
          props.icon
            ? props.icon
            : classNames('fas mr-1', {
              'fa-user-circle': !!props.onlyPreview,
              'fa-file': !props.onlyPreview,
            })
        }
      />{' '}
      {props.label}
    </button>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openAssetSelectorModal: (modalProps) => openAssetSelectorModal(modalProps),
};

export const AssetChooserByModal = connect(
  mapStateToProps,
  mapDispatchToProps
)(AssetChooserComponent);
