/* eslint-disable react/display-name */
import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { UserBackOffice } from '..';
import { Table } from '../../inputs';
import { Can, manage, asset, Spinner, tenant as TENANT } from '../../utils';
import { openWysywygModal } from '../../../core/modal';
import { I18nContext } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

const mimeTypes = [
  { label: '.adoc Ascii doctor', value: 'text/asciidoc' },
  { label: '.avi	AVI : Audio Video Interleaved', value: 'video/x-msvideo' },
  { label: '.gif	fichier Graphics Interchange Format (GIF)', value: 'image/gif' },
  { label: '.jpg	image JPEG', value: 'image/jpeg' },
  { label: '.svg  image SVG', value: 'image/svg+xml' },
  { label: '.md	Markown file', value: 'text/markdown' },
  { label: '.mpeg	vidéo MPEG', value: 'video/mpeg' },
  {
    label: '.odp OpenDocument presentation document ',
    value: 'application/vnd.oasis.opendocument.presentation',
  },
  {
    label: '.ods OpenDocument spreadsheet document ',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
  },
  {
    label: '.odt OpenDocument text document ',
    value: 'application/vnd.oasis.opendocument.text',
  },
  { label: '.png	fichier Portable Network Graphics', value: 'image/png' },
  { label: '.pdf	Adobe Portable Document Format (PDF)', value: 'application/pdf' },
  { label: '.webm fichier vidéo WEBM', value: 'video/webm' },
  {
    label: '.html	fichier HyperText Markup Language (HTML)',
    value: 'text/html',
    tenantModeOnly: true,
  },
  { label: '.js fichier javascript', value: 'text/javascript', tenantModeOnly: true },
  { label: '.css fichier css', value: 'text/css', tenantModeOnly: true },
  { label: '.woff Web Open Font Format', value: 'application/font-woff', tenantModeOnly: true },
  { label: '.woff2 Web Open Font Format 2', value: 'application/font-woff', tenantModeOnly: true },
  {
    label: '.eot Embedded OpenType ',
    value: 'application/vnd.ms-fontobject',
    tenantModeOnly: true,
  },
];

const maybeCreateThumbnail = (id, file) => {
  return new Promise((s) => {
    if (
      file.type === 'image/gif' ||
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image.jpg'
    ) {
      const reader = new FileReader();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      reader.onload = function (event) {
        var img = new Image();
        img.onload = function () {
          canvas.width = 128; //img.width;
          canvas.height = 128; //img.height;
          ctx.drawImage(img, 0, 0, 128, 128);
          const base64 = canvas.toDataURL();
          canvas.toBlob((blob) => {
            Services.storeThumbnail(id, blob).then(() => {
              s(base64);
            });
          });
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      s('data:image/png;base64,');
    }
  });
};

const handleAssetType = (tenantMode, type, translateMethod) => {
  return new Promise(function (resolve, reject) {
    if (tenantMode) {
      return resolve(true);
    } else if (
      (type === 'text/html' ||
        type === 'text/css' ||
        type === 'text/javascript' ||
        type === 'application/x-javascript',
      type === 'font/openntype')
    ) {
      return reject(translateMethod('content type is not allowed'));
    } else {
      return resolve(true);
    }
  });
};

const ReplaceButton = (props) => {
  const [file, setFile] = useState();
  const [input, setInput] = useState();
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (file) {
      maybeCreateThumbnail(props.asset.meta.asset, file)
        .then(() => {
          if (props.tenantMode) {
            Services.updateTenantAsset(props.asset.meta.asset, props.asset.contentType, file);
          } else {
            Services.updateAsset(
              props.teamId,
              props.asset.meta.asset,
              props.asset.contentType,
              file
            );
          }
        })
        .then(() => props.postAction());
    }
  }, [file]);

  const trigger = () => {
    input.click();
  };

  return (
    <>
      <button type="button" onClick={trigger} className="btn btn-sm btn-outline-primary">
        <i className="fas fa-retweet" />
      </button>
      <input
        ref={(r) => setInput(r)}
        type="file"
        multiple
        className="form-control hide"
        onChange={(e) => {
          const file = e.target.files[0];
          if (e.target.files.length > 1) {
            props.displayError(translateMethod('error.replace.files.multi'));
          } else if (props.asset.contentType !== file.type) {
            props.displayError(translateMethod('error.replace.files.content.type'));
          } else {
            setFile(file);
          }
        }}
      />
    </>
  );
};

const FileInput = (props) => {
  const [uploading, setUploading] = useState(false);
  const [input, setInput] = useState(undefined);

  const { Translation } = useContext(I18nContext);

  const setFiles = (e) => {
    const files = e.target.files;
    setUploading(true);
    props.setFiles(files).then(() => setUploading(false));
  };

  const trigger = () => {
    input.click();
  };

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
      <input
        ref={(r) => setInput(r)}
        type="file"
        multiple
        className="form-control hide"
        onChange={setFiles}
      />
      <button
        type="button"
        className="btn btn-outline-success pl"
        disabled={uploading}
        onClick={trigger}
      >
        {uploading && <i className="fas fa-spinner mr-1" />}
        {!uploading && <i className="fas fa-upload mr-1" />}
        <Translation i18nkey="Select file">Select file</Translation>
      </button>
    </div>
  );
};

const AddAsset = (props) => {
  const { translateMethod, Translation } = useContext(I18nContext);
  return (
    <div className="form-group row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div className="col-sm-10">
        <button
          type="button"
          className="btn btn-access-negative"
          title={translateMethod('Add asset')}
          disabled={props.disabled ? 'disabled' : undefined}
          onClick={() => props.addAsset()}
        >
          <i className="fas fa-plus mr-1" />
          <Translation i18nkey="Add asset">Add asset</Translation>
        </button>
      </div>
    </div>
  );
};

const AssetsListComponent = ({ currentTeam, tenant, tenantMode, openWysywygModal }) => {
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({});
  const [loading, setLoading] = useState(true);
  const [assetList, setAssetList] = useState([]);
  const [error, setError] = useState(undefined);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    setLoading(false);
  }, [error, assetList]);

  useEffect(() => {
    fetchAssets();

    document.title = `${tenantMode ? tenant.title : currentTeam.name} - ${translateMethod(
      'Asset',
      true
    )}`;
  }, []);

  const flow = ['filename', 'title', 'description', 'contentType', 'input', 'add'];

  const schema = {
    filename: { type: 'string', props: { label: translateMethod('Asset filename') } },
    title: { type: 'string', props: { label: translateMethod('Asset title') } },
    description: { type: 'string', props: { label: translateMethod('Description') } },
    contentType: {
      type: 'select',
      props: {
        label: translateMethod('Content-Type'),
        possibleValues: mimeTypes
          .filter((mt) => (tenantMode ? true : !mt.tenantModeOnly))
          .map(({ label, value }) => ({ label, value })),
      },
    },
    input: {
      type: FileInput,
      props: { setFiles: (f) => setFiles(f) },
    },
    add: {
      type: AddAsset,
      disabled: Object.keys(newAsset).length === 0,
      props: {
        addAsset: () => addAsset(),
      },
    },
  };

  const columns = [
    {
      Header: translateMethod('Filename'),
      style: { textAlign: 'left' },
      accessor: (item) => (item.meta && item.meta.filename ? item.meta.filename : '--'),
    },
    {
      Header: translateMethod('Title'),
      style: { textAlign: 'left' },
      accessor: (item) => (item.meta && item.meta.title ? item.meta.title : '--'),
    },
    {
      Header: translateMethod('Description'),
      style: { textAlign: 'left' },
      accessor: (item) => (item.meta && item.meta.desc ? item.meta.desc : '--'),
    },
    {
      Header: translateMethod('Thumbnail'),
      style: { textAlign: 'left' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const item = original;
        const type = item.meta['content-type'];
        if (
          type === 'image/gif' ||
          type === 'image/png' ||
          type === 'image/jpeg' ||
          type === 'image.jpg' ||
          type === 'image/svg+xml'
        ) {
          return (
            <img
              src={`/asset-thumbnails/${item.meta.asset}?${new Date().getTime()}`}
              width="64"
              height="64"
              alt="thumbnail"
            />
          );
        }
        {
          return null;
        }
      },
    },
    {
      Header: translateMethod('Content-Type'),
      style: { textAlign: 'left' },
      accessor: (item) =>
        item.meta && item.meta['content-type'] ? item.meta['content-type'] : '--',
    },
    {
      Header: translateMethod('Actions'),
      disableSortBy: true,
      disableFilters: true,
      style: { textAlign: 'center' },
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const item = original;
        return (
          <div className="btn-group">
            {item.contentType.startsWith('text') && (
              <button
                type="button"
                onClick={() => readAndUpdate(item)}
                className="btn btn-sm btn-outline-primary"
              >
                <i className="fas fa-pen" />
              </button>
            )}
            <ReplaceButton
              asset={item}
              tenantMode={tenantMode}
              teamId={currentTeam ? currentTeam._id : undefined}
              displayError={(error) => toastr.error(error)}
              postAction={() => {
                fetchAssets();
              }}
            />
            <a href={assetLink(item.meta.asset, false)} target="_blank" rel="noreferrer noopener">
              <button
                className="btn btn-sm btn-outline-primary"
                style={{ borderRadius: '0px', marginLeft: '0.15rem' }}
              >
                <i className="fas fa-eye" />
              </button>
            </a>
            <a href={assetLink(item.meta.asset, true)} target="_blank" rel="noreferrer noopener">
              <button
                className="btn btn-sm btn-outline-primary mr-1"
                style={{ borderRadius: '0px', marginLeft: '0.15rem' }}
              >
                <i className="fas fa-download" />
              </button>
            </a>
            <button
              type="button"
              onClick={() => deleteAsset(item)}
              className="btn btn-sm btn-outline-danger"
            >
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    },
  ];

  const readAndUpdate = (asset) => {
    let link;
    if (tenantMode) {
      link = `/tenant-assets/${asset.meta.asset}?download=true`;
    } else {
      link = `/api/teams/${currentTeam._id}/assets/${asset.meta.asset}?download=true`;
    }

    fetch(link, {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => response.text())
      .then((value) =>
        openWysywygModal({
          action: (value) => {
            const textFileAsBlob = new Blob([value], { type: 'text/plain' });
            const file = new File([textFileAsBlob], asset.filename);

            if (tenantMode) {
              Services.updateTenantAsset(asset.meta.asset, asset.contentType, file);
            } else {
              Services.updateAsset(currentTeam._id, asset.meta.asset, asset.contentType, file);
            }
          },
          title: asset.meta.filename,
          value,
          team: currentTeam,
        })
      );
  };

  const assetLink = (asset, download = true) => {
    if (tenantMode) {
      return `/tenant-assets/${asset}?download=${download}`;
    } else {
      return `/api/teams/${currentTeam._id}/assets/${asset}?download=${download}`;
    }
  };

  const serviceDelete = (asset) => {
    if (tenantMode) {
      return Services.deleteTenantAsset(asset);
    } else {
      return Services.deleteAsset(currentTeam._id, asset);
    }
  };

  const deleteAsset = (asset) => {
    window
      .confirm(translateMethod('delete asset', 'Are you sure you want to delete that asset ?'))
      .then((ok) => {
        if (ok) {
          serviceDelete(asset.meta.asset).then(() => {
            fetchAssets();
          });
        }
      });
  };

  const fetchAssets = () => {
    let getAssets;
    if (tenantMode) {
      getAssets = Services.listTenantAssets();
    } else {
      getAssets = Services.listAssets(currentTeam._id);
    }
    setLoading(true);
    getAssets
      .then((assets) => {
        if (assets.error) {
          setError(assets.error);
        } else {
          setAssetList(assets);
        }
      })
      .catch((e) => {
        setError(e);
      });
  };

  const addAsset = () => {
    const multiple = assets.length > 1;
    const files = [...assets];
    setLoading(true);
    const promises = files.map((file) => {
      const formData = file;
      if (formData && newAsset.filename && newAsset.title) {
        if (tenantMode) {
          return Services.storeTenantAsset(
            multiple ? file.name : newAsset.filename || '--',
            multiple ? file.name.slice(0, file.name.lastIndexOf('.')) : newAsset.title || '--',
            newAsset.description || '--',
            multiple ? file.type : newAsset.contentType,
            formData
          ).then((asset) => {
            return maybeCreateThumbnail(asset.id, formData).then(() => {
              setNewAsset({});
            });
          });
        } else {
          return handleAssetType(tenantMode, file.type, translateMethod)
            .then(() =>
              Services.storeAsset(
                currentTeam._id,
                multiple ? file.name : newAsset.filename || '--',
                multiple ? file.name.slice(0, file.name.lastIndexOf('.')) : newAsset.title || '--',
                newAsset.description || '--',
                multiple ? file.type : newAsset.contentType,
                formData
              )
                .then((asset) => {
                  return maybeCreateThumbnail(asset.id, formData);
                })
                .then(() => {
                  setNewAsset({});
                })
            )
            .catch(({ error }) => toastr.error(error));
        }
      } else {
        toastr.error(
          translateMethod('Upload error'),
          'You have to provide at least a title and a filename for a file.'
        );
        return Promise.resolve('');
      }
    });
    Promise.all(promises)
      .then(() => {
        fetchAssets();
      })
      .catch(() => setLoading(false));
  };

  const setFiles = (assets) =>
    new Promise((resolve, reject) => {
      const file = assets[0];
      if (!file) {
        reject(translateMethod('no file found'));
      } else {
        setAssets(assets);
        setNewAsset({
          filename: file.name,
          title: file.name.slice(0, file.name.lastIndexOf('.')),
          contentType: file.type,
        });
        resolve();
      }
    });

  const params = useParams();

  const View = () => (
    <Can I={manage} a={tenantMode ? TENANT : asset} team={currentTeam} dispatchError>
      {loading && <Spinner />}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <>
          <div className="row">
            <div className="col-12 mb-3 d-flex justify-content-start">
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={flow}
                  schema={schema}
                  value={newAsset}
                  onChange={(newAsset) => setNewAsset(newAsset)}
                />
              </React.Suspense>
            </div>
          </div>
          <div className="row">
            <div className="col">
              <Table
                selfUrl="assets"
                defaultTitle="Team assets"
                defaultValue={() => ({})}
                itemName="asset"
                columns={columns}
                fetchItems={() => Promise.resolve(assetList)}
                showActions={false}
                showLink={false}
                extractKey={(item) => item.key}
              />
            </div>
          </div>
        </>
      )}
    </Can>
  );

  if (tenantMode)
    return (
      <UserBackOffice
        tab="Assets"
        apiId={params.apiId}
        title={`${tenantMode ? tenant.name : currentTeam.name} - ${translateMethod('Asset', true)}`}
      >
        <View />
      </UserBackOffice>
    );

  return <View />;
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openWysywygModal: (modalProps) => openWysywygModal(modalProps),
};

export const AssetsList = connect(mapStateToProps, mapDispatchToProps)(AssetsListComponent);
