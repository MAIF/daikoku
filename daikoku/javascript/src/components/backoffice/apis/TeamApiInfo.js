import React, { useContext } from 'react';
import { type, constraints, format } from '@maif/react-forms';
import * as Services from '../../../services';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { I18nContext } from '../../../core';

const Image = ({ setValue, rawValues, value, error, onChange, tenant, team }) => {
  const { translateMethod } = useContext(I18nContext);
  const domain = tenant?.domain || window.location.origin;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  return (
    <div className="d-flex flex-row align-items-center">
      <div className="d-flex flex-column flex-grow-1">
        <input
          type="text"
          className="form-control"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="d-flex mt-1 justify-content-end">
          <AssetChooserByModal
            typeFilter={MimeTypeFilter.image}
            onlyPreview
            team={team}
            teamId={team._id}
            label={translateMethod('Set api image from asset')}
            onSelect={(asset) => onChange(origin + asset.link)}
          />
        </div>
      </div>
    </div>
  );
};

const reservedVersionCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
export const teamApiInfoForm = (translateMethod, team, tenant) => {
  const schema = {
    isDefault: {
      type: type.bool,
      label: translateMethod('team_api_info.isDefault'),
      expert: true,
    },
    name: {
      type: type.string,
      label: translateMethod('Name'),
      placeholder: 'New Api',
      constraints: [
        constraints.required(translateMethod('constraints.required.name')),
        constraints.test(
          'name_already_exist',
          translateMethod('api.already.exists'),
          (name, context) =>
            Services.checkIfApiNameIsUnique(name, context.parent._id).then((r) => !r.exists)
        ),
      ],
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
      props: {
        theme: 'monokai',
      },
      expert: true,
    },
    image: {
      type: type.string,
      label: translateMethod('Image'),
      //todo: render custom for image from asset
      render: (v) => Image({ ...v, team, tenant }),
      constraints: [
        // constraints.matches(
        //   /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/gm,
        //   translateMethod('constraints.format.url', false, '', translateMethod('Image'))
        // ),
      ],
      expert: true,
    },
    currentVersion: {
      type: type.string,
      label: translateMethod('Current version'),
      constraints: [
        constraints.test(
          'reservedChar',
          translateMethod(
            'constraints.reserved.char.version',
            false,
            '',
            reservedVersionCharacters.join(' ')
          ),
          (name) => (name || '').split('').every((c) => !reservedVersionCharacters.includes(c))
        ),
      ],
    },
    supportedVersions: {
      type: type.string,
      array: true,
      label: translateMethod('Supported versions'),
      expert: true,
    },
    published: {
      type: type.bool,
      label: translateMethod('Published'),
    },
    testable: {
      type: type.bool,
      label: translateMethod('Testable'),
      expert: true,
    },
    tags: {
      type: type.string,
      array: true,
      label: translateMethod('Tags'),
      expert: true,
    },
    categories: {
      type: type.string,
      format: format.select,
      isMulti: true,
      createOption: true,
      label: translateMethod('Categories'),
      optionsFrom: '/api/categories',
      transformer: (t) => ({ label: t, value: t }),
      expert: true,
    },
    // visibility: {
    //   type: type.string,
    //   format: format.buttonsSelect,
    //   label: translateMethod('Visibility'),
    //   options: [
    //     { label: translateMethod('Public'), value: 'Public' },
    //     { label: translateMethod('Private'), value: 'Private' },
    //     {
    //       label: translateMethod('PublicWithAuthorizations'),
    //       value: 'PublicWithAuthorizations',
    //     },
    //   ],
    // },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: {
        ref: 'visibility',
        test: (v) => v !== 'Public',
      },
      label: translateMethod('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t) => ({ label: t.name, value: t._id }),
    },
  };

  const simpleOrExpertMode = (entry, expert) => {
    return !!expert || !schema[entry]?.expert;
  };

  const flow = (expert) => [
    {
      label: 'Basic',
      flow: ['published', 'name', 'smallDescription', 'image', 'header'].filter((entry) =>
        simpleOrExpertMode(entry, expert)
      ),
      collapsed: false,
    },
    {
      label: translateMethod('Versions and tags'),
      flow: ['isDefault', 'currentVersion', 'supportedVersions', 'tags', 'categories'].filter(
        (entry) => simpleOrExpertMode(entry, expert)
      ),
      collapsed: true,
    },
    {
      label: translateMethod('Visibility'),
      flow: ['visibility', 'authorizedTeams'].filter((entry) => simpleOrExpertMode(entry, expert)),
      collapsed: true,
    },
  ];

  const adminFlow = ['name', 'smallDescription'];

  const adminSchema = {
    name: {
      type: type.string,
      disabled: true,
      props: { label: translateMethod('Name'), placeholder: 'New Api' },
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      disabled: true,
      props: { label: translateMethod('Small desc.') },
    },
  };

  return { schema, flow: (expert) => flow(expert), adminFlow, adminSchema };
};
