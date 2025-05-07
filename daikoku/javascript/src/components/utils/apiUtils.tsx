import { constraints, format, TBaseObject, type } from "@maif/react-forms";
import { IFormModalProps, TranslateParams } from "../../contexts";
import { IApi, IApiGQL, isError, ITeamFullGql, ITeamSimple, ITenant } from "../../types";
import * as Services from '../../services';
import { toast } from "sonner";

export const deleteApi = ({ api, versions, team, translate, openFormModal, handleSubmit }:
  {
    api: IApi,
    versions: Array<string>,
    team: ITeamSimple,
    translate: (s: string | TranslateParams) => string,
    openFormModal: <T extends TBaseObject> (p: IFormModalProps<T>) => void,
    handleSubmit: () => void
  }
) => {
  const confirm = {
    confirm: {
      type: type.string,
      label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [api.name] }),
      constraints: [
        constraints.oneOf(
          [api.name],
          translate({ key: 'constraints.type.api.name', replacements: [api.name] })
        ),
      ],
    },
  }

  const next = {
    next: {
      type: type.string,
      label: translate("delete.api.confirm.modal.description.next.label"),
      help: translate('delete.api.confirm.modal.description.next.help'),
      format: format.select,
      options: versions.filter(v => v !== api.currentVersion),
      constraints: [
        constraints.required(translate("constraints.required.value"))
      ]
    }
  }

  const schema = versions.length > 2 && api.isDefault ? { ...confirm, ...next } : { ...confirm }
  const automaticNextCurrentVersion = api.isDefault && versions.length === 2 ? versions.filter(v => v !== api.currentVersion)[0] : undefined

  openFormModal({
    title: translate('Confirm'),
    description: <div className="alert alert-danger" role="alert" >
      <h4 className="alert-heading"> {translate('Warning')} </h4>
      < p > {translate("delete.api.confirm.modal.description.1")} </p>
      < ul >
        <li>{translate("delete.api.confirm.modal.description.2")} </li>
      </ul>
      {automaticNextCurrentVersion && <strong>{translate({ key: 'delete.api.confirm.modal.description.next.version', replacements: [automaticNextCurrentVersion] })} </strong>}
    </div>,
    schema: schema,
    onSubmit: ({ next }) => {
      Services.deleteTeamApi(team._id, api._id, next || automaticNextCurrentVersion)
        .then((r) => {
          if (isError(r)) {
            toast.error(r.error)
          } else {
            toast.success(translate('deletion successful'))
            handleSubmit()
          }
        })
    },
    actionLabel: translate('Confirm')
  })
};

export const apiGQLToLegitApi = (apiGQL: IApiGQL, tenant: ITenant): IApi => {
  return {
    _id: apiGQL._id,
    _humanReadableId: apiGQL._humanReadableId,
    _tenant: tenant._id,
    _deleted: apiGQL._deleted,
    lastUpdate: apiGQL.lastUpdate,
    name: apiGQL.name,
    smallDescription: apiGQL.smallDescription,
    description: apiGQL.description,
    currentVersion: apiGQL.currentVersion,
    supportedVersions: [],
    tags: apiGQL.tags,
    categories: apiGQL.categories,
    visibility: apiGQL.visibility,
    possibleUsagePlans: apiGQL.possibleUsagePlans ? apiGQL.possibleUsagePlans.map(plan => plan._id) : [],
    defaultUsagePlan: apiGQL.defaultUsagePlan,
    authorizedTeams: apiGQL.authorizedTeams ? apiGQL.authorizedTeams.map(team => team._id) : [],
    posts: [],
    issues: [],
    issuesTags: [],
    stars: apiGQL.stars,
    isDefault: true,
    apis: apiGQL.apis ? apiGQL.apis.map(api => api._id) : [],
    state: apiGQL.state,
    team: apiGQL.team._id
  };
}
