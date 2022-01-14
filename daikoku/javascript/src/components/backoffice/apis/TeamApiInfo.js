import { type, constraints, format } from '@maif/react-forms';
import * as Services from '../../../services';

// function NameAlreadyExists(props) {
//   const [exists, setExists] = useState(false);

//   const update = () => {
//     Services.checkIfApiNameIsUnique(props.rawValue.name, props.rawValue._id).then((r) =>
//       setExists(r.exists)
//     );
//   };

//   const { Translation } = useContext(I18nContext);

//   useEffect(() => {
//     update(props);
//   }, [props.rawValue.name]);

//   if (!exists) return null;

//   return (
//     <div className="mb-3 row">
//       <div
//         className="col-sm-12"
//         style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
//         <span className="badge bg-danger">
//           <Translation i18nkey="api.already.exists" replacements={[props.rawValue.name]}>
//             api with name "{props.rawValue.name}" already exists
//           </Translation>
//         </span>
//       </div>
//     </div>
//   );
// }

// const StyleLogoAssetButton = (props) => {
//   const tenant = props.tenant ? props.tenant : { domain: window.location.origin };
//   const domain = tenant.domain;
//   const origin =
//     window.location.origin.indexOf(domain) > -1 ? window.location.origin : `https://${domain}`;

//   const { translateMethod } = useContext(I18nContext);

//   return (
//     <div className="mb-3 d-flex justify-content-end">
//       <AssetChooserByModal
//         typeFilter={MimeTypeFilter.image}
//         onlyPreview
//         team={props.team}
//         teamId={props.team._id}
//         label={translateMethod('Set api image from asset')}
//         onSelect={(asset) => props.changeValue('image', origin + asset.link)}
//       />
//     </div>
//   );
// };

export const teamApiInfoForm = (translateMethod) => {
  const schema = {
    isDefault: {
      type: type.bool,
      label: translateMethod('team_api_info.isDefault'),
    },
    name: {
      type: type.string,
      label: translateMethod('Name'),
      placeholder: 'New Api',
      constraints: [
        constraints.required('api name is required'),
        constraints.test('name_already_exist', 'this name already exists', (name, context) => Services.checkIfApiNameIsUnique(name, context.parent._id).then(r => !r.exists))
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
      constraints: [
        constraints.nullable()
      ]
    },
    image: {
      type: type.string,
      label: translateMethod('Image'),
      //todo: render custom for image from asset
      constraints: [
        constraints.nullable(),
        constraints.url('this must be an url to an image')
      ]
    },
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
      createOption: true,
      label: translateMethod('Categories'),
      optionFrom: '/api/categories',
      transformer: (t) => ({ label: t, value: t }),
    },
    visibility: {
      type: type.string,
      format: format.buttonsSelect,
      label: translateMethod('Visibility'),
      options: [
        { label: translateMethod('Public'), value: 'Public' },
        { label: translateMethod('Private'), value: 'Private' },
        {
          label: translateMethod('PublicWithAuthorizations'), value: 'PublicWithAuthorizations',
        },
      ],
    },
    authorizedTeams: {
      type: type.string,
      format: format.select,
      visible: {
        ref: 'visibility', 
        test: v => v !== 'Public'
      },
      array: true,
      label: translateMethod('Authorized teams'),
      optionFrom: '/api/teams',
      transformer: (t) => ({ label: t.name, value: t._id }),
    },
  };

  const flow = [
    {
      label: 'Basic',
      flow: [
        'isDefault',
        'published',
        'name',
        'smallDescription',
        'image',
        'header',
      ],
      collapsed: false
    },
    {
      label: translateMethod('Versions and tags'),
      flow: [
        'currentVersion',
        'supportedVersions',
        'tags',
        'categories',
      ],
      collapsed: true
    },
    {
      label: translateMethod('Visibility'),
      flow: [
        'visibility',
        'authorizedTeams'
      ],
      collapsed: true
    }
  ];

  const simpleFlow = [
    {
      label: 'Simple Mode',
      flow: [
        'name',
        'smallDescription',
        'currentVersion',
        'visibility',
        'authorizedTeams'
      ],
      collapsed: false
    },
    {
      label: 'Expert Mode',
      flow: [
        {
          label: 'Basic',
          flow: [
            'isDefault',
            'published',
            'image',
            'header',
          ],
          collapsed: true
        },
        {
          label: translateMethod('Versions and tags'),
          flow: [
            'supportedVersions',
            'tags',
            'categories',
          ],
          collapsed: true
        },
      ],
      collapsed: true
    }
  ]

  return { schema, flow, simpleFlow }

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

  // const isAdminOnly = props.value.visibility === 'AdminOnly';

  // return (
  //   <React.Suspense fallback={<Spinner />}>
  //     <LazyForm
  //       flow={isAdminOnly ? adminFormFlow : formFlow}
  //       schema={isAdminOnly ? adminFormSchema : formSchema}
  //       value={props.value}
  //       onChange={props.onChange}
  //     />
  //   </React.Suspense>
  // );
}