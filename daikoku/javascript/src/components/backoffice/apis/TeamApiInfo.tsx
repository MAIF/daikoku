import React, { useContext } from 'react';
import { type, constraints, format, Schema } from '@maif/react-forms';
import * as Services from '../../../services';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { I18nContext } from '../../../core';

const Image = ({
  setValue,
  rawValues,
  value,
  error,
  onChange,
  tenant,
  team
}: any) => {
    const { translate } = useContext(I18nContext);
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
            label={translate('Set image from asset')}
            onSelect={(asset: any) => onChange(origin + asset.link)}
          />
        </div>
      </div>
    </div>
  );
};

const reservedVersionCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
export const teamApiInfoForm = (translate: any, team: any, tenant: any) => {
  const schema: Schema = {
    isDefault: {
      type: type.bool,
      label: translate('team_api_info.isDefault'), //@ts-ignore //FIXME
      expert: true,
    },
    name: {
      type: type.string,
      label: translate('Name'),
      placeholder: 'New Api',
      constraints: [
        constraints.required(translate('constraints.required.name')),
        constraints.test(
          'name_already_exist',
          translate('api.already.exists'),
          (name, context) =>
            Services.checkIfApiNameIsUnique(name, context.parent._id).then((r) => !r.exists)
        ),
      ],
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      label: translate('Small desc.'),
    },
    header: {
      type: type.string,
      format: format.markdown,
      label: translate('Custom header'),
      help: translate(
        'api.custom.header.help',
        false,
        `Use {{title}} to insert API title, {{ description }} to insert API small description.
         Add "btn-edit" class to link to admin API edition admin page.`
      ),
      props: {
        theme: 'monokai',
      }, //@ts-ignore //FIXME
      expert: true,
    },
    image: {
      type: type.string,
      label: translate('Image'),
      //todo: render custom for image from asset
      render: (v: any) => Image({ ...v, team, tenant }),
      constraints: [
        // constraints.matches(
        //   /^(https?:\/\/|\/)(\w+([^\w|^\s])?)([^\s]+$)|(^\.?\/[^\s]*$)/gm,
        //   translate('constraints.format.url', false, '', translate('Image'))
        // ),
      ], //@ts-ignore //FIXME
      expert: true,
    },
    currentVersion: {
      type: type.string,
      label: translate('Current version'),
      constraints: [
        constraints.test(
          'reservedChar',
          translate(
            'constraints.reserved.char.version',
            false,
            '',
            reservedVersionCharacters.join(' ')
          ),
          (name) => (name || '').split('').every((c: any) => !reservedVersionCharacters.includes(c))
        ),
      ],
    },
    supportedVersions: {
      type: type.string,
      array: true,
      label: translate('Supported versions'), //@ts-ignore //FIXME
      expert: true,
    },
    published: {
      type: type.bool,
      label: translate('Published'),
    },
    testable: {
      type: type.bool,
      label: translate('Testable'), //@ts-ignore //FIXME
      expert: true,
    },
    tags: {
      type: type.string,
      array: true,
      label: translate('Tags'), //@ts-ignore //FIXME
      expert: true,
    },
    categories: {
      type: type.string,
      format: format.select,
      isMulti: true,
      createOption: true,
      label: translate('Categories'),
      optionsFrom: '/api/categories',
      transformer: (t: any) => ({
        label: t,
        value: t
      }), //@ts-ignore //FIXME
      expert: true,
    },
    visibility: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('Visibility'),
      options: [
        { label: translate('Public'), value: 'Public' },
        { label: translate('Private'), value: 'Private' },
        {
          label: translate('PublicWithAuthorizations'),
          value: 'PublicWithAuthorizations',
        },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: ({rawValues}) => rawValues['visibility'] !== 'Public' ,
      label: translate('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id
      }),
    },
  };

  const simpleOrExpertMode = (entry: any, expert: any) => {//@ts-ignore
        return !!expert || !schema[entry]?.expert;
  };

  const flow = (expert: any) => [
    {
      label: translate('Basic.informations'),
      flow: ['published', 'name', 'smallDescription', 'image', 'header'].filter((entry) =>
        simpleOrExpertMode(entry, expert)
      ),
      collapsed: false,
    },
    {
      label: translate('Versions and tags'),
      flow: ['isDefault', 'currentVersion', 'supportedVersions', 'tags', 'categories'].filter(
        (entry) => simpleOrExpertMode(entry, expert)
      ),
      collapsed: true,
    },
    {
      label: translate('Visibility'),
      flow: ['visibility', 'authorizedTeams'].filter((entry) => simpleOrExpertMode(entry, expert)),
      collapsed: true,
    },
  ];

  const adminFlow = ['name', 'smallDescription'];

  const adminSchema = {
    name: {
      type: type.string,
      disabled: true,
      props: { label: translate('Name'), placeholder: 'New Api' },
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      disabled: true,
      props: { label: translate('Small desc.') },
    },
  };

  return { schema, flow: (expert: any) => flow(expert), adminFlow, adminSchema };
};
