import React, { useContext, useEffect, useState } from 'react';
import { Form, type, format, constraints } from '@maif/react-forms';

import * as Services from '../../../services';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { I18nContext } from '../../../locales/i18n-context';

const StyleLogoAssetButton = (props) => {
  const tenant = props.tenant ? props.tenant : { domain: window.location.origin };
  const domain = tenant.domain;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="mb-3 d-flex justify-content-end">
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
      type: type.bool,
      label: translateMethod('team_api_info.isDefault')
    },
    name: {
      type: type.string,
      label: translateMethod('Name'),
      placeholder: 'New Api',
      constraints: [
        constraints.test(
          'NameAlreadyExists',
          translateMethod('"api.already.exists"'),
          val => Services.checkIfApiNameIsUnique(val.name, props.value?._id)
            .then((r) => r.exists))
      ]
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      label: translateMethod('Small desc.'),
    },
    header: {
      type: type.string,
      format: format.markdown,
      label: translateMethod('Custom header'),
      help: translateMethod(
        'api.custom.header.help',
        false,
        `Use {{title}} to insert API title, {{ description }} to insert API small description.
         Add "btn-edit" class to link to admin API edition admin page.`
      ),
    },
    // image: {
    //   type: 'string',
    //   props: { label: translateMethod('Image') },
    // },
    // imageFromAssets: {
    //   type: StyleLogoAssetButton,
    //   props: {
    //     tenant: props.tenant,
    //     team: props.team,
    //   },
    // },
    currentVersion: {
      type: type.string,
      label: translateMethod('Current version'),
    },
    supportedVersions: {
      type: type.string,
      array: true,
      label: translateMethod('Supported versions'),
    },
    published: {
      type: type.bool,
      label: translateMethod('Published'),
    },
    testable: {
      type: type.bool,
      label: translateMethod('Testable'),
    },
    tags: {
      type: type.string,
      array: true,
      label: translateMethod('Tags'),
    },
    categories: {
      type: type.string,
      format: format.select,
      isMulti: true,
      label: translateMethod('Categories'),
      createOption: true,
      optionsFrom: '/api/categories',
      transformer: (t) => ({ label: t, value: t }),
    },
    visibility: {
      type: type.string,
      format: format.select,
      label: translateMethod('Visibility'),
      options: [
        { label: translateMethod('Public', false, 'Public'), value: 'Public' },
        { label: translateMethod('Private', false, 'Private'), value: 'Private' },
        {
          label: translateMethod('PublicWithAuthorizations', false, 'Public with authorizations'),
          value: 'PublicWithAuthorizations',
        },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      label: translateMethod('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t) => ({ label: t.name, value: t._id }),
    },
  };

  const formFlow = [
    'isDefault',
    'published',
    'name',
    'smallDescription',
    // 'image',
    // 'imageFromAssets',
    'header',
    // `>>> ${translateMethod('Versions and tags')}`,
    'currentVersion',
    'supportedVersions',
    'tags',
    // 'categories',
    // `>>> ${translateMethod('Visibility')}`,
    'visibility',
    // `>>> ${translateMethod('Authorizations')}`,
    // 'authorizedTeams',
  ];

  // const adminFormFlow = ['_id', 'name', 'smallDescription'];

  // const adminFormSchema = {
  //   _id: {
  //     type: 'string',
  //     disabled: true,
  //     props: { label: translateMethod('Id'), placeholder: '---' },
  //   },
  //   name: {
  //     type: 'string',
  //     disabled: true,
  //     props: { label: translateMethod('Name'), placeholder: 'New Api' },
  //   },
  //   smallDescription: {
  //     type: 'text',
  //     disabled: true,
  //     props: { label: translateMethod('Small desc.') },
  //   },
  // };

  // const isAdminOnly = props.value.visibility === 'AdminOnly';

  return (
      <Form
        flow={formFlow}
        schema={formSchema}
        value={props.value}
        onSubmit={props.onChange}
      />
  );
}
