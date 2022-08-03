import React, { useContext } from 'react';
import { type, constraints, format } from '@maif/react-forms';
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
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const domain = tenant?.domain || window.location.origin;
  const origin =
    window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-row align-items-center">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column flex-grow-1">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <input
          type="text"
          className="form-control"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex mt-1 justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <AssetChooserByModal
            // @ts-expect-error TS(2322): Type '{ typeFilter: (value: any) => any; onlyPrevi... Remove this comment to see the full error message
            typeFilter={MimeTypeFilter.image}
            onlyPreview
            team={team}
            teamId={team._id}
            label={translateMethod('Set image from asset')}
            onSelect={(asset: any) => onChange(origin + asset.link)}
          />
        </div>
      </div>
    </div>
  );
};

const reservedVersionCharacters = [';', '/', '?', ':', '@', '&', '=', '+', '$', ','];
export const teamApiInfoForm = (translateMethod: any, team: any, tenant: any) => {
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
      render: (v: any) => Image({ ...v, team, tenant }),
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
          (name) => (name || '').split('').every((c: any) => !reservedVersionCharacters.includes(c))
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
      transformer: (t: any) => ({
        label: t,
        value: t
      }),
      expert: true,
    },
    visibility: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Visibility'),
      options: [
        { label: translateMethod('Public'), value: 'Public' },
        { label: translateMethod('Private'), value: 'Private' },
        {
          label: translateMethod('PublicWithAuthorizations'),
          value: 'PublicWithAuthorizations',
        },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      isMulti: true,
      defaultValue: [],
      visible: {
        ref: 'visibility',
        test: (v: any) => v !== 'Public',
      },
      label: translateMethod('Authorized teams'),
      optionsFrom: '/api/teams',
      transformer: (t: any) => ({
        label: t.name,
        value: t._id
      }),
    },
  };

  const simpleOrExpertMode = (entry: any, expert: any) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return !!expert || !schema[entry]?.expert;
  };

  const flow = (expert: any) => [
    {
      label: translateMethod('Basic.informations'),
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

  return { schema, flow: (expert: any) => flow(expert), adminFlow, adminSchema };
};
