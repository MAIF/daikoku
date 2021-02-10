import React, { Component } from 'react';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class NameAlreadyExists extends Component {
  state = { exists: false };

  update = (props) => {
    Services.checkIfApiNameIsUnique(props.rawValue.name, props.rawValue._id).then((r) =>
      this.setState({ exists: r.exists })
    );
  };

  UNSAFE_componentWillReceiveProps(np) {
    if (np.rawValue.name !== this.props.rawValue.name) {
      this.update(np);
    }
  }

  componentDidMount() {
    this.update(this.props);
  }

  render() {
    if (this.state.exists) {
      return (
        <div className="form-group row">
          <div
            className="col-sm-12"
            style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span className="badge badge-danger">
              <Translation
                i18nkey="api.already.exists"
                language={this.props.currentLanguage}
                replacements={[this.props.rawValue.name]}>
                api with name "{this.props.rawValue.name}" already exists
              </Translation>
            </span>
          </div>
        </div>
      );
    } else {
      return null;
    }
  }
}

export class TeamApiInfo extends Component {
  formSchema = {
    _id: {
      type: 'string',
      disabled: true,
      props: { label: t('Id', this.props.currentLanguage), placeholder: '---' },
    },
    name: {
      type: 'string',
      props: { label: t('Name', this.props.currentLanguage), placeholder: 'New Api' },
    },
    nameAlreadyExists: {
      type: NameAlreadyExists,
      props: {
        creating: this.props.creating,
        currentLanguage: this.props.currentLanguage,
      },
    },
    smallDescription: {
      type: 'text',
      props: { label: t('Small desc.', this.props.currentLanguage) },
    },
    header: {
      type: 'markdown',
      props: {
        label: t('Custom header', this.props.currentLanguage),
        help: t(
          'api.custom.header.help',
          this.props.currentLanguage,
          false,
          `Use {{title}} to insert API title, {{ description }} to insert API small description.
         Add "btn-edit" class to link to admin API edition admin page.`
        ),
      },
    },
    currentVersion: {
      type: 'string',
      props: { label: t('Current version', this.props.currentLanguage) },
    },
    supportedVersions: {
      type: 'array',
      props: { label: t('Supported versions', this.props.currentLanguage) },
    },
    published: {
      type: 'bool',
      props: { label: t('Published', this.props.currentLanguage) },
    },
    testable: {
      type: 'bool',
      props: { label: t('Testable', this.props.currentLanguage) },
    },
    tags: {
      type: 'array',
      props: { label: t('Tags', this.props.currentLanguage) },
    },
    categories: {
      type: 'array',
      props: {
        label: t('Categories', this.props.currentLanguage),
        creatable: true,
        valuesFrom: '/api/categories',
        transformer: (t) => ({ label: t, value: t }),
      },
    },
    visibility: {
      type: 'select',
      props: {
        label: t('Visibility', this.props.currentLanguage),
        possibleValues: [
          { label: t('Public', this.props.currentLanguage, false, 'Public'), value: 'Public' },
          { label: t('Private', this.props.currentLanguage, false, 'Private'), value: 'Private' },
          {
            label: t(
              'PublicWithAuthorizations',
              this.props.currentLanguage,
              false,
              'Public with authorizations'
            ),
            value: 'PublicWithAuthorizations',
          },
        ],
      },
    },
    authorizedTeams: {
      type: 'array',
      props: {
        label: t('Authorized teams', this.props.currentLanguage),
        valuesFrom: '/api/teams',
        selectClassName: 'full-width-select',
        transformer: (t) => ({ label: t.name, value: t._id }),
      },
    }
  };

  formFlow = [
    '_id',
    'published',
    'name',
    'nameAlreadyExists',
    'smallDescription',
    'header',
    `>>> ${t('Versions and tags', this.props.currentLanguage)}`,
    'currentVersion',
    'supportedVersions',
    'tags',
    'categories',
    `>>> ${t('Visibility', this.props.currentLanguage)}`,
    'visibility',
    `>>> ${t('Authorizations', this.props.currentLanguage)}`,
    'authorizedTeams',
  ];

  adminFormFlow = ['_id', 'name', 'smallDescription'];

  adminFormSchema = {
    _id: {
      type: 'string',
      disabled: true,
      props: { label: t('Id', this.props.currentLanguage), placeholder: '---' },
    },
    name: {
      type: 'string',
      disabled: true,
      props: { label: t('Name', this.props.currentLanguage), placeholder: 'New Api' },
    },
    smallDescription: {
      type: 'text',
      disabled: true,
      props: { label: t('Small desc.', this.props.currentLanguage) },
    },
  };

  render() {
    if (this.props.value.visibility === 'AdminOnly') {
      return (
        <React.Suspense fallback={<Spinner />}>
          <LazyForm
            flow={this.adminFormFlow}
            schema={this.adminFormSchema}
            value={this.props.value}
            onChange={this.props.onChange}
          />
        </React.Suspense>
      );
    }
    return (
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          flow={this.formFlow}
          schema={this.formSchema}
          value={this.props.value}
          onChange={this.props.onChange}
        />
      </React.Suspense>
    );
  }
}
