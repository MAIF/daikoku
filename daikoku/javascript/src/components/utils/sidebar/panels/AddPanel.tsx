import { Form } from '@maif/react-forms';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { Spinner } from '../..';
import { ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import { I18nContext } from '../../../../contexts/i18n-context';
import * as Services from '../../../../services';
import { IApi, ICmsPageGQL, ITeamSimple } from '../../../../types';
import { teamApiInfoForm } from '../../../backoffice/apis/TeamApiInfo';

type ApiFormRightPanelProps = {
  team: ITeamSimple,
  api?: IApi
  handleSubmit: (api: IApi) => Promise<any>
  apigroup: boolean
}
export const ApiFormRightPanel = (props: ApiFormRightPanelProps) => {
  const { translate } = useContext(I18nContext);
  const { closeRightPanel } = useContext(ModalContext);

  const { tenant, expertMode, toggleExpertMode, customGraphQLClient } = useContext(GlobalContext);
  const getCmsPages = (): Promise<Array<ICmsPageGQL>> =>
    customGraphQLClient.request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
      .then(res => res.pages)

  const informationForm = teamApiInfoForm(translate, props.team, tenant, getCmsPages, props.apigroup);

  const newApiQuery = useQuery({
    queryKey: ['newapi'],
    queryFn: () => (props.apigroup ? Services.fetchNewApiGroup() : Services.fetchNewApi())
      .then((e) => {
        const newApi = { ...e, team: props.team._id };
        return newApi
      }),
    enabled: !props.api
  })

  if (!props.api && (newApiQuery.isLoading || !newApiQuery.data)) {
    return (
      <Spinner />
    )
  }

  return (
    <div className="">
      <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-info">
        {expertMode && translate('Standard mode')}
        {!expertMode && translate('Expert mode')}
      </button>
      <Form
        schema={props.api?.visibility === 'AdminOnly' ? informationForm.adminSchema : informationForm.schema}
        flow={props.api?.visibility === 'AdminOnly' ? informationForm.adminFlow : informationForm.flow(expertMode)}
        onSubmit={(data) => {
          props.handleSubmit(data)
            .then(() => closeRightPanel())
        }}
        value={props.api || newApiQuery.data}
        options={{
          actions: {
            submit: {
              label: translate('Save')
            }
          }
        }}
      />
    </div>
  )
}
