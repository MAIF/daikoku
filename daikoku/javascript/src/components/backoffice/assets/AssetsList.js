import React, { Component } from 'react';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { TeamBackOffice, UserBackOffice } from '..';
import { Table } from '../../inputs';
import { Can, manage, asset, daikoku, Spinner } from '../../utils';
import { t, Translation } from '../../../locales';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

const mimeTypes = [
  { label: '.adoc Ascii doctor', value: 'text/asciidoc' },
  { label: '.avi	AVI : Audio Video Interleaved', value: 'video/x-msvideo' },
  { label: '.gif	fichier Graphics Interchange Format (GIF)', value: 'image/gif' },
  { label: '.html	fichier HyperText Markup Language (HTML)', value: 'text/html' },
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
  { label: '.js fichier javascript', value: 'text/javascript' },
  { label: '.css fichier css', value: 'text/css' },
];

class FileInput extends Component {
  state = { uploading: false };

  setFiles = e => {
    const files = e.target.files;
    this.setState({ uploading: true }, () => {
      this.props.setFiles(files).then(() => {
        this.setState({ uploading: false });
      });
    });
  };

  trigger = () => {
    this.input.click();
  };

  render() {
    return (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <input
          ref={r => (this.input = r)}
          type="file"
          multiple
          className="form-control hide"
          onChange={this.setFiles}
        />
        <button
          type="button"
          className="btn btn-outline-success pl"
          disabled={this.state.uploading}
          onClick={this.trigger}>
          {this.state.uploading && <i className="fas fa-spinner mr-1" />}
          {!this.state.uploading && <i className="fas fa-upload mr-1" />}
          <Translation i18nkey="Select file" language={this.props.currentLanguage}>
            Select file
          </Translation>
        </button>
      </div>
    );
  }
}

class AddAsset extends Component {
  render() {
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div className="col-sm-10">
          <button
            type="button"
            className="btn btn-access-negative"
            title={t('Add asset', this.props.currentLanguage)}
            onClick={() => this.props.addAsset()}>
            <i className="fas fa-plus mr-1" />
            <Translation i18nkey="Add asset" language={this.props.currentLanguage}>
              Add asset
            </Translation>
          </button>
        </div>
      </div>
    );
  }
}

class AssetsListComponent extends Component {
  state = {
    assets: [],
    newAsset: {},
    loading: false,
  };

  flow = ['filename', 'title', 'description', 'contentType', 'input', 'add'];

  schema = {
    filename: { type: 'string', props: { label: t('Asset filename', this.props.currentLanguage) } },
    title: { type: 'string', props: { label: t('Asset title', this.props.currentLanguage) } },
    description: { type: 'string', props: { label: t('Description', this.props.currentLanguage) } },
    contentType: {
      type: 'select',
      props: { label: t('Content-Type', this.props.currentLanguage), possibleValues: mimeTypes },
    },
    input: {
      type: FileInput,
      props: { setFiles: f => this.setFiles(f), currentLanguage: this.props.currentLanguage },
    },
    add: {
      type: AddAsset,
      props: { addAsset: () => this.addAsset(), currentLanguage: this.props.currentLanguage },
    },
  };

  columns = [
    {
      title: t('Filename', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: item => (item.meta && item.meta.filename ? item.meta.filename : '--'),
    },
    {
      title: t('Title', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: item => (item.meta && item.meta.title ? item.meta.title : '--'),
    },
    {
      title: t('Description', this.props.currentLanguage),
      style: { alignItems: 'center', justifyContent: 'center', display: 'flex' },
      content: item => (item.meta && item.meta.desc ? item.meta.desc : '--'),
    },
    {
      title: t('Thumbnail', this.props.currentLanguage),
      style: { alignItems: 'center', justifyContent: 'center', display: 'flex', width: 86 },
      content: item => {
        const type = item.meta['content-type'];
        if (
          type === 'image/gif' ||
          type === 'image/png' ||
          type === 'image/jpeg' ||
          type === 'image.jpg'
        ) {
          return (
            <img
              src={`/asset-thumbnails/${item.meta.asset}`}
              width="64"
              height="64"
              alt="thumbnail"
            />
          );
        } else {
          return null;
        }
      },
    },
    {
      title: t('Content-Type', this.props.currentLanguage),
      style: { alignItems: 'center', justifyContent: 'center', display: 'flex' },
      content: item => (item.meta && item.meta['content-type'] ? item.meta['content-type'] : '--'),
    },
    {
      title: t('Actions', this.props.currentLanguage),
      style: { justifyContent: 'center', alignItems: 'center', display: 'flex', width: 120 },
      content: item => (
        <div className="btn-group">
          <a
            href={this.assetLink(item.meta.asset)}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-sm btn-outline-primary">
            <i className="fas fa-eye" />
          </a>
          <button
            type="button"
            onClick={() => this.deleteAsset(item)}
            className="btn btn-sm btn-outline-danger">
            <i className="fas fa-trash" />
          </button>
        </div>
      ),
    },
  ];

  assetLink = asset => {
    if (this.props.tenantMode) {
      return `/tenant-assets/${asset}?download=true`;
    } else {
      return `/api/teams/${this.props.currentTeam._id}/assets/${asset}?download=true`;
    }
  };

  serviceDelete = asset => {
    if (this.props.tenantMode) {
      return Services.deleteTenantAsset(asset);
    } else {
      return Services.deleteAsset(this.props.currentTeam._id, asset);
    }
  };

  deleteAsset = asset => {
    window
      .confirm(
        t(
          'delete asset',
          this.props.currentLanguage,
          'Are you sure you want to delete that asset ?'
        )
      )
      .then(ok => {
        if (ok) {
          this.serviceDelete(asset.meta.asset).then(() => {
            if (this.table) {
              this.table.update();
            }
          });
        }
      });
  };

  componentDidMount() {
    this.updateAssets();
  }

  updateAssets = () => {
    if (this.table) {
      this.table.update();
    }
  };

  fetchAssets = () => {
    if (this.props.currentTeam) {
      if (this.props.tenantMode) {
        return Services.listTenantAssets().then(assets => {
          return assets;
        });
      } else {
        return Services.listAssets(this.props.currentTeam._id).then(assets => {
          return assets;
        });
      }
    } else {
      if (this.props.tenantMode) {
        return Services.listTenantAssets().then(assets => {
          return assets;
        });
      } else {
        return Promise.resolve([]);
      }
    }
  };

  addAsset = () => {
    function handleImage(id, file) {
      return new Promise(s => {
        if (
          file.type === 'image/gif' ||
          file.type === 'image/png' ||
          file.type === 'image/jpeg' ||
          file.type === 'image.jpg'
        ) {
          const reader = new FileReader();
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          reader.onload = function(event) {
            var img = new Image();
            img.onload = function() {
              canvas.width = 128; //img.width;
              canvas.height = 128; //img.height;
              ctx.drawImage(img, 0, 0, 128, 128);
              const base64 = canvas.toDataURL();
              canvas.toBlob(blob => {
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
    }

    const multiple = this.state.assets.length > 1;
    const files = [...this.state.assets];
    this.setState({ loading: true });
    const promises = files.map(file => {
      const formData = file; //this.state.assets[0];
      if (formData && this.state.newAsset.filename && this.state.newAsset.title) {
        if (this.props.tenantMode) {
          return Services.storeTenantAsset(
            multiple ? file.name : this.state.newAsset.filename || '--',
            multiple
              ? file.name.slice(0, file.name.lastIndexOf('.'))
              : this.state.newAsset.title || '--',
            this.state.newAsset.description || '--',
            multiple ? file.type : this.state.newAsset.contentType,
            formData
          ).then(asset => {
            return handleImage(asset.id, formData).then(() => {
              this.setState({ newAsset: {} });
              if (this.table) {
                this.table.update();
              }
            });
          });
        } else {
          return Services.storeAsset(
            this.props.currentTeam._id,
            multiple ? file.name : this.state.newAsset.filename || '--',
            multiple
              ? file.name.slice(0, file.name.lastIndexOf('.'))
              : this.state.newAsset.title || '--',
            this.state.newAsset.description || '--',
            multiple ? file.type : this.state.newAsset.contentType,
            formData
          ).then(asset => {
            return handleImage(asset.id, formData).then(() => {
              this.setState({ newAsset: {} });
              if (this.table) {
                this.table.update();
              }
            });
          });
        }
      } else {
        toastr.error(
          t('Upload error', this.props.currentLanguage),
          'You have to provide at least a title and a filename for a file.'
        );
        return Promise.resolve('');
      }
    });
    Promise.all(promises).then(() => {
      this.setState({ loading: false });
    });
  };

  setFiles = assets =>
    new Promise((resolve, reject) => {
      const file = assets[0];
      if (!file) {
        reject(t('no file found', this.props.currentLanguage));
      } else {
        this.setState(
          {
            assets,
            newAsset: {
              filename: file.name,
              title: file.name.slice(0, file.name.lastIndexOf('.')),
              contentType: file.type,
            },
          },
          () => resolve()
        );
      }
    });

  render() {
    const BackOffice = this.props.tenantMode ? UserBackOffice : TeamBackOffice;
    return (
      <BackOffice tab="Assets" apiId={this.props.match.params.apiId}>
        <Can
          I={manage}
          a={this.props.tenantMode ? daikoku : asset}
          team={this.props.currentTeam}
          dispatchError>
          <div className="row">
            <div className="col">
              <h1>
                {this.props.tenantMode
                  ? t('Tenant', this.props.currentLanguage)
                  : this.props.currentTeam.name}{' '}
                {t('asset', this.props.currentLanguage, true)}
              </h1>
            </div>
          </div>
          <div className="row">
            <div className="col-12 mb-3 d-flex justify-content-start">
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={this.flow}
                  schema={this.schema}
                  value={this.state.newAsset}
                  onChange={newAsset => this.setState({ newAsset })}
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
                columns={this.columns}
                fetchItems={this.fetchAssets}
                showActions={false}
                showLink={false}
                extractKey={item => item.key}
                injectTable={t => (this.table = t)}
                currentLanguage={this.props.currentLanguage}
              />
            </div>
          </div>
        </Can>
      </BackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const AssetsList = connect(mapStateToProps)(AssetsListComponent);
