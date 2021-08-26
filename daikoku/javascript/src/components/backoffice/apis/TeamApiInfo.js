import React, { useContext, useEffect, useState } from 'react';

import { Spinner } from '../../utils';
import * as Services from '../../../services';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { I18nContext } from '../../../locales/i18n-context';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

function NameAlreadyExists(props) {
  const [exists, setExists] = useState(false);

  const update = () => {
    Services.checkIfApiNameIsUnique(props.rawValue.name, props.rawValue._id).then((r) =>
      setExists(r.exists)
    );
  };

  const { Translation } = useContext(I18nContext);

  useEffect(() => {
    update(props);
  }, [props.rawValue.name])

  if (!exists)
    return null;

  return (
    <div className="form-group row">
      <div
        className="col-sm-12"
        style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <span className="badge badge-danger">
          <Translation
            i18nkey="api.already.exists"
            replacements={[props.rawValue.name]}>
            api with name "{props.rawValue.name}" already exists
          </Translation>
        </span>
      </div>
    </div>
  );
}

const StyleLogoAssetButton = (props) => {
  const tenant = props.tenant ? props.tenant : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="form-group d-flex justify-content-end">
      <AssetChooserByModal
        typeFilter={MimeTypeFilter.image}
        onlyPreview
        team={props.team}
        teamId={props.team._id}
        label={translateMethod('Set api image from asset')}
        onSelect={(asset) => props.changeValue('image', origin + asset.link)}
      />
    </div>
  );
};

export function TeamApiInfo(props) {
  const { translateMethod } = useContext(I18nContext);

  const formSchema = {
    isDefault: {
      type: 'bool',
      props: {
        label: translateMethod('team_api_info.isDefault'),
      },
    },
    name: {
      type: 'string',
      props: { label: translateMethod('Name'), placeholder: 'New Api' },
    },
    nameAlreadyExists: {
      type: NameAlreadyExists,
      props: {
        creating: props.creating
      },
    },
    smallDescription: {
      type: 'text',
      props: { label: translateMethod('Small desc.') },
    },
    header: {
      type: 'markdown',
      props: {
        label: translateMethod('Custom header'),
        help: translateMethod(
          'api.custom.header.help',
          false,
          `Use {{title}} to insert API title, {{ description }} to insert API small description.
         Add "btn-edit" class to link to admin API edition admin page.`
        ),
      },
    },
    image: {
      type: 'string',
      props: { label: translateMethod('Image') },
    },
    imageFromAssets: {
      type: StyleLogoAssetButton,
      props: {
        tenant: props.tenant,
        team: props.team
      },
    },
    currentVersion: {
      type: 'string',
      props: { label: translateMethod('Current version') },
    },
    supportedVersions: {
      type: 'array',
      props: { label: translateMethod('Supported versions') },
    },
    published: {
      type: 'bool',
      props: { label: translateMethod('Published') },
    },
    testable: {
      type: 'bool',
      props: { label: translateMethod('Testable') },
    },
    tags: {
      type: 'array',
      props: { label: translateMethod('Tags') },
    },
    categories: {
      type: 'array',
      props: {
        label: translateMethod('Categories'),
        creatable: true,
        valuesFrom: '/api/categories',
        transformer: (t) => ({ label: t, value: t }),
      },
    },
    visibility: {
      type: 'select',
      props: {
        label: translateMethod('Visibility'),
        possibleValues: [
          { label: translateMethod('Public', false, 'Public'), value: 'Public' },
          { label: translateMethod('Private', false, 'Private'), value: 'Private' },
          {
            label: translateMethod(
              'PublicWithAuthorizations',
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
        label: translateMethod('Authorized teams'),
        valuesFrom: '/api/teams',
        selectClassName: 'full-width-select',
        transformer: (t) => ({ label: t.name, value: t._id }),
      },
    },
  };

  const formFlow = [
    'isDefault',
    'published',
    'name',
    'nameAlreadyExists',
    'smallDescription',
    'image',
    'imageFromAssets',
    'header',
    `>>> ${translateMethod('Versions and tags')}`,
    'currentVersion',
    'supportedVersions',
    'tags',
    'categories',
    `>>> ${translateMethod('Visibility')}`,
    'visibility',
    `>>> ${translateMethod('Authorizations')}`,
    'authorizedTeams',
  ];

  const adminFormFlow = ['_id', 'name', 'smallDescription'];

  const adminFormSchema = {
    _id: {
      type: 'string',
      disabled: true,
      props: { label: translateMethod('Id'), placeholder: '---' },
    },
    name: {
      type: 'string',
      disabled: true,
      props: { label: translateMethod('Name'), placeholder: 'New Api' },
    },
    smallDescription: {
      type: 'text',
      disabled: true,
      props: { label: translateMethod('Small desc.') },
    },
  };

  const isAdminOnly = props.value.visibility === 'AdminOnly';

  return (
    <React.Suspense fallback={<Spinner />}>
      <LazyForm
        flow={isAdminOnly ? adminFormFlow : formFlow}
        schema={isAdminOnly ? adminFormSchema : formSchema}
        value={props.value}
        onChange={props.onChange}
      />
    </React.Suspense>
  );
}
