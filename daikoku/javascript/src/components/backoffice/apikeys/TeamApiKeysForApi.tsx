import {useQuery} from '@tanstack/react-query';
import sortBy from 'lodash/sortBy';
import {
  ChevronLeft, ChevronRight, Ellipsis,
} from "lucide-react";
import {useContext, useEffect, useState, useRef} from 'react';
import {Link, useParams} from 'react-router-dom';

import {
  I18nContext,
  useTeamBackOffice,
} from '../../../contexts';
import {GlobalContext} from '../../../contexts/globalContext';
import * as Services from '../../../services';
import {
  IApi,
  ITeamSimple,
  isError
} from '../../../types';
import {
  Can,
  Spinner,
  apikey,
  read
} from '../../utils';
import {QUERY_KEYS} from "../../../constants/queryKeys";
import Pagination from "../../utils/Pagination";
import debounce from "lodash/debounce";
import { KeyringCard } from './KeyringCard';
import {IKeyringForApiGql, ApiKeysListForApiProps} from "../../../types";


export const TeamApiKeysForApi = () => {
  const {currentTeam} = useTeamBackOffice();
  const {Translation} = useContext(I18nContext);

  const params = useParams();

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ApiKeys`;
  }, [currentTeam]);

  const apiQuery = useQuery({
    queryKey: ['data', 'visibleApi', params.apiId, params.versionId],
    queryFn: () =>
      Services.getTeamVisibleApi(
        (currentTeam as ITeamSimple)._id,
        params.apiId!,
        params.versionId!
      ),
    enabled: !!currentTeam && !isError(currentTeam),
  });

  const teamQuery = useQuery({
    queryKey: ['data', 'team'],
    queryFn: () => Services.team((apiQuery.data as IApi).team),
    enabled: !!apiQuery.data && !isError(apiQuery.data),
  });


  if (apiQuery.isLoading || teamQuery.isLoading) {
    return <Spinner/>
  } else if (apiQuery.data && !isError(apiQuery.data) && teamQuery.data && !isError(teamQuery.data)) {
    const apiLink = `/${teamQuery.data._humanReadableId}/${apiQuery.data._humanReadableId}/${apiQuery.data.currentVersion}/description`;

    return (
      <div>
        <div className="col-12 d-flex align-items-center">
          <h1>
            <Translation i18nkey="Api keys for">Api keys for</Translation>
            &nbsp;
            <Link
              to={apiLink}
              className="cursor-pointer underline"
            >{apiQuery.data!.name}</Link>
          </h1>
        </div>
        <ApiKeysListForApi
          api={apiQuery.data!}
          team={(currentTeam as ITeamSimple)}
          ownerTeam={teamQuery.data}
        />
      </div>
    )
  }

}


export const ApiKeysListForApi = (props: ApiKeysListForApiProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searched, setSearched] = useState('');
  const pageNumber = 6;
  const [page, setPage] = useState(0);

  const {translate} = useContext(I18nContext);
  const {customGraphQLClient} = useContext(GlobalContext);

  const keyringsQuery = useQuery({
    queryKey: [...QUERY_KEYS.apiKeyrings(props.team._id, props.api._id), pageNumber, page, searched],
    queryFn: () =>
      customGraphQLClient.request<{
        keyrings: { keyringsWithSubCountAndRotation: Array<IKeyringForApiGql>, totalFiltered: number, total: number };
      }>(Services.graphql.getApiKeyrings, {
        apiId: props.api._id,
        teamId: props.team._id,
        filter: searched,
        limit: pageNumber,
        offset: pageNumber * page,
      }),
    // select: (d) => d.keyrings.keyringsWithSubCountAndRotation
  });


  let List;
  if (keyringsQuery.isLoading) {
    List = <Spinner/>;
  } else if (keyringsQuery.data && !isError(keyringsQuery.data)) {
    const keyrings = keyringsQuery.data.keyrings.keyringsWithSubCountAndRotation;
    const sorted = sortBy(keyrings, [
      (k) => (k.customName ?? k.apiKey.clientName).toLowerCase(),
    ]);
    const total = keyringsQuery.data?.keyrings.total ?? 0;
    const totalFiltered = keyringsQuery.data?.keyrings.totalFiltered ?? total;

    if (sorted.length > 0) {
      List =
        <div className="col-12">
          <div className="mt-2">
            <span className="small">
              <span className="fw-bold">{totalFiltered}</span>
              {totalFiltered < total
                ? ` ${translate({key: "keyring.count", plural: totalFiltered > 1})} (sur ${total})`
                : ` ${translate({key: "keyring.count", plural: totalFiltered > 1})}`}
            </span>
          </div>
        <div className="d-flex flex-row flex-wrap keyring-card-container">
          {
            sorted.map((keyring) => {
              return (
                <KeyringCard
                  key={keyring._id}
                  api={props.api}
                  currentTeam={props.team}
                  keyring={keyring}
                />
              )
            })
          }
        </div>
        <div className="dynamic-table__pagination position-relative d-flex align-items-center mt-3">
          <div className="flex-grow-1 d-flex align-items-center justify-content-center" style={{gap: 16}}>
            <Pagination
              containerClassName="pagination pagination--ds"
              previousLabel={<ChevronLeft/>}
              nextLabel={<ChevronRight/>}
              breakLabel={<Ellipsis/>}
              breakClassName="break"
              breakLinkClassName="btn --ghost"
              pageCount={Math.ceil(keyringsQuery.data.keyrings.totalFiltered / pageNumber)}
              forcePage={page}
              marginPagesDisplayed={1}
              pageRangeDisplayed={3}
              onPageChange={(data) => setPage(data.selected)}
              pageClassName="page-selector"
              pageLinkClassName="btn --ghost"
              previousLinkClassName="btn --tertiary --icon"
              nextLinkClassName="btn --tertiary --icon"
              disabledLinkClassName="--disabled"
              activeClassName="active"
            />
          </div>
        </div>
      </div>
    } else {
      List = <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
        <div>{translate('keyring.filter.empty')}</div>
        <button
          className="btn --primary"
          onClick={() => {
            setSearched('')
            if (searchInputRef.current) {
              searchInputRef.current.value = ''
            }
          }}>
          {translate('table.filters.clear.label')}
        </button>
      </div>
    }
  }

  return (
    <Can I={read} a={apikey} team={props.team} dispatchError>
      <div className="col-6 mt-4 mb-2">
        <input
          type="text"
          className="form-control col-5"
          placeholder={translate('Search your apiKey...')}
          aria-label="Search your apikey"
          ref={searchInputRef}
          onChange={debounce(e => {
            setSearched(e.target.value)
            setPage(0)
            }, 500
          )}
        />
      </div>
      {List}
    </Can>
  );
};
