import { constraints, format, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { I18nContext, TranslateParams } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import * as Services from '../../../services';
import { ICmsPageGQL, isError, ITeamSimple, ITenant } from '../../../types';


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

const reservedVersionCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
export const teamApiInfoForm = (translate: (params: (string | TranslateParams)) => string, team: ITeamSimple, tenant: ITenant, getCmsPages: () => Promise<Array<ICmsPageGQL>>, apigroup: boolean) => {
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
          (name, context) => {
            return Services.checkIfApiNameIsUnique(name, context.parent._id)
              .then((r) => !r.exists)
          }
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
      help: translate('api.custom.header.help'),
      props: {
        theme: 'monokai',
      }, //@ts-ignore //FIXME
      expert: true,
      visible: ({ rawValues }) => !rawValues.customHeaderCmsPage,
    },
    customHeaderCmsPage: {
      type: type.string,
      format: format.select,
      label: translate('api.form.cms.header.label'),
      help: translate('api.form.cms.header.help'),
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
          translate({
            key: 'constraints.reserved.char.version',
            replacements: [reservedVersionCharacters.join(' ')]
          }
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
  };

  const apiGroupSchemaAddon = {
    apis: {
      type: type.string,
      label: translate({ key: 'API', plural: true }),
      format: format.select,
      visible: apigroup,
      defaultValue: apigroup ? [] : null,
      isMulti: true,
      optionsFrom: () => Services.teamApis(team._id)
        .then((apis) => {
          console.debug({apis})
          return (!isError(apis) ? apis.filter((api) => !api.apis) : [])}),
      transformer: (api) => {
        return ({
          label: `${api.name} - ${api.currentVersion}`,
          value: api._id
        })
      },
    },
  }

  const simpleOrExpertMode = (entry: string, expert: boolean) => {//@ts-ignore
    return !!expert || !schema[entry]?.expert;
  };

  const flow = (expert: boolean, apigroup: boolean) => [
    {
      label: translate('Basic.informations'),
      flow: apigroup ? ['state', 'name', 'smallDescription', 'image', 'apis'] : ['state', 'name', 'smallDescription', 'image', 'apis'].filter((entry) =>
        simpleOrExpertMode(entry, expert)
      ),
      collapsed: false,
    },
    {
      label: translate('api.form.header.flow.label'),
      flow: ['header', 'customHeaderCmsPage'].filter((entry) =>
        simpleOrExpertMode(entry, expert)
      ),
      collapsed: true,
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
    }
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

  return {
    schema: apigroup ? { ...schema, ...apiGroupSchemaAddon } : schema,
    flow: (expert: boolean) => flow(expert, apigroup),
    adminFlow,
    adminSchema
  };
};
