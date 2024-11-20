import React, { useContext } from 'react';
import { type, constraints, format, Schema } from '@maif/react-forms';
import * as Services from '../../../services';
import { I18nContext } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import { ITeamSimple, ITenant } from '../../../types';
import { IPage } from '../../adminbackoffice/cms';


const Image = ({
  value,
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
            label={translate('Set image from asset')}
            onSelect={(asset: any) => onChange(origin + asset.link)}
          />
        </div>
      </div>
    </div>
  );
};

const getTeams = (): Promise<Array<ITeamSimple>> => new Promise((resolve, reject) => {
  setTimeout(() => {
    const teams = [
      { _id: '1', name: 'foo' },
      { _id: '2', name: 'bar' },
      { _id: '3', name: 'avengers' },
    ]//@ts-ignore
    resolve(teams);
  }, 300);
});

const reservedVersionCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
export const teamApiInfoForm = (translate: any, team: ITeamSimple, tenant: ITenant, getCmsPages: () => Promise<Array<IPage>>) => {
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
      visible: ({ rawValues }) => !rawValues.customHeaderCmsPage,
    },
    customHeaderCmsPage: {
      type: type.string,
      format: format.select,
      label: translate('CMS Page as Header'),
      props: { isClearable: true },
      optionsFrom: getCmsPages,
      transformer: page => ({
        label: `${page.name} - ${page.path}`,
        value: page.id
      }),
      //@ts-ignore //FIXME
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
    state: {
      type: type.string,
      format: format.buttonsSelect,
      label: translate('State'),
      options: [
        { label: translate('api.created'), value: 'created' },
        { label: translate('api.published'), value: 'published' },
        { label: translate('api.deprecated'), value: 'deprecated' },
        { label: translate('api.blocked'), value: 'blocked' }],
      defaultValue: 'created',
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
      constraints: [constraints.required(translate("constraints.required.tag_name"))] //TODO fix constraints when array is set at true
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
      visible: ({ rawValues }) => rawValues['visibility'] !== 'Public',
      label: translate('Authorized teams'),
      optionsFrom: '/api/me/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id
      }),
    },
    // description: {
    //   type: type.string,
    //   format: format.markdown,
    //   label: translate('Description'),
    // },
    //   descriptionCmsPage: {
    //       type: type.string,
    //       format: format.select,
    //       label: translate('CMS Page'),
    //       props: { isClearable: true },
    //       optionsFrom: getCmsPages,
    //       transformer: page => ({
    //           label: `${page.name} - ${page.path}`,
    //           value: page.id
    //       }),
    //   }
  };

  const simpleOrExpertMode = (entry: any, expert: any) => {//@ts-ignore
    return !!expert || !schema[entry]?.expert;
  };

  const flow = (expert: any) => [
    {
      label: translate('Basic.informations'),
      flow: ['state', 'name', 'smallDescription', 'image', 'header', 'customHeaderCmsPage'].filter((entry) =>
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
    // {
    //   label: translate('Description'),
    //   flow: ['description', 'descriptionCmsPage'],
    //   collapsed: true
    // }
  ];

  const adminFlow = ['name', 'smallDescription'];

  const adminSchema = {
    name: {
      type: type.string,
      disabled: true,
      label: translate('Name'),
    },
    smallDescription: {
      type: type.string,
      format: format.text,
      disabled: true,
      label: translate('Small desc.'),
    },
  };

  return { schema, flow: (expert: any) => flow(expert), adminFlow, adminSchema };
};
