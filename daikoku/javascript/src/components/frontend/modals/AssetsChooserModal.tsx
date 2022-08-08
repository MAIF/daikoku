import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';

import * as Services from '../../../services';
import { openAssetSelectorModal } from '../../../core/modal/actions';
import { BeautifulTitle } from '../../utils';
import { I18nContext } from '../../../core';

export const MimeTypeFilter = {
  image: (value: any) => value.startsWith('image'),
  css: (value: any) => value.indexOf('css') > -1,
  javascript: (value: any) => value.indexOf('javascript') > -1,
  font: (value: any) => value.indexOf('font') > -1,
};

export const AssetSelectorModal = ({
  closeModal,
  assets,
  onSelect,
  onlyPreview
}: any) => {
  const [selectedAsset, setSelectedAsset] = useState<any>({});
  const [search, setSearch] = useState<any>();

  const { translateMethod, Translation } = useContext(I18nContext);

  const selectAssetAndCloseModal = () => {
    onSelect(selectedAsset);
    closeModal();
  };

  const filteredAssets = assets.filter(
    (asset: any) => !search || asset.title.toLowerCase().includes(search)
  );

  return (<div className="modal-content">
    <div className="modal-header">
      <h5 className="modal-title">
        <Translation i18nkey="Select an asset">Select an asset</Translation>
      </h5>
      <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
    </div>
    <div className="modal-body">
      <div className="asset-selection-body">
        <input placeholder={translateMethod('Find an assets')} className="form-control" onChange={(e) => setSearch(e.target.value)} />
        <div className={classNames({
          'asset-selection__container--column': !onlyPreview,
          'asset-selection__container--row': onlyPreview,
          tiles: onlyPreview,
        })}>
          {filteredAssets.map((asset: any, idx: any) => {
            if (onlyPreview) {
              return (<div className={classNames('tile', {
                selected: asset.value === selectedAsset.value,
              })} key={idx}>
                <img onClick={() => setSelectedAsset(asset)} onDoubleClick={() => {
                  setSelectedAsset(asset);
                  selectAssetAndCloseModal();
                }} src={asset.contentType.includes('svg')
                  ? asset.link
                  : `/asset-thumbnails/${asset.value}`} alt={translateMethod('Thumbnail')} />
              </div>);
            }
            return (<div key={idx} className={classNames('asset-selection', {
              selected: asset.value === selectedAsset.value,
            })} onClick={() => setSelectedAsset(asset)}>
              <span className="ms-2">{asset.title}</span>
            </div>);
          })}
        </div>
      </div>

      <div className={classNames('asset__preview', { open: !!(selectedAsset as any).title })}>
        {(selectedAsset as any).title && (<div>
          <p>file: {(selectedAsset as any).title}</p>
          {(selectedAsset as any).desc && (selectedAsset as any).desc !== 'undefined' && (<em>{(selectedAsset as any).desc}</em>)}
        </div>)}
      </div>
    </div>
    <div className="modal-footer">
      <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
        <Translation i18nkey="Close">Close</Translation>
      </button>
      <button type="button" className="btn btn-outline-success" onClick={() => selectAssetAndCloseModal()}>
        <Translation i18nkey="Select">Select</Translation>
      </button>
    </div>
  </div>);
}

type AssetChooserProps = {
  teamId?: string,
  team: any,
  tenantMode: boolean,
  typeFilter: any,
  onlyPreview: any,
  label: string,
  classNames?: any,
  openAssetSelectorModal?: (props: any) => void, //FIXME: props not optional in-jected by redux ==> get it from redux hook instead
  onSelect: (asset: any) => void,
  icon?: string
}

export function AssetChooserComponent(props: AssetChooserProps) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = useState<any>({
    loading: true,
    assets: [],
    error: false,
  });

  const getTenantAssets = () =>
    Services.listTenantAssets(props.teamId)
      .then((assets) =>
        assets.error
          ? []
          : assets.map((asset: any) => ({
            label: asset.meta.filename + ' - ' + asset.meta.title,
            value: asset.meta.asset,
            filename: asset.meta.filename,
            title: asset.meta.title,
            desc: asset.meta.desc,
            contentType: asset.meta['content-type'],
            meta: asset.meta,
            link: `/tenant-assets/${asset.meta.asset}`
          }))
      );

  const getTeamAssets = (team: any) => Services.listAssets(team._id).then((assets) =>
    assets.error
      ? []
      : assets.map((asset: any) => ({
        label: asset.meta.filename + ' - ' + asset.meta.title,
        value: asset.meta.asset,
        filename: asset.meta.filename,
        title: asset.meta.title,
        desc: asset.meta.desc,
        contentType: asset.meta['content-type'],
        meta: asset.meta,
        link: `/team-assets/${team._id}/${asset.meta.asset}`
      }))
  );

  let mounted: any;

  useEffect(() => {
    mounted = true;
    getAssets(props.team);

    return () => { mounted = false };
  }, []);

  const getAssets = (team: any) => {
    let fetchAssets = () => new Promise((resolve) => resolve([]));
    if (props.tenantMode) {
      fetchAssets = () => getTenantAssets();
    } else if (!props.tenantMode && team._id) {
      fetchAssets = () => getTeamAssets(team);
    }

    fetchAssets()
      .then((assets) => {
        if (mounted) {
          if (props.typeFilter) {
            setState({
              ...state,
              assets: (assets as any).filter((asset: any) => props.typeFilter(asset.contentType)),
              loading: false,
            });
          } else {
            setState({ ...state, assets, loading: false });
          }
        }
      })
      .catch((error) => {
        if (mounted) setState({ ...state, error, loading: false });
      });
  };

  if (state.assets && state.loading) {
    return (
      <button type="button" className="btn btn-outline-success ms-1" disabled>
        <Translation i18nkey="loading">loading...</Translation>
      </button>
    );
  }

  if (state.error) {
    return (<BeautifulTitle title={(state.error as any).message}>
      <button type="button" className="btn btn-outline-primary ms-1 cursor-help" disabled>
        <i className={classNames('fas', {
          'fa-user-circle me-1': !!props.onlyPreview,
          'fa-file me-1': !props.onlyPreview,
        })} />
        {props.label}
      </button>
    </BeautifulTitle>);
  }

  if (!state.assets.length) {
    return (
      <BeautifulTitle title={translateMethod('No assets found')}>
        <button type="button" className="btn btn-access-negative ms-1 cursor-help" disabled>
          <i
            className={classNames('fas me-1', {
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
      className={props.classNames ? props.classNames : 'btn btn-access-negative ms-1'}
      onClick={() =>
        //FIXME: remove line after using redux hook
        //@ts-ignore
        props.openAssetSelectorModal({
          open: true,
          assets: state.assets,
          onSelect: (asset: any) => props.onSelect(asset),
          onlyPreview: props.onlyPreview,
          panelView: true,
        })
      }
    >
      <i
        className={
          props.icon
            ? props.icon
            : classNames('fas me-1', {
              'fa-user-circle': !!props.onlyPreview,
              'fa-file': !props.onlyPreview,
            })
        }
      />{' '}
      {props.label}
    </button>
  );
}


const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  openAssetSelectorModal: (modalProps: any) => openAssetSelectorModal(modalProps),
};

export const AssetChooserByModal = connect(
  mapStateToProps,
  mapDispatchToProps
)(AssetChooserComponent);
