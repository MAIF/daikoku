import { constraints, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from "lodash/debounce";
import { useContext, useEffect, useMemo, useState } from 'react';
import Pagination from "react-paginate";
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import Plus from 'react-feather/dist/icons/plus'

import Select, { components } from 'react-select';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { IAuthorizedEntities, IOtoroshiSettings, ISimpleOtoroshiSettings, ITeamFullGql, ITeamSimple, ResponseError, isError } from '../../../types';
import { teamSchema } from '../../backoffice/teams/TeamEdit';
import { AvatarWithAction, Can, tenant as TENANT, manage } from '../../utils';
import { GlobalContext } from '../../../contexts/globalContext';

export const TeamList = () => {
  const { tenant } = useTenantBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { openFormModal, alert } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const { customGraphQLClient } = useContext(GlobalContext);

  const [search, setSearch] = useState<string>("");
  const limit = 11;
  const [page, setPage] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0)
  const dataRequest = useQuery<{ teams: Array<ITeamFullGql>, total: number }>({
    queryKey: ["teams",
      search,
      limit,
      offset],
    queryFn: ({ queryKey }) => {
      return customGraphQLClient.request<{ teamsPagination: { teams: Array<ITeamFullGql>, total: number } }>(
        `query getAllteams ($research: String, $limit: Int, $offset: Int) {
          teamsPagination (research: $research, limit: $limit, offset: $offset){
            teams {
              _id
              _humanReadableId
              name
              avatar
              type
            }
            total
          }
        }`,
        {
          research: queryKey[1],
          limit: queryKey[2],
          offset: queryKey[3]
        }
      ).then(({ teamsPagination }) => {
        return teamsPagination
      })
    },
    gcTime: 0
  })


  const navigate = useNavigate();

  const teamSchemaForAdmin = (team: ITeamSimple, _otoroshis: ISimpleOtoroshiSettings[]) => ({
    ...teamSchema(team, translate),
    apisCreationPermission: {
      type: type.bool,
      defaultValue: false,
      label: translate('APIs creation permission'),
      help: translate('apisCreationPermission.help'),
      visible: !!tenant.creationSecurity
    },
    metadata: {
      type: type.object,
      label: translate('Metadata'),
    },
    authorizedOtoroshiEntities: {
      type: type.object,
      array: true,
      label: translate('Authorized entities'),
      format: format.form,
      schema: {
        otoroshiSettingsId: {
          type: type.string,
          format: format.select,
          label: translate('Otoroshi instance'),
          optionsFrom: () => Promise.resolve(_otoroshis),
          transformer: (s: IOtoroshiSettings) => ({
            label: s.url,
            value: s._id
          }),
          constraints: [
            constraints.required(translate('constraints.required.value'))
          ]
        },
        authorizedEntities: {
          type: type.object,
          visible: (props) => {
            return !!props.rawValues.authorizedOtoroshiEntities[props.informations?.parent?.index || 0].value.otoroshiSettingsId
          },
          deps: ['authorizedOtoroshiEntities.otoroshiSettingsId'],
          render: (props) => OtoroshiEntitiesSelector({ ...props, translate, targetKey: "authorizedOtoroshiEntities" }),
          label: translate('Authorized entities'),
          placeholder: translate('Authorized.entities.placeholder'),
          help: translate('authorized.entities.help'),
          defaultValue: { routes: [], services: [], groups: [] }
        },
      }
    }
  })

  const sanitizeTeamAuthorizedEntities = (team: ITeamSimple) => {
    return Promise.resolve({
      ...team,
      authorizedOtoroshiEntities: (team.authorizedOtoroshiEntities ?? []).reduce<Array<{ otoroshiSettingsId: string, authorizedEntities: IAuthorizedEntities }>>((acc, curr) => {
        if (acc.some(x => x.otoroshiSettingsId === curr.otoroshiSettingsId)) {
          const authorizedEntities = acc.find(x => x.otoroshiSettingsId === curr.otoroshiSettingsId)!.authorizedEntities
          return [
            ...acc.filter(x => x.otoroshiSettingsId !== curr.otoroshiSettingsId),
            {
              otoroshiSettingsId: curr.otoroshiSettingsId,
              authorizedEntities: {
                groups: [...new Set([...curr.authorizedEntities.groups, ...authorizedEntities.groups])],
                services: [...new Set([...curr.authorizedEntities.services, ...authorizedEntities.services])],
                routes: [...new Set([...curr.authorizedEntities.routes, ...authorizedEntities.routes])]
              }
            }]
        } else {
          return [...acc, curr]
        }
      }, [])
    })
  }

  const createNewTeam = () => {
    Promise.all([
      Services.fetchNewTeam(),
      Services.allSimpleOtoroshis(tenant._id)
    ])
      .then(([newTeam, otoroshis]) => {
        const _otoroshis = isError(otoroshis) ? [] : otoroshis
        openFormModal({
          title: translate('Create a new team'),
          actionLabel: translate('Create'),
          schema: teamSchemaForAdmin(newTeam, _otoroshis),
          onSubmit: (data: ITeamSimple) => sanitizeTeamAuthorizedEntities(data)
            .then(team => Services.createTeam(team))
            .then(r => {
              if (r.error) {
                toast.error(r.error)
              } else {
                queryClient.invalidateQueries({ queryKey: ['teams'] });
                toast.info(translate("mailValidation.sent.body"))
                toast.success(translate({ key: "team.created.success", replacements: [data.name] }))
              }
            }),
          value: newTeam
        })
      });
  };


  const deleteTeam = (team: ITeamFullGql) => {
    openFormModal({
      title: translate('Confirm'),
      description: <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">{translate('Warning')}</h4>
        <p>{translate("delete.team.confirm.modal.description.1")}</p>
        <ul>
          <li>{translate("delete.team.confirm.modal.description.2")}</li>
          <li>{translate("delete.team.confirm.modal.description.3")}</li>
          <li>{translate("delete.team.confirm.modal.description.4")}</li>
        </ul>
      </div>,
      schema: {
        confirm: {
          type: type.string,
          label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [team.name] }),
          constraints: [
            constraints.oneOf(
              [team.name],
              translate({ key: 'constraints.type.api.name', replacements: [team.name] })
            ),
          ],
        },
      },
      onSubmit: () => Services.deleteTeam(team._id)
        .then((r) => {
          if (isError(r)) {
            toast.error(r.error)
          } else {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
            toast.success(translate({ key: 'team.deleted.success', replacements: [team.name] }))
          }
        }),
      actionLabel: translate('Confirm')
    })
  };

  const handleChange = (e) => {
    setPage(0)
    setOffset(0)
    setSearch(e.target.value);
  };

  const debouncedResults = useMemo(() => {
    return debounce(handleChange, 500);
  }, []);

  useEffect(() => {
    return () => {
      debouncedResults.cancel();
    };
  }, []);

  const actions = (team: ITeamFullGql) => {
    const basicActions = [
      {
        action: () => deleteTeam(team),
        variant: 'error',
        iconClass: 'fas fa-trash delete-icon',
        tooltip: translate('Delete team'),
        ariaLabel: translate('Delete team'),
      },
      {
        redirect: () => Promise.all([
          Services.teamFull(team._id),
          Services.allSimpleOtoroshis(tenant._id)
        ])
          .then(([teamFull, otoroshis]) => {
            if (isError(teamFull)) {
              return Promise.reject(teamFull)
            } else {
              return { team: teamFull, otoroshis }
            }
          })
          .then(({ team, otoroshis }) => {
            //todo: [ERROR HANDLER] handle otoroshis error
            const _otoroshis = isError(otoroshis) ? [] : otoroshis
            openFormModal({
              title: translate('Update team'),
              actionLabel: translate('Update'),
              schema: teamSchemaForAdmin(team, _otoroshis),
              onSubmit: (teamToUpdate) => {
                return sanitizeTeamAuthorizedEntities(teamToUpdate)
                  .then(teamToUpdate => Services.updateTeam(teamToUpdate))
                  .then(r => {
                    if (r.error) {
                      toast.error(r.error)
                    } else {
                      toast.success(translate({ key: "team.updated.success", replacements: [team.name] }))
                      queryClient.invalidateQueries({ queryKey: ['teams'] });
                    }
                  })
              },
              value: team
            })
          })
          .catch((error: ResponseError) => alert({ title: translate('Error'), message: error.error })),
        iconClass: 'fas fa-pen',
        tooltip: translate('Edit team'),
        ariaLabel: translate('Edit team'),
        actionLabel: translate('Create')
      },
    ];

    if (team.type === 'Personal') {
      return basicActions;
    }

    return [
      ...basicActions,
      {
        action: () => navigate(`/settings/teams/${team._humanReadableId}/members`),
        iconClass: 'fas fa-users',
        tooltip: translate({ key: "Member", plural: true }),
      },
    ];
  };
  const handlePageClick = (data) => {
    setPage(data.selected);
    setOffset(data.selected)
  };



  return (<Can I={manage} a={TENANT} dispatchError>
    <div className="row">
      <div className="col">
        <div className="d-flex justify-content-between align-items-center">
          <h1 id="title">
            <Translation i18nkey="Teams">Teams</Translation>
          </h1>
          <div className="col-5">
            <input
              placeholder={translate('Find a team')}
              className="form-control"
              onChange={(e) => {
                debouncedResults(e)
              }} />
          </div>
        </div>
        {!dataRequest.isLoading && !dataRequest.isError && dataRequest.data &&
          <div className="d-flex flex-wrap section" role="list" aria-labelledby="title">{
            dataRequest.data.teams.map((team) => {
              return (
                <AvatarWithAction key={team._id} avatar={team.avatar} name={team.name} infos={<>
                  <span className=" section team__name text-truncate">{team.name}</span>
                </>} actions={actions(team)} />)
            })}
            <div className="avatar-with-action new-team-button" aria-label={translate('Create a new team')}>
              <div className="container">
                <div className="avatar__container"
                  title={translate('Create a new team')}
                  onClick={createNewTeam}><Plus /></div>
              </div>
            </div>
            <div className="apis__pagination d-flex justify-content-center align-items-center" style={{ width: '100%' }}>
              <Pagination
                previousLabel={translate('Previous')}
                nextLabel={translate('Next')}
                breakLabel={'...'}
                breakClassName={'break'}
                pageCount={Math.ceil(dataRequest.data.total / limit)}
                marginPagesDisplayed={1}
                pageRangeDisplayed={5}
                onPageChange={(data) => handlePageClick(data)}
                containerClassName={'pagination'}
                pageClassName={'page-selector'}
                forcePage={page}
                activeClassName={'active'} />
            </div>
          </div>}
      </div>
    </div>
  </Can>);
};

const OtoroshiEntitiesSelector = ({
  rawValues,
  informations,
  onChange,
  translate
}: any) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [services, setServices] = useState<Array<any>>([]);
  const [routes, setRoutes] = useState<Array<any>>([]);
  const [disabled, setDisabled] = useState<boolean>(true);
  const [value, setValue] = useState<any>(undefined);

  const { Translation } = useContext(I18nContext);

  useEffect(() => {
    const otoroshiTarget = rawValues.authorizedOtoroshiEntities[informations?.parent?.index || 0].value

    if (otoroshiTarget && otoroshiTarget.otoroshiSettingsId) {
      Promise.all([
        Services.getOtoroshiGroupsAsTeamAdmin(
          rawValues._id,
          otoroshiTarget.otoroshiSettingsId
        ),
        Services.getOtoroshiServicesAsTeamAdmin(
          rawValues._id,
          otoroshiTarget.otoroshiSettingsId
        ),
        Services.getOtoroshiRoutesAsTeamAdmin(
          rawValues._id,
          otoroshiTarget.otoroshiSettingsId
        )
      ])
        .then(([groups, services, routes]) => {
          if (!groups.error)
            setGroups(groups.map((g: any) => ({
              label: g.name,
              value: g.id,
              type: 'group'
            })));
          else setGroups([]);
          if (!services.error)
            setServices(services.map((g: any) => ({
              label: g.name,
              value: g.id,
              type: 'service'
            })));
          else setServices([]);
          if (!routes.error)
            setRoutes(routes.map((g: any) => ({
              label: g.name,
              value: g.id,
              type: 'route'
            })));
          else setRoutes([]);
        })
        .catch(() => {
          setGroups([]);
          setServices([]);
          setRoutes([]);
        });
    }
    setDisabled(!otoroshiTarget?.otoroshiSettingsId);
  }, [rawValues?.authorizedOtoroshiEntities]);

  useEffect(() => {
    if (groups && services && routes) {
      setLoading(false);
    }
  }, [services, groups, routes]);

  useEffect(() => {
    if (!!groups && !!services && !!routes && !!rawValues.authorizedOtoroshiEntities[informations?.parent?.index || 0].value) {
      const v = rawValues.authorizedOtoroshiEntities[informations?.parent?.index || 0].value
      setValue([
        ...v.authorizedEntities.groups.map((authGroup: any) => (groups as any).find((g: any) => g.value === authGroup)),
        ...(v.authorizedEntities.services || []).map((authService: any) => (services as any).find((g: any) => g.value === authService)),
        ...(v.authorizedEntities.routes || []).map((authRoute: any) => (routes as any).find((g: any) => g.value === authRoute))
      ].filter((f) => f));
    }
  }, [rawValues, groups, services, routes]);

  const onValueChange = (v: any) => {
    if (!v) {
      onChange(null);
      setValue(undefined);
    } else {
      const value = v.reduce(
        (acc: any, entitie: any) => {
          switch (entitie.type) {
            case 'group':
              return {
                ...acc,
                groups: [...acc.groups, groups.find((g: any) => g.value === entitie.value).value],
              };
            case 'service':
              return {
                ...acc,
                services: [...acc.services, services.find((s: any) => s.value === entitie.value).value],
              };
            case 'route':
              return {
                ...acc,
                routes: [...acc.routes, routes.find((s: any) => s.value === entitie.value).value],
              };
          }
        },
        { groups: [], services: [], routes: [] }
      );
      setValue([
        ...value.groups.map((authGroup: any) => groups.find((g: any) => g.value === authGroup)),
        ...value.services.map((authService: any) => services.find((g: any) => g.value === authService)),
        ...value.routes.map((authRoute: any) => routes.find((g: any) => g.value === authRoute)),
      ]);
      onChange(value);
    }
  };

  const groupedOptions = [
    { label: 'Service groups', options: groups },
    { label: 'Services', options: services },
    { label: 'Routes', options: routes }
  ];

  const formatGroupLabel = (data) => (
    <div className="groupStyles">
      <span>{data.label}</span>
      <span className="groupBadgeStyles">{data.options.length}</span>
    </div>
  )

  return (<div>
    <Select
      id={`input-label`}
      isMulti
      name={`search-label`}
      isLoading={loading}
      isDisabled={disabled && !loading}
      placeholder={translate('Authorized.entities.placeholder')} //@ts-ignore //FIXME
      components={(props: any) => <components.Group {...props} />}
      formatGroupLabel={formatGroupLabel}
      options={groupedOptions}
      value={value}
      onChange={onValueChange}
      classNamePrefix="reactSelect"
      className="reactSelect" />
    <div className="col-12 d-flex flex-row mt-3">
      <div className="d-flex flex-column flex-grow-1">
        <strong className="reactSelect__group-heading">
          <Translation i18nkey="authorized.groups">Services Groups</Translation>
        </strong>
        {!!value &&
          value.filter((x: any) => x.type === 'group')
            .map((g: any, idx: any) => (<span className="p-2" key={idx}>
              {g.label}
            </span>))}
      </div>
      <div className="d-flex flex-column flex-grow-1">
        <strong className="reactSelect__group-heading">
          <Translation i18nkey="authorized.services">Services</Translation>
        </strong>
        {!!value &&
          value.filter((x: any) => x.type === 'service')
            .map((g: any, idx: any) => (<span className="p-2" key={idx}>
              {g.label}
            </span>))}
      </div>
      <div className="d-flex flex-column flex-grow-1">
        <strong className="reactSelect__group-heading">
          <Translation i18nkey="authorized.routes">Routes</Translation>
        </strong>
        {!!value &&
          value.filter((x: any) => x.type === 'route')
            .map((g: any, idx: any) => (<span className="p-2" key={idx}>
              {g.label}
            </span>))}
      </div>
    </div>
  </div>);
};
