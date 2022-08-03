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
  const [selectedAsset, setSelectedAsset] = useState({});
  const [search, setSearch] = useState();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const selectAssetAndCloseModal = () => {
    onSelect(selectedAsset);
    closeModal();
  };

  const filteredAssets = assets.filter(
    (asset: any) => !search || asset.title.toLowerCase().includes(search)
  );

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Select an asset">Select an asset</Translation>
        </h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal}/>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="asset-selection-body">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <input placeholder={translateMethod('Find an assets')} className="form-control" onChange={(e) => setSearch(e.target.value)}/>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className={classNames({
        'asset-selection__container--column': !onlyPreview,
        'asset-selection__container--row': onlyPreview,
        tiles: onlyPreview,
    })}>
            {filteredAssets.map((asset: any, idx: any) => {
        if (onlyPreview) {
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<div className={classNames('tile', {
                    // @ts-expect-error TS(2339): Property 'value' does not exist on type '{}'.
                    selected: asset.value === selectedAsset.value,
                })} key={idx}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <img onClick={() => setSelectedAsset(asset)} onDoubleClick={() => {
                    setSelectedAsset(asset);
                    selectAssetAndCloseModal();
                }} src={asset.contentType.includes('svg')
                    ? asset.link
                    : `/asset-thumbnails/${asset.value}`} alt={translateMethod('Thumbnail')}/>
                  </div>);
        }
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<div key={idx} className={classNames('asset-selection', {
                // @ts-expect-error TS(2339): Property 'value' does not exist on type '{}'.
                selected: asset.value === selectedAsset.value,
            })} onClick={() => setSelectedAsset(asset)}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <span className="ms-2">{asset.title}</span>
                </div>);
    })}
          </div>
        </div>

        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className={classNames('asset__preview', { open: !!(selectedAsset as any).title })}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {(selectedAsset as any).title && (<div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <p>file: {(selectedAsset as any).title}</p>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {(selectedAsset as any).desc && (selectedAsset as any).desc !== 'undefined' && (<em>{(selectedAsset as any).desc}</em>)}
            </div>)}
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Close">Close</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-success" onClick={() => selectAssetAndCloseModal()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Select">Select</Translation>
        </button>
      </div>
    </div>);
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<div className={classNames('tile', {
        // @ts-expect-error TS(2552): Cannot find name 'asset'. Did you mean 'assets'?
        selected: asset.value === (selectedAsset as any).value,
    // @ts-expect-error TS(2304): Cannot find name 'idx'.
    })} key={idx}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <img onClick={() => setSelectedAsset(asset)} onDoubleClick={() => {
        // @ts-expect-error TS(2304): Cannot find name 'asset'.
        setSelectedAsset(asset);
        selectAssetAndCloseModal();
    // @ts-expect-error TS(2304): Cannot find name 'asset'.
    }} src={asset.contentType.includes('svg')
        ? // @ts-expect-error TS(2304): Cannot find name 'asset'.
          asset.link
        : // @ts-expect-error TS(2304): Cannot find name 'asset'.
          `/asset-thumbnails/${asset.value}`} alt={translateMethod('Thumbnail')}/>
                  </div>);
              }

              return (<div key={idx} className={classNames('asset-selection', {
        selected: asset.value === (selectedAsset as any).value,
    })} onClick={() => setSelectedAsset(asset)}>
                  <span className="ms-2">{asset.title}</span>
                </div>);
            })}
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>

        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className={classNames('asset__preview', { open: !!selectedAsset.title })}>
          {/* @ts-expect-error TS(2304): Cannot find name 'selectedAsset'. */}
          {selectedAsset.title && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <p>file: {selectedAsset.title}</p>
              {/* @ts-expect-error TS(2304): Cannot find name 'selectedAsset'. */}
              {selectedAsset.desc && selectedAsset.desc !== 'undefined' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <em>{selectedAsset.desc}</em>
              )}
            </div>
          )}
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={() => closeModal()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Close">Close</Translation>
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          type="button"
          className="btn btn-outline-success"
          // @ts-expect-error TS(2304): Cannot find name 'selectAssetAndCloseModal'.
          onClick={() => selectAssetAndCloseModal()}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Select">Select</Translation>
        </button>
      </div>
    // @ts-expect-error TS(2304): Cannot find name 'div'.
    </div>
  );
};

export function AssetChooserComponent(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = useState({
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

  // @ts-expect-error TS(2345): Argument of type '() => () => boolean' is not assi... Remove this comment to see the full error message
  useEffect(() => {
    mounted = true;
    getAssets(props.team);

    return () => (mounted = false);
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
            // @ts-expect-error TS(2322): Type 'unknown' is not assignable to type 'never[]'... Remove this comment to see the full error message
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
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <button type="button" className="btn btn-outline-success ms-1" disabled>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="loading">loading...</Translation>
      </button>
    );
  }

  if (state.error) {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<BeautifulTitle title={(state.error as any).message}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-primary ms-1 cursor-help" disabled>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={classNames('fas', {
        'fa-user-circle me-1': !!props.onlyPreview,
        'fa-file me-1': !props.onlyPreview,
    })}/>
          {props.label}
        </button>
      </BeautifulTitle>);
  }

  if (!state.assets.length) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <BeautifulTitle title={translateMethod('No assets found')}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-access-negative ms-1 cursor-help" disabled>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <button
      type="button"
      className={props.classNames ? props.classNames : 'btn btn-access-negative ms-1'}
      onClick={() =>
        props.openAssetSelectorModal({
          open: true,
          assets: state.assets,
          onSelect: (asset: any) => props.onSelect(asset),
          onlyPreview: props.onlyPreview,
          panelView: true,
        })
      }
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
