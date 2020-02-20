import React, { Component } from 'react';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { t, Translation } from '../../../locales';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

class NameAlreadyExists extends Component {
  state = { exists: false };

  update = props => {
    Services.checkIfApiNameIsUnique(props.rawValue.team, props.rawValue.name).then(r =>
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
    return (
      <div className="form-group row">
        <label htmlFor="input-Name" className="col-xs-12 col-sm-2 col-form-label" />
        <div
          className="col-sm-10"
          style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {this.props.creating && this.state.exists ? (
            <span className="badge badge-danger">
              <Translation
                i18nkey="api.already.exists"
                language={this.props.currentLanguage}
                replacements={[this.props.rawValue.name]}>
                api with name "{this.props.rawValue.name}" already exists
              </Translation>
            </span>
          ) : null}
        </div>
      </div>
    );
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
        transformer: t => ({ label: t, value: t }),
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
              'Public With Authorizations',
              this.props.currentLanguage,
              false,
              'Public With Authorizations'
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
        transformer: t => ({ label: t.name, value: t._id }),
      },
    },
  };

  formFlow = [
    '_id',
    'name',
    'nameAlreadyExists',
    'smallDescription',
    'published',
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

  render() {
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
