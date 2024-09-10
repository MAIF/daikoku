import { useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subMonths } from 'date-fns';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import {
  IApiWithAuthorization,
  isError
} from '../../../types';
import { api as API, CanIDoAction, manage, Spinner, teamGQLToSimple } from '../../utils';
import { ApiList } from './ApiList';

export const MyHome = () => {


  const { connectedUser, tenant, apiCreationPermitted } = useContext(GlobalContext)

  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

  const navigate = useNavigate();

  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const [isAnonEnabled, setIsAnonEnabled] = useState<boolean>()
  const [daikokuId, setDaikokuId] = useState<string>()
  const [lastResponseDate, setLastResponseDate] = useState<number>()
  const currentDate = new Date();
  const sixMonthAgo = subMonths(currentDate, 6);


  useEffect(() => {
    Services.getAnonymousState().then(res =>{
      setIsAnonEnabled(res.activated)
      setDaikokuId(res.id)
      setLastResponseDate(res.date)
    })
  }, []);

  useEffect(() => {
    if(isAnonEnabled === false && connectedUser.isDaikokuAdmin && daikokuId && (!lastResponseDate || new Date(lastResponseDate) < sixMonthAgo)) {
      confirm({title: translate('anonymous.reporting.enable'), message: <div>{translate('anonymous.reporting.popup.info')}<a href="https://maif.github.io/daikoku/docs/getstarted/setup/reporting" target="_blank" rel="noopener noreferrer"> Daikoku documentation</a></div>, okLabel: translate('Yes') })
        .then((ok) => {
          if (ok) {
            Services.updateAnonymousState(daikokuId, true, currentDate.getTime()).then(() => {
              toast.success(translate("anonymous.reporting.success.enabled"))
            })
          } else {
            Services.updateAnonymousState(daikokuId, false, currentDate.getTime()).then(() => {
              toast.info(translate("anonymous.reporting.popup.no"))
            })
          }
        });
    }
  }, [isAnonEnabled]);

  const redirectToApiPage = (apiWithAutho: IApiWithAuthorization) => {
    const api = apiWithAutho.api
    const route = (version: string) => api.apis
      ? `/${api.team._humanReadableId}/apigroups/${api._humanReadableId}/apis`
      : `/${api.team._humanReadableId}/${api._humanReadableId}/${version}/description`;

    if (api.isDefault) {
      navigate(route(api.currentVersion));
    } else {
      Services.getDefaultApiVersion(api._humanReadableId)
        .then((res) =>
          navigate(route(res.defaultVersion))
        );
    }
  };

  const redirectToEditPage = (apiWithAutho: IApiWithAuthorization) => {
    const api = apiWithAutho.api

    if (api.team && CanIDoAction(connectedUser, manage, API, teamGQLToSimple(api.team), apiCreationPermitted)) {
      const url = api.apis
        ? `/${api.team._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
        : `/${api.team._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
      navigate(url);
    }
  };

  if (myTeamsRequest.isLoading) {
    return (
      <Spinner />
    )
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <main role="main">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="row text-center">
            <div className="col-sm-4">
              <img
                className="organisation__avatar"
                src={tenant.logo ? tenant.logo : '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            <div className="col-sm-7 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">
                {tenant.title ? tenant.title : translate('Your APIs center')}
              </h1>
              <Description description={tenant.description} />
            </div>
          </div>
        </section>
        <ApiList
          myTeams={myTeamsRequest.data}
          teamVisible={true}
          redirectToApiPage={redirectToApiPage}
          redirectToEditPage={redirectToEditPage}
        />
      </main>
    );
  } else {
    //FIXME: better display of error
    return (
      <div>Error while fetching teams</div>
    )
  }

}

const Description = (props: any) => {
  const { Translation } = useContext(I18nContext);

  if (!props.description) {
    return (
      <p className="lead">
        <Translation i18nkey="Daikoku description start">Daikoku is the perfect</Translation>
        <a href="https: //www.otoroshi.io">Otoroshi</a>
        <Translation i18nkey="Daikoku description end">
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.description || '') }}></div>
  );
};
